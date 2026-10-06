import { WebSocket, WebSocketServer } from 'ws';
import {
  getNewPools,
  getTrendingPools,
  getTopPoolsByVolume,
  updatePoolFromWebSocket,
} from '../providers/poolProvider.js';
import config from '../config.js';
import { logThrottled } from '../utils/logger.js';

export const WS_PATH = '/ws';
export const HEARTBEAT_MS = 30_000;

export const DEFAULT_FEATURES = {
  'new-pools': { fetch: getNewPools, intervalMs: 45_000 },
  trending: { fetch: getTrendingPools, intervalMs: 120_000 },
  'high-volume': { fetch: getTopPoolsByVolume, intervalMs: 60_000 },
};

const FEATURE_TO_CATEGORY = {
  'new-pools': 'new',
  trending: 'trending',
  'high-volume': 'highVolume',
};

export function attachPoolPusher(server, overrides = {}) {
  const features = { ...DEFAULT_FEATURES };
  for (const [name, next] of Object.entries(overrides)) {
    if (features[name]) features[name] = { ...features[name], ...next };
  }

  const wss = new WebSocketServer({ noServer: true });
  const stateByFeature = {};
  for (const feature of Object.keys(features)) {
    stateByFeature[feature] = { members: new Set(), timer: null, inFlight: false, generation: 0 };
  }

  function isOriginAllowed(origin) {
    if (!origin) return true;
    if (config.allowAllOrigins) return true;
    return Boolean(Array.isArray(config.corsOrigins) && config.corsOrigins.includes(origin));
  }

  async function buildPayload(feature) {
    try {
      const pools = await features[feature].fetch(1);
      return {
        feature,
        network: config.network,
        page: 1,
        count: Array.isArray(pools) ? pools.length : 0,
        pools: Array.isArray(pools) ? pools : [],
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logThrottled('WS', `${feature}:error`, `${feature} fetch failed: ${error.message}`);
      return null;
    }
  }

  function broadcast(feature, message) {
    const data = JSON.stringify(message);
    for (const member of stateByFeature[feature].members) {
      if (member.readyState === WebSocket.OPEN) member.send(data);
    }
  }

  async function tick(feature) {
    const state = stateByFeature[feature];
    if (state.inFlight || state.members.size === 0) return;
    state.inFlight = true;
    const generation = state.generation;
    try {
      const payload = await buildPayload(feature);
      if (payload && state.generation === generation) {
        broadcast(feature, { type: 'update', ...payload });
      }
    } finally {
      state.inFlight = false;
    }
  }

  function startFeature(feature) {
    const state = stateByFeature[feature];
    if (state.timer) return;
    state.timer = setInterval(() => tick(feature), features[feature].intervalMs);
    if (state.timer.unref) state.timer.unref();
  }

  function stopFeature(feature) {
    const state = stateByFeature[feature];
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = null;
  }

  function unsubscribe(ws, feature) {
    const state = stateByFeature[feature];
    if (!state) return;
    if (state.members.delete(ws) && state.members.size === 0) {
      state.generation += 1;
      stopFeature(feature);
    }
  }

  function removeClient(ws) {
    for (const feature of Object.keys(features)) {
      unsubscribe(ws, feature);
    }
  }

  async function sendSnapshot(ws, feature) {
    const state = stateByFeature[feature];
    const payload = await buildPayload(feature);
    if (payload && state.members.has(ws)) ws.send(JSON.stringify({ type: 'snapshot', ...payload }));
  }

  function handleMessage(ws, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const { type, feature } = message ?? {};
    if (type === 'subscribe' && features[feature]) {
      stateByFeature[feature].members.add(ws);
      startFeature(feature);
      sendSnapshot(ws, feature);
    } else if (type === 'unsubscribe' && features[feature]) {
      unsubscribe(ws, feature);
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    if (!isOriginAllowed(request.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.send(JSON.stringify({
      type: 'hello',
      features: Object.keys(features),
      heartbeatMs: HEARTBEAT_MS,
    }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => handleMessage(ws, raw));

    ws.on('close', () => removeClient(ws));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  if (heartbeat.unref) heartbeat.unref();

  function close() {
    for (const feature of Object.keys(features)) {
      stopFeature(feature);
    }
    clearInterval(heartbeat);
    for (const ws of wss.clients) {
      ws.terminate();
    }
    server.removeAllListeners('upgrade');
    wss.close();
  }

  return {
    wss,
    close,
    features,
    stateByFeature,
  };
}
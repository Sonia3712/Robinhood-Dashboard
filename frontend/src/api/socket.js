const SOCKET_PATH = '/ws';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

let socket = null;
let reconnectTimer = null;
let reconnectDelayMs = RECONNECT_BASE_MS;
let connected = false;

const handlers = new Map();
const subscribed = new Set();
const statusListeners = new Set();

function socketUrl() {
  const base = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      'VITE_API_URL is not set. Add VITE_API_URL=http://localhost:3001 to frontend/.env.local.',
    );
  }
  return `${base.replace(/^http/, 'ws')}${SOCKET_PATH}`;
}

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  for (const listener of statusListeners) listener(connected);
}

function dispatch(feature, payload) {
  const set = handlers.get(feature);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (error) {
      console.error('[WS] handler error:', error);
    }
  }
}

function handleMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message?.type === 'update' || message?.type === 'snapshot') {
    dispatch(message.feature, message);
  }
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function resubscribeAll() {
  for (const feature of subscribed) send({ type: 'subscribe', feature });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
}

function connect() {
  if (socket) {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) return;
    socket.close();
  }

  let url;
  try {
    url = socketUrl();
  } catch (error) {
    console.error('[WS]', error.message);
    return;
  }

  let ws;
  try {
    ws = new WebSocket(url);
    socket = ws;
  } catch (error) {
    console.error('[WS] connect failed:', error);
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    reconnectDelayMs = RECONNECT_BASE_MS;
    setConnected(true);
    resubscribeAll();
  });

  ws.addEventListener('message', handleMessage);

  ws.addEventListener('close', () => {
    if (socket === ws) socket = null;
    setConnected(false);
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    if (socket === ws) ws.close();
  });
}

export function subscribeStatus(listener) {
  statusListeners.add(listener);
  listener(connected);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeFeature(feature, handler) {
  let set = handlers.get(feature);
  if (!set) {
    set = new Set();
    handlers.set(feature, set);
  }
  set.add(handler);
  subscribed.add(feature);
  connect();
  send({ type: 'subscribe', feature });

  return () => {
    set.delete(handler);
    if (set.size === 0) {
      subscribed.delete(feature);
      send({ type: 'unsubscribe', feature });
    }
  };
}
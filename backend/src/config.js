// Runtime configuration for the backend server.
//
// Every value is overridable via environment variables so the server can run
// unchanged in local dev, CI and production.
//
// ENVIRONMENT MODEL
// ------------------
// NODE_ENV selects the environment; it defaults to 'development' because this
// service is developed against free, rate-limited public APIs and the whole
// point of a dev run is to see what it is doing. That default is what makes a
// bare `node server.js` observable without any env file at all.
//
// One logging level, deliberately simple: a single line per request
// (timestamp, method, path, status, duration, CACHE=HIT|MISS when applicable).
// Cheap, safe, appropriate in every environment. There is no detailed mode, so
// there is nothing for a misconfigured deploy to leak.

import { fileURLToPath } from 'url';

const DEFAULTS = {
  port: 3001,
  host: '0.0.0.0',
  network: 'robinhood',
  chainId: 4663,
  rpcUrl: 'https://robinhood-rpc.publicnode.com',
  geckoTerminalBaseUrl: 'https://api.geckoterminal.com/api/v2',
  dexScreenerBaseUrl: 'https://api.dexscreener.com/latest/dex',
  // Development is the default so a fresh clone is debuggable with zero setup.
  nodeEnv: 'development',
};

// Origins the browser is allowed to call the API from.
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Env files are resolved relative to this module, not the working directory, so
// `node backend/server.js` and `node server.js` behave identically.
const ENV_LOCAL_PATH = fileURLToPath(new URL('../.env.local', import.meta.url));
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

// Load env files if they exist. Node >= 20.12 can do this without a dependency.
export function loadEnvFile(...paths) {
  if (typeof process.loadEnvFile !== 'function') return false;

  let loaded = false;
  for (const path of paths) {
    try {
      process.loadEnvFile(path);
      loaded = true;
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  return loaded;
}

function toList(value) {
  if (value === undefined || value === null || value === '') return null;
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  // An absent value falls back to the default, but a present-and-unparseable
  // one must surface as NaN so assertValidConfig rejects it. Silently turning
  // `CHAIN_ID=abc` into 4663 is the exact failure this validation exists to stop.
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function loadConfig(env = process.env) {
  const corsOrigins = toList(env.CORS_ORIGINS) ?? DEFAULT_CORS_ORIGINS;
  const nodeEnv = (env.NODE_ENV || '').trim() || DEFAULTS.nodeEnv;
  const isDevelopment = nodeEnv === 'development';

  return {
    nodeEnv,
    isDevelopment,
    port: toInt(env.PORT, DEFAULTS.port),
    host: env.HOST || DEFAULTS.host,
    network: env.NETWORK || DEFAULTS.network,
    chainId: toInt(env.CHAIN_ID, DEFAULTS.chainId),
    rpcUrl: env.RPC_URL || DEFAULTS.rpcUrl,
    geckoTerminalBaseUrl: env.GECKOTERMINAL_BASE_URL || DEFAULTS.geckoTerminalBaseUrl,
    dexScreenerBaseUrl: env.DEXSCREENER_BASE_URL || DEFAULTS.dexScreenerBaseUrl,

    // Compact access line. LOG_REQUESTS is read as a fallback so an existing
    // shell environment keeps working after the rename.
    requestLog: toBool(env.REQUEST_LOG ?? env.LOG_REQUESTS, true),

    // '*' disables origin checking entirely, which is handy for local testing.
    corsOrigins,
    allowAllOrigins: corsOrigins.includes('*'),
  };
}

function isAbsoluteHttpUrl(value) {
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === 'http:' || protocol === 'https:') && Boolean(hostname);
  } catch {
    return false;
  }
}

// JSON.stringify(NaN) is "null", which would hide the value the developer
// actually typed.
function show(value) {
  if (typeof value === 'number' && Number.isNaN(value)) return 'not a number';
  return JSON.stringify(value);
}

export function collectConfigErrors(config) {
  const errors = [];

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push(`PORT: must be an integer 1-65535 (received: ${show(config.port)})`);
  }

  if (!Number.isInteger(config.chainId) || config.chainId < 1) {
    errors.push(`CHAIN_ID: must be a positive integer (received: ${show(config.chainId)})`);
  }

  if (!config.network) {
    errors.push('NETWORK: must not be empty');
  }

  if (!config.nodeEnv) {
    errors.push('NODE_ENV: must not be empty');
  }

  for (const [envName, value] of [
    ['RPC_URL', config.rpcUrl],
    ['GECKOTERMINAL_BASE_URL', config.geckoTerminalBaseUrl],
    ['DEXSCREENER_BASE_URL', config.dexScreenerBaseUrl],
  ]) {
    if (!isAbsoluteHttpUrl(value)) {
      errors.push(`${envName}: must be an absolute http(s) URL (received: ${JSON.stringify(value)})`);
    }
  }

  if (!config.allowAllOrigins) {
    for (const origin of config.corsOrigins) {
      if (!isAbsoluteHttpUrl(origin)) {
        errors.push(
          `CORS_ORIGINS: each entry must be an absolute origin (received: ${JSON.stringify(origin)})`,
        );
      }
    }
  }

  return errors;
}

export function assertValidConfig(config) {
  const errors = collectConfigErrors(config);
  if (errors.length === 0) return config;

  const source = ENV_LOCAL_PATH;
  console.error('[CONFIG] Invalid environment configuration:');
  for (const error of errors) console.error(`  - ${error}`);
  console.error(`\nFix ${source} (or the shell environment) and restart. The server did not start.`);

  process.exit(1);
}

const shellEnv = { ...process.env };

loadEnvFile(ENV_LOCAL_PATH, ENV_PATH);

// Put the real environment back on top so a file value cannot shadow it.
Object.assign(process.env, shellEnv);

const config = loadConfig();

assertValidConfig(config);

export default config;

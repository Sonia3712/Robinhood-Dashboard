import { fileURLToPath } from 'url';

const REQUIRED_TEXT_VARS = {
  NODE_ENV: 'nodeEnv',
  HOST: 'host',
  NETWORK: 'network',
  GECKOTERMINAL_BASE_URL: 'geckoTerminalBaseUrl',
  DEXSCREENER_BASE_URL: 'dexScreenerBaseUrl',
};

const REQUIRED_NUM_VARS = ['PORT', 'CHAIN_ID'];

const ENV_LOCAL_PATH = fileURLToPath(new URL('../.env.local', import.meta.url));
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

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
  if (value === undefined || value === null) return null;
  const list = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function loadConfig(env = process.env) {
  const text = (name) => (env[name] || '').trim() || null;
  const nodeEnv = text('NODE_ENV');

  return {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',

    port: toInt(env.PORT),
    chainId: toInt(env.CHAIN_ID),

    host: text('HOST'),
    network: text('NETWORK'),
    geckoTerminalBaseUrl: text('GECKOTERMINAL_BASE_URL'),
    dexScreenerBaseUrl: text('DEXSCREENER_BASE_URL'),

    corsOrigins: toList(env.CORS_ORIGINS) ?? [],
    allowAllOrigins: (env.CORS_ORIGINS || '').trim() === '*',

    requestLog: toBool(env.REQUEST_LOG ?? env.LOG_REQUESTS, true),
  };
}

function show(value) {
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'number' && Number.isNaN(value)) return 'not a number';
  return JSON.stringify(value);
}

export function collectConfigErrors(config) {
  const errors = [];

  for (const [name, key] of Object.entries(REQUIRED_TEXT_VARS)) {
    if (!config[key]) errors.push(`${name}: is required but was not set`);
  }

  for (const name of REQUIRED_NUM_VARS) {
    const value = config[name === 'PORT' ? 'port' : 'chainId'];
    if (value === null) errors.push(`${name}: is required but was not set`);
    else if (!Number.isInteger(value)) {
      errors.push(`${name}: must be an integer (received: ${show(value)})`);
    }
  }

  if (!config.allowAllOrigins && config.corsOrigins.length === 0) {
    errors.push(
      'CORS_ORIGINS: is required but was not set'
        + ' (comma-separated origins, or * to allow any)',
    );
  }

  return errors;
}

export function assertValidConfig(config) {
  const errors = collectConfigErrors(config);
  if (errors.length === 0) return config;

  console.error('[CONFIG] Required configuration is missing or unusable:');
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    '\nRequired: '
      + [
        ...Object.keys(REQUIRED_TEXT_VARS),
        ...REQUIRED_NUM_VARS,
        'CORS_ORIGINS',
      ].join(', '),
  );
  console.error(
    `Set them in ${ENV_LOCAL_PATH} (or the shell environment) and restart.`
      + '\nThe server did not start and no port was opened.',
  );

  process.exit(1);
}

const shellEnv = { ...process.env };

loadEnvFile(ENV_LOCAL_PATH, ENV_PATH);

Object.assign(process.env, shellEnv);

const config = loadConfig();

assertValidConfig(config);

export default config;

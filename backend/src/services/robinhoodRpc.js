import { ethers } from 'ethers';
import { rpcRateLimiter } from '../utils/rateLimiter.js';
import { createCache, fetchCached } from '../utils/cache.js';
import { requestJson } from './httpClient.js';
import { toLowerCaseAddress, int } from '../utils/normalize.js';
import config from '../config.js';

const contractCodeCache = createCache();
const erc20MetadataCache = createCache();

const RPC_URL = config.rpcUrl;
const CHAIN_ID = config.chainId;

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];

class RobinhoodRpcClient {
  constructor() {
    this.provider = null;
    this.initPromise = null;
  }

  get initialized() {
    return this.provider !== null;
  }

  async init() {
    if (this.initialized) return this.provider;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.provider = new ethers.JsonRpcProvider(RPC_URL, {
        chainId: CHAIN_ID,
        name: config.network,
      });

      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        throw new Error(
          `RPC chain mismatch: expected ${CHAIN_ID}, got ${network.chainId}`,
        );
      }

      return this.provider;
    })();

    try {
      return await this.initPromise;
    } catch (error) {
      this.provider = null;
      this.initPromise = null;
      throw error;
    }
  }

  async call(method, params = [], signal) {
    return rpcRateLimiter.execute(async (rateLimitSignal) => {
      const data = await requestJson(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
        signal: signal ?? rateLimitSignal,

        label: 'RPC',
        displayUrl: method,
      });

      if (data.error) {
        const error = new Error(data.error.message || `RPC error for ${method}`);
        error.code = data.error.code;
        throw error;
      }

      return data.result;
    });
  }

  async isContract(address, signal) {
    const key = `is-contract:${toLowerCaseAddress(address)}`;
    const code = await fetchCached(
      contractCodeCache,
      key,
      () => this.call('eth_getCode', [address, 'latest'], signal),
      3600_000,
    );
    return typeof code === 'string' && code !== '0x' && code.length > 2;
  }

  async getTokenMetadata(address, signal) {
    const key = `erc20:${toLowerCaseAddress(address)}`;

    return fetchCached(erc20MetadataCache, key, async () => {
      const provider = await this.init();
      const contract = new ethers.Contract(address, ERC20_ABI, provider);

      const [name, symbol, decimals, totalSupply] = await Promise.allSettled([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
      ]);

      const value = (result) => (result.status === 'fulfilled' ? result.value : null);

      return {
        name: value(name) || null,
        symbol: value(symbol) || null,
        decimals: int(value(decimals)),
        totalSupply: value(totalSupply) !== null ? String(value(totalSupply)) : null,
      };
    }, 3600_000);
  }
}

export const rpcClient = new RobinhoodRpcClient();
export default rpcClient;

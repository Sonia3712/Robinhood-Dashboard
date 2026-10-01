

import { ethers } from 'ethers';
import { rpcRateLimiter } from '../utils/rateLimiter.js';
import { createCache, fetchCached } from '../utils/cache.js';

const blockCache = createCache();
const contractCodeCache = createCache();
const erc20MetadataCache = createCache();
const globalCache = createCache();
import { requestJson } from './httpClient.js';
import { toLowerCaseAddress, int } from '../utils/normalize.js';
import config from '../config.js';

const RPC_URL = config.rpcUrl;
const CHAIN_ID = config.chainId;

// Read-only ERC-20 surface.
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

  // Idempotent and safe to call concurrently: every caller awaits the same
  // promise instead of opening a second provider.
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

  // Generic JSON-RPC call with rate limiting and retry.
  async call(method, params = [], signal) {
    return rpcRateLimiter.execute(async (rateLimitSignal) => {
      const data = await requestJson(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
        signal: signal ?? rateLimitSignal,
        // The RPC endpoint is a public URL; the method name is the useful part
        // of this error and keeps the endpoint out of user-visible output.
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

  // True when the address has deployed bytecode on Robinhood Chain.
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

  async getCode(address, signal) {
    const key = `code:${toLowerCaseAddress(address)}`;
    return fetchCached(
      contractCodeCache,
      key,
      () => this.call('eth_getCode', [address, 'latest'], signal),
      3600_000,
    );
  }

  /**
   * ERC-20 metadata. Every field is coerced to a JSON-safe type — ethers v6
   * returns `decimals` as a bigint, which used to reach res.json() and throw
   * "Do not know how to serialize a BigInt", turning every address search into
   * an HTTP 500.
   */
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

  async getBlockNumber() {
    return fetchCached(blockCache, 'latest-block', async () => {
      const blockHex = await this.call('eth_blockNumber');
      return int(blockHex) !== null ? Number.parseInt(blockHex, 16) : null;
    }, 30_000);
  }

  async getBlock(blockNumber, includeTransactions = false) {
    const key = `block:${blockNumber}:${includeTransactions}`;
    return fetchCached(blockCache, key, async () => {
      const tag = typeof blockNumber === 'number' ? `0x${blockNumber.toString(16)}` : blockNumber;
      return this.call('eth_getBlockByNumber', [tag, includeTransactions]);
    }, 30_000);
  }

  async getTransactionReceipt(txHash) {
    return fetchCached(
      globalCache,
      `receipt:${txHash}`,
      () => this.call('eth_getTransactionReceipt', [txHash]),
      3600_000,
    );
  }

  async getLogs(filter) {
    return this.call('eth_getLogs', [filter]);
  }

  async batch(calls) {
    return rpcRateLimiter.execute(async () => {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          calls.map((call, index) => ({
            jsonrpc: '2.0',
            method: call.method,
            params: call.params,
            id: index,
          })),
        ),
      });

      if (!response.ok) {
        const error = new Error(`RPC batch ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const results = await response.json();
      if (!Array.isArray(results)) return [];
      return results.map((result) => result?.result ?? null);
    });
  }
}

export const rpcClient = new RobinhoodRpcClient();
export default rpcClient;

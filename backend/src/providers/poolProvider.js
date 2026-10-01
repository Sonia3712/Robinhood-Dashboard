

import { geckoTerminalClient } from '../services/geckoTerminal.js';
import { dexScreenerClient } from '../services/dexScreener.js';
import { NETWORK, toLowerCaseAddress } from '../utils/normalize.js';

export function getNewPools(page = 1) {
  return geckoTerminalClient.getNewPools(page);
}

export function getTrendingPools(page = 1) {
  return geckoTerminalClient.getTrendingPools(page);
}

export function getTopPoolsByVolume(page = 1) {
  return geckoTerminalClient.getTopPoolsByVolume(page);
}

/**
 * Pool by address. GeckoTerminal is the index of record; DEX Screener is only
 * used when GeckoTerminal has no listing for the address.
 */
export async function getPoolByAddress(poolAddress) {
  const address = toLowerCaseAddress(poolAddress);
  if (!address) return null;

  try {
    const pool = await geckoTerminalClient.getPool(address);
    if (pool) return pool;
  } catch (error) {
    console.warn(`[POOLS] GeckoTerminal lookup failed for ${address}:`, error.message);
  }

  try {
    return await dexScreenerClient.getPair(NETWORK, address);
  } catch (error) {
    console.warn(`[POOLS] DEX Screener fallback failed for ${address}:`, error.message);
    return null;
  }
}

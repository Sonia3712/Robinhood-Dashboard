import alandaleLogo from '../assets/dex/alandale.svg';
import bankrLogo from '../assets/dex/bankr.svg';
import ponsLogo from '../assets/dex/pons.png';
import ramsesLogo from '../assets/dex/ramses.png';
import uniswapLogo from '../assets/dex/uniswap.svg';
import upLogo from '../assets/dex/up.svg';
import { getBrand, resolveBrandKey } from './dexBrands';

const ASSETS = {
  uniswap: uniswapLogo,
  ramses: ramsesLogo,
  pons: ponsLogo,
  bankr: bankrLogo,
  alandale: alandaleLogo,
  up: upLogo,
};

/**
 * Returns the real local logo for a provider `dex`, or null when no asset is
 * shipped for that brand. The DEX chips and the All DEXes row render this img
 * directly; the neutral tile is the caller's fallback.
 */
export function getDexImage(dex) {
  const key = resolveBrandKey(dex);
  if (!key) return null;

  const brand = getBrand(key);
  const src = ASSETS[key];
  if (!src || !brand) return null;

  return { src, brand: brand.label, key };
}

/**
 * Human-readable description of the resolved logo, used by the automated
 * verification script and diagnostics, e.g. "ramses.png (Ramses)".
 */
export function describeDexLogo(dex) {
  const result = getDexImage(dex);
  if (!result) return null;
  return `${result.src} (${result.brand})`;
}
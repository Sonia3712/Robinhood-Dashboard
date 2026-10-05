import { logThrottled } from './logger.js';

const THROTTLE_WINDOW_MS = 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout(fn, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([Promise.resolve().then(fn), timeout]).finally(() => clearTimeout(timeoutId));
}

export class RateLimiter {
  constructor(options = {}) {
    this.name = options.name || 'api';
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.timeout = options.timeout || 10000;
    this.retryBudget = options.retryBudget ?? 3;
    this.minIntervalMs = options.minIntervalMs ?? 0;

    this.running = 0;
    this.queue = [];
    this.retryTimestamps = [];
    this.nextStartAt = 0;
    this.pausedUntil = 0;
  }

  pause(ms) {
    const until = Date.now() + Math.max(0, ms);
    if (until > this.pausedUntil) this.pausedUntil = until;
    return this.pausedUntil - Date.now();
  }

  get isPaused() {
    return this.pausedUntil > Date.now();
  }

  async acquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0) {
      this.running++;
      const next = this.queue.shift();
      next();
    }
  }

  #consumeRetryBudget() {
    const now = Date.now();
    this.retryTimestamps = this.retryTimestamps.filter((t) => now - t < THROTTLE_WINDOW_MS);
    if (this.retryTimestamps.length >= this.retryBudget) return false;
    this.retryTimestamps.push(now);
    return true;
  }

  async #waitForTurn() {
    await this.acquire();

    let waitMs = 0;

    if (this.pausedUntil > Date.now()) {
      waitMs = this.pausedUntil - Date.now();
    }

    if (this.minIntervalMs > 0) {
      const now = Date.now();
      const earliest = Math.max(now, this.nextStartAt);
      this.nextStartAt = earliest + this.minIntervalMs;
      waitMs = Math.max(waitMs, earliest - now);
    }

    if (waitMs > 0) await sleep(waitMs);
  }

  async execute(fn, meta = {}) {
    await this.#waitForTurn();
    try {
      return await this.#executeWithRetry(fn, meta);
    } finally {
      this.release();
    }
  }

  #describe(meta) {
    const parts = [this.name];
    if (meta?.endpoint) parts.push(meta.endpoint);
    if (meta?.page !== undefined && meta?.page !== null) parts.push(`page=${meta.page}`);
    return parts.join(' ');
  }

  #backoffFor(error, attempt) {
    const retryAfterMs = parseRetryAfter(error?.retryAfter);
    if (retryAfterMs !== null && retryAfterMs > 0) return Math.min(retryAfterMs, this.maxDelay);
    return Math.min(this.baseDelay * 2 ** attempt + Math.random() * 500, this.maxDelay);
  }

  async #executeWithRetry(fn, meta) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        if (attempt > 0) {
          logThrottled(
            'RATE',
            `${this.#describe(meta)}:recovered`,
            `${this.#describe(meta)} recovered after ${attempt} retr${attempt === 1 ? 'y' : 'ies'}`,
          );
        }
        return result;
      } catch (error) {
        lastError = error;
        clearTimeout(timeoutId);

        if (error?.name === 'AbortError') throw error;
        if (error?.status >= 400 && error?.status < 500 && error?.status !== 429) {
          throw error;
        }

        if (attempt < this.maxRetries && this.#consumeRetryBudget()) {
          const backoffMs = this.#backoffFor(error, attempt);

          if (error?.status === 429) {
            error.retryAfterMs = backoffMs;
            this.pause(backoffMs);
            logThrottled(
              'RATE',
              `${this.#describe(meta)}:429`,
              `${this.#describe(meta)} HTTP 429, pausing provider and retrying in `
              + `${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${this.maxRetries})`,
            );
          }

          await sleep(backoffMs);
          continue;
        }

        logThrottled(
          'RATE',
          `${this.#describe(meta)}:failed`,
          `${this.#describe(meta)} failed after ${attempt + 1} attempt(s): `
          + `${error?.message ?? error}`,
          10_000,
        );
        throw error;
      }
    }

    throw lastError;
  }
}

function parseRetryAfter(value) {
  if (value === undefined || value === null || value === '') return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.min(Math.max(asDate - Date.now(), 0), 60_000);

  return null;
}

// GeckoTerminal's public API is aggressively throttled and answers page numbers
// beyond its maximum with HTTP 429, so requests are spaced and serialized.
export const geckoTerminalRateLimiter = new RateLimiter({
  name: 'geckoterminal',
  maxConcurrent: 2,
  maxRetries: 2,
  baseDelay: 1500,
  maxDelay: 30_000,
  timeout: 15_000,
  retryBudget: 3,
  minIntervalMs: 2_000,
});

export const apiRateLimiter = new RateLimiter({
  name: 'api',
  maxConcurrent: 5,
  maxRetries: 2,
  baseDelay: 800,
  maxDelay: 10_000,
  timeout: 15_000,
  retryBudget: 3,
});

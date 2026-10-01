

export class RateLimiter {
  constructor(options = {}) {
    this.name = options.name || 'api';
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.timeout = options.timeout || 10000; // 10 seconds
    this.retryBudget = options.retryBudget ?? 3; // retries allowed per minute

    this.running = 0;
    this.queue = [];
    this.retryTimestamps = [];
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

  // Retries are rate limited too, otherwise a 429 storm turns into a retry storm
  // and the upstream bans us for good.
  #consumeRetryBudget() {
    const now = Date.now();
    this.retryTimestamps = this.retryTimestamps.filter((t) => now - t < 60_000);
    if (this.retryTimestamps.length >= this.retryBudget) return false;
    this.retryTimestamps.push(now);
    return true;
  }

  async execute(fn) {
    await this.acquire();
    try {
      return await this.#executeWithRetry(fn);
    } finally {
      this.release();
    }
  }

  async #executeWithRetry(fn) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Declared outside the try so the catch block can clear it too.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        lastError = error;
        clearTimeout(timeoutId);

        // Don't retry on abort or client errors (4xx except 429)
        if (error?.name === 'AbortError') throw error;
        if (error?.status >= 400 && error?.status < 500 && error?.status !== 429) {
          throw error;
        }

        if (attempt < this.maxRetries && this.#consumeRetryBudget()) {
          // Honour Retry-After when the upstream sends one, otherwise back off.
          const retryAfterMs = parseRetryAfter(error?.retryAfter);
          const delay = Math.min(
            retryAfterMs ?? this.baseDelay * 2 ** attempt + Math.random() * 500,
            this.maxDelay,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}

// Retry-After is either seconds or an HTTP date.
function parseRetryAfter(value) {
  if (value === undefined || value === null || value === '') return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.min(Math.max(asDate - Date.now(), 0), 60_000);

  return null;
}

export const rpcRateLimiter = new RateLimiter({
  name: 'rpc',
  maxConcurrent: 4,
  maxRetries: 2,
  baseDelay: 1000,
  maxDelay: 30000,
  timeout: 10000,
  retryBudget: 4,
});

export const apiRateLimiter = new RateLimiter({
  name: 'api',
  maxConcurrent: 5,
  maxRetries: 2,
  baseDelay: 800,
  maxDelay: 10000,
  timeout: 15000,
  retryBudget: 3,
});

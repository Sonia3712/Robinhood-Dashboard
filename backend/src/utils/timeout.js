

export function withTimeout(target, ms, label) {
  if (typeof target === 'function') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);

  
    return Promise.resolve()
      .then(() => target(controller.signal))
      .then(
        (value) => {
          clearTimeout(timeoutId);
          return value;
        },
        (error) => {
          clearTimeout(timeoutId);
          if (error?.name === 'AbortError') {
            throw new Error(`${label} timed out after ${ms}ms`);
          }
          throw error;
        },
      );
  }

  if (!target || typeof target.then !== 'function') {
    return Promise.reject(new TypeError(`${label}: withTimeout needs a function or a promise`));
  }

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([target, timeout]).finally(() => clearTimeout(timeoutId));
}

export default withTimeout;

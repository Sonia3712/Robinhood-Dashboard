// Shared JSON fetch for every upstream client.
//
// GeckoTerminal, DEX Screener and the Robinhood RPC each needed the same two
// things: run `fetch` and refuse a non-2xx response. That block was
// copy-pasted three times. This module is the single seam for it.
//
// ERROR SHAPE IS A CONTRACT
// -------------------------
// Routes forward `error.message` into the 502 body as `detail`, and the
// frontend surfaces `body.detail || body.error`. The message format and the
// `status` / `retryAfter` properties are therefore preserved exactly. Callers
// that do not want a real URL in a user-visible message pass an explicit
// `displayUrl` — the RPC client passes the JSON-RPC method name for that reason.

export async function requestJson(
  url,
  { signal, method = 'GET', headers, body, label = 'HTTP', displayUrl = url } = {},
) {
  const response = await fetch(url, { method, headers, body, signal });

  if (!response.ok) {
    const error = new Error(`${label} ${response.status} for ${displayUrl}`);
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }

  return response.json();
}
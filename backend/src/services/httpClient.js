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

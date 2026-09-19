// Shared fetch helpers: timeout + text-first JSON parsing so a non-JSON
// error page from an upstream API doesn't crash the function with an
// unhandled parse exception.

export async function fetchJsonWithTimeout(url, { timeoutMs = 7000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail = data?.message || data?.error || raw?.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (data === null) throw new Error('Service returned a non-JSON response.');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timed out after ${timeoutMs}ms.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJsonWithTimeout(url, body, { timeoutMs = 9000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail = data?.message || data?.error || raw?.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (data === null) throw new Error('Service returned a non-JSON response.');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timed out after ${timeoutMs}ms.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

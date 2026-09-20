// Deploy button backend. Routed through our own function rather than
// calling api.netlify.com directly from the browser — Netlify's
// management API's CORS support for arbitrary browser origins isn't
// documented/guaranteed, so (same reasoning as the Wandbox proxy) this
// sidesteps the question entirely: the browser only ever talks to our own
// origin, and this function makes the actual api.netlify.com call
// server-side, where CORS doesn't apply at all.
import JSZip from 'jszip';
import { corsHeaders } from './lib/http.js';

const TIMEOUT_MS = 20000;

async function netlifyFetch(url, token, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
      signal: controller.signal,
    });
    const raw = await res.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = null; }
    if (!res.ok) {
      const detail = data?.message || data?.error || raw?.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Netlify API timed out after ${TIMEOUT_MS}ms.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { netlifyToken, siteId, siteName, files } = JSON.parse(event.body || '{}');
    if (!netlifyToken?.trim()) throw new Error('Netlify access token is required.');
    if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
      throw new Error('No files to deploy.');
    }

    // Reuse an existing site if we were given one; otherwise create a new
    // site (optionally with a requested subdomain name — Netlify will
    // fall back to an auto-generated name if it's taken or omitted).
    let resolvedSiteId = siteId;
    if (!resolvedSiteId) {
      const site = await netlifyFetch('https://api.netlify.com/api/v1/sites', netlifyToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteName ? { name: siteName } : {}),
      });
      resolvedSiteId = site.id;
    }

    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) zip.file(path, content);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const deploy = await netlifyFetch(
      `https://api.netlify.com/api/v1/sites/${resolvedSiteId}/deploys`,
      netlifyToken,
      { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zipBuffer },
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        siteId: resolvedSiteId,
        deployId: deploy.id,
        url: deploy.ssl_url || deploy.url || deploy.deploy_ssl_url,
        state: deploy.state,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Deploy failed' }) };
  }
};

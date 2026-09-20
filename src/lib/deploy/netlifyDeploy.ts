import type { OpenFile } from '../../types';

export type DeployResult =
  | { ok: true; siteId: string; deployId: string; url: string; state: string }
  | { ok: false; error: string };

const DEPLOYED_SITE_KEY = 'mini-cursor-deployed-site-id';

export function getSavedSiteId(): string | null {
  try { return localStorage.getItem(DEPLOYED_SITE_KEY); } catch { return null; }
}

function saveSiteId(id: string): void {
  try { localStorage.setItem(DEPLOYED_SITE_KEY, id); } catch { /* ignore */ }
}

// Only html/css/js files are meaningful to deploy as a static site (this
// mirrors exactly what the Preview panel already treats as "the web
// project" — see buildPreviewDoc.ts). Deploying every open file
// (including e.g. a .py scratch file) wouldn't make a working site and
// would just bloat the upload.
const DEPLOYABLE_LANGUAGES = new Set(['html', 'css', 'javascript']);

export async function deployToNetlify(
  netlifyToken: string, files: OpenFile[], siteName?: string,
): Promise<DeployResult> {
  const deployable = files.filter((f) => DEPLOYABLE_LANGUAGES.has(f.language));
  if (deployable.length === 0) {
    return { ok: false, error: 'No HTML/CSS/JS files to deploy — open or create a web project first.' };
  }
  if (!deployable.some((f) => f.language === 'html')) {
    return { ok: false, error: 'No .html file found — a static site needs at least one HTML file as an entry point.' };
  }

  const fileMap: Record<string, string> = {};
  for (const f of deployable) fileMap[f.path] = f.content;

  try {
    const res = await fetch('/api/deploy-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ netlifyToken, siteId: getSavedSiteId() || undefined, siteName, files: fileMap }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Deploy failed (${res.status})` };
    saveSiteId(data.siteId);
    return { ok: true, siteId: data.siteId, deployId: data.deployId, url: data.url, state: data.state };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `${err.message} — the /api/deploy-site function may not be available in this environment.`
        : 'Network request failed.',
    };
  }
}

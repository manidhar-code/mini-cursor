export type WandboxRunResult = {
  ok: boolean;
  provider?: string;
  compiler?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  compileError?: string | null;
  error?: string;
};

// Calls our own Netlify function (netlify/functions/run-code.js), which
// proxies to Wandbox server-side — Wandbox's API doesn't support CORS, so
// the browser can't call it directly. Only works once deployed to Netlify;
// in local `vite dev` without `netlify dev`, this endpoint won't exist.
export async function runViaWandbox(language: string, code: string, stdin = ''): Promise<WandboxRunResult> {
  try {
    const res = await fetch('/api/run-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code, stdin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `${err.message} — the /api/run-code function may not be available in this environment.`
          : 'Network request failed.',
    };
  }
}

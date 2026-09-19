// Terminal / Output panel backend: runs the current file's code via
// Wandbox (wandbox.org) and returns stdout/stderr/exit code.
//
// Wandbox only, by design: it's free, keyless, and has been reliable since
// 2013. Its API also doesn't support CORS, so the browser can't call it
// directly — this function exists purely as the server-side hop that makes
// that call on the browser's behalf.
//
// The compiler list Wandbox hosts changes over time, so rather than
// hardcoding compiler version strings (which would silently go stale),
// this fetches Wandbox's live compiler list on each call and picks a
// matching one for the requested language, preferring a "head" (latest)
// build when one exists.
import { fetchJsonWithTimeout, postJsonWithTimeout, corsHeaders } from './lib/http.js';

const TIMEOUT_MS = 9000;

// Normalizes whatever the editor sends ("py", "python3", "c++", "js", ...)
// into one canonical key.
const LANGUAGE_ALIASES = {
  javascript: 'javascript', js: 'javascript', node: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  python: 'python', py: 'python', python3: 'python',
  bash: 'bash', sh: 'bash', shell: 'bash',
  c: 'c',
  cpp: 'cpp', 'c++': 'cpp',
  csharp: 'csharp', 'c#': 'csharp',
  java: 'java',
  go: 'go', golang: 'go',
  rust: 'rust', rs: 'rust',
  ruby: 'ruby', rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  perl: 'perl',
  lua: 'lua',
  haskell: 'haskell',
  elixir: 'elixir',
  scala: 'scala',
  d: 'd',
};

// Wandbox's `language` field values for each canonical key.
const WANDBOX_LANGUAGE_NAMES = {
  javascript: ['javascript'],
  typescript: ['typescript'],
  python: ['python'],
  bash: ['bash'],
  c: ['c'],
  cpp: ['c++'],
  csharp: ['c#'],
  java: ['java'],
  go: ['go'],
  rust: ['rust'],
  ruby: ['ruby'],
  php: ['php'],
  swift: ['swift'],
  kotlin: ['kotlin'],
  perl: ['perl'],
  lua: ['lua'],
  haskell: ['haskell'],
  elixir: ['elixir'],
  scala: ['scala'],
  d: ['d'],
};

let wandboxListCache = null;
let wandboxListCacheAt = 0;

async function getWandboxCompilers() {
  // Cached for the lifetime of this function instance — mostly helps on
  // warm invocations, not a persistent cache — just to avoid re-fetching
  // the full compiler list on every call in a burst.
  if (wandboxListCache && Date.now() - wandboxListCacheAt < 5 * 60 * 1000) return wandboxListCache;
  const list = await fetchJsonWithTimeout('https://wandbox.org/api/list.json', { timeoutMs: 5000 });
  wandboxListCache = Array.isArray(list) ? list : [];
  wandboxListCacheAt = Date.now();
  return wandboxListCache;
}

async function runWandbox(canonicalLang, code, stdin) {
  const wantedNames = WANDBOX_LANGUAGE_NAMES[canonicalLang];
  if (!wantedNames) throw new Error(`Wandbox has no known mapping for "${canonicalLang}".`);

  const list = await getWandboxCompilers();
  const candidates = list.filter((c) => wantedNames.includes((c.language || '').toLowerCase()));
  if (!candidates.length) throw new Error(`Wandbox doesn't currently host a compiler for "${canonicalLang}".`);

  const chosen = candidates.find((c) => /head/i.test(c.name)) || candidates[0];

  const data = await postJsonWithTimeout(
    'https://wandbox.org/api/compile.json',
    { code, compiler: chosen.name, stdin, save: false },
    { timeoutMs: TIMEOUT_MS },
  );

  return {
    provider: 'wandbox',
    compiler: chosen.name,
    stdout: (data.program_output || '').slice(0, 4000),
    stderr: (data.program_error || '').slice(0, 2000),
    exitCode: data.status ? Number(data.status) : null,
    compileError: data.compiler_error ? data.compiler_error.slice(0, 2000) : null,
  };
}

export const handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { language, code, stdin = '' } = JSON.parse(event.body || '{}');
    if (!code?.trim()) throw new Error('code is required.');
    const canonicalLang = LANGUAGE_ALIASES[(language || '').toLowerCase().trim()];
    if (!canonicalLang) {
      throw new Error(
        `Unsupported or missing language "${language}". Supported: ${[...new Set(Object.values(LANGUAGE_ALIASES))].join(', ')}.`,
      );
    }

    const result = await runWandbox(canonicalLang, code, stdin);
    return { statusCode: 200, headers, body: JSON.stringify({ language: canonicalLang, ...result }) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Code execution failed' }),
    };
  }
};

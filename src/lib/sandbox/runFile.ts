import { runJsInWorker } from './runJsInWorker';
import { runViaWandbox } from './wandboxClient';

export type RunOutcome = {
  ok: boolean;
  runnable: boolean; // false for languages/files with no runtime output (html, css, json, ...)
  provider: 'browser' | 'wandbox' | 'none';
  stdout: string;
  stderr: string;
  compileError?: string | null;
  exitCode?: number | null;
  message?: string; // set when runnable is false, or on a hard failure
};

// Languages Wandbox can execute (mirrors the server function's language map).
const WANDBOX_SUPPORTED = new Set([
  'typescript', 'python', 'shell', 'c', 'cpp', 'csharp', 'java', 'go',
  'rust', 'ruby', 'php', 'swift', 'kotlin', 'perl', 'lua', 'haskell', 'elixir', 'scala', 'd',
]);

export async function runFile(language: string, code: string): Promise<RunOutcome> {
  const lang = (language || '').toLowerCase();

  if (lang === 'javascript') {
    const result = await runJsInWorker(code);
    return {
      ok: result.ok,
      runnable: true,
      provider: 'browser',
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  if (WANDBOX_SUPPORTED.has(lang)) {
    const result = await runViaWandbox(lang, code);
    if (!result.ok) {
      return {
        ok: false, runnable: true, provider: 'wandbox',
        stdout: '', stderr: '', message: result.error || 'Execution failed.',
      };
    }
    return {
      ok: (result.exitCode ?? 0) === 0 && !result.compileError,
      runnable: true,
      provider: 'wandbox',
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compileError: result.compileError,
      exitCode: result.exitCode,
    };
  }

  return {
    ok: false,
    runnable: false,
    provider: 'none',
    stdout: '',
    stderr: '',
    message:
      lang === 'html' || lang === 'css'
        ? 'HTML/CSS files don\u2019t produce runtime output \u2014 check the Preview tab instead.'
        : `"${language || 'this file type'}" isn\u2019t a runnable language.`,
  };
}

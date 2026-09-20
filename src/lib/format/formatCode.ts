// Runs entirely in the browser via Prettier's standalone build — no
// server call, no Wandbox round-trip, works offline. Each parser plugin
// is a separate subpath import (Prettier v3's structure) so only what's
// actually needed for the current file's language gets pulled in.
import * as prettier from 'prettier/standalone';

export type FormatResult = { ok: true; code: string } | { ok: false; error: string };

const LANGUAGE_TO_PARSER: Record<string, { parser: string; plugins: () => Promise<any[]> }> = {
  javascript: {
    parser: 'babel',
    plugins: async () => [(await import('prettier/plugins/babel')).default, (await import('prettier/plugins/estree')).default],
  },
  typescript: {
    parser: 'typescript',
    plugins: async () => [(await import('prettier/plugins/typescript')).default, (await import('prettier/plugins/estree')).default],
  },
  html: {
    parser: 'html',
    plugins: async () => [(await import('prettier/plugins/html')).default],
  },
  css: {
    parser: 'css',
    plugins: async () => [(await import('prettier/plugins/postcss')).default],
  },
  json: {
    parser: 'json',
    plugins: async () => [(await import('prettier/plugins/babel')).default, (await import('prettier/plugins/estree')).default],
  },
  markdown: {
    parser: 'markdown',
    plugins: async () => [(await import('prettier/plugins/markdown')).default],
  },
};

export function isFormattable(language: string): boolean {
  return language in LANGUAGE_TO_PARSER;
}

export async function formatCode(code: string, language: string): Promise<FormatResult> {
  const entry = LANGUAGE_TO_PARSER[language];
  if (!entry) {
    return { ok: false, error: `"${language}" isn't a formattable language.` };
  }
  try {
    const plugins = await entry.plugins();
    const formatted = await prettier.format(code, { parser: entry.parser, plugins });
    return { ok: true, code: formatted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Formatting failed — check for syntax errors.' };
  }
}

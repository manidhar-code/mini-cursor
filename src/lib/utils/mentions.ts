import type { OpenFile } from '../../types';

// Matches "@" followed by a path-ish token (letters, digits, ., _, -, /).
// Deliberately simple — this is chat text, not a full parser; it just
// needs to catch things like "@App.tsx" or "@src/App.tsx".
const MENTION_RE = /@([\w./-]+)/g;

export function extractMentionedFiles(text: string, files: OpenFile[]): OpenFile[] {
  const matches = [...text.matchAll(MENTION_RE)].map((m) => m[1]);
  if (matches.length === 0) return [];

  const found: OpenFile[] = [];
  const seen = new Set<string>();
  for (const token of matches) {
    const file = files.find((f) => f.path === token || f.name === token);
    if (file && !seen.has(file.path)) {
      seen.add(file.path);
      found.push(file);
    }
  }
  return found;
}

// Builds the "here are the files you referenced" context block appended
// to the user's message before it's sent to the model. Kept separate from
// the "current open file" context that already existed, and deduped
// against it by the caller.
export function buildMentionContext(mentioned: OpenFile[]): string {
  return mentioned
    .map((f) => `File: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join('\n\n');
}

// For the "@" autocomplete dropdown: given the text and cursor position,
// returns the partial token being typed (e.g. typing "@App" at the cursor
// returns "App"), or null if the cursor isn't inside an "@mention".
export function activeMentionQuery(text: string, cursorPos: number): string | null {
  const uptoCursor = text.slice(0, cursorPos);
  const match = uptoCursor.match(/@([\w./-]*)$/);
  return match ? match[1] : null;
}

// Replaces the in-progress "@partial" token ending at cursorPos with the
// full "@path " (plus a trailing space), returning the new text and where
// the cursor should land afterward.
export function applyMentionCompletion(
  text: string, cursorPos: number, path: string,
): { text: string; cursorPos: number } {
  const uptoCursor = text.slice(0, cursorPos);
  const replaced = uptoCursor.replace(/@([\w./-]*)$/, '@' + path + ' ');
  const newText = replaced + text.slice(cursorPos);
  return { text: newText, cursorPos: replaced.length };
}

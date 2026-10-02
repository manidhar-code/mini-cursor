// Project rules: an optional `.mini-cursor/rules.md` file whose contents
// are given to the agent as standing guidance for THIS project (coding
// style, conventions, things to avoid) — the same idea as Cursor's
// `.cursorrules`.
//
// Trust note: this file usually arrives inside whatever folder/zip the
// user opened, so it can be authored by someone other than the user. It is
// therefore treated as guidance, not authority: the system prompt labels
// it as lower priority than the agent's built-in rules and the user's own
// request (see systemPrompt.ts), its size is capped here, and the
// orchestrator surfaces an activity event whenever it's applied so the
// user can see it's in effect.

export const PROJECT_RULES_PATH = '.mini-cursor/rules.md';
export const MAX_PROJECT_RULES_CHARS = 4000;

export const PROJECT_RULES_TEMPLATE = `# Project rules

Guidance the Mini Cursor agent follows for this project. Keep it short and
specific — the agent reads this at the start of every Agent-mode run.

## Style
- (e.g. TypeScript strict mode; functional React components; 2-space indent)

## Conventions
- (e.g. put shared helpers in src/lib/utils; name test files *.test.ts)

## Avoid
- (e.g. don't add new dependencies without asking; don't touch src/legacy/)
`;

export type ProjectRules = { path: string; content: string; truncated: boolean };

/**
 * Finds the project rules file among the given files. Matches the file at
 * the project root OR nested under a top-level folder (Open Folder keeps
 * the picked folder's name as the first path segment, so the rules file
 * shows up as e.g. "my-app/.mini-cursor/rules.md"). If several match, the
 * one closest to the root wins. Returns null when there's no file or it's
 * blank.
 */
export function findProjectRules(files: { path: string; content: string }[]): ProjectRules | null {
  const matches = files
    .filter((f) => f.path === PROJECT_RULES_PATH || f.path.endsWith('/' + PROJECT_RULES_PATH))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  const hit = matches[0];
  if (!hit) return null;

  // Strip the prompt's own delimiter tag so a rules file can't "close" the
  // <project_rules> block early and place text outside it.
  const trimmed = hit.content.replace(/<\s*\/?\s*project_rules\s*>/gi, '').trim();
  if (!trimmed) return null;

  const truncated = trimmed.length > MAX_PROJECT_RULES_CHARS;
  return {
    path: hit.path,
    content: truncated ? trimmed.slice(0, MAX_PROJECT_RULES_CHARS) : trimmed,
    truncated,
  };
}

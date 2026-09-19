// Tool contract for Agent mode. These are the ONLY actions the model can
// take on the project — everything else (arbitrary file writes, shell
// access, network calls) is simply not exposed, so there's nothing for a
// misbehaving or misled model to reach for (Phase 4/15: no unrestricted
// system access).
import type { ToolDefinition } from '../api/agentTypes';

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List every file currently open in the project workspace, as a path tree. ' +
        'Always call this first to see what exists before reading or changing anything.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the full current content of one file by its exact path (as shown by list_files). ' +
        'Always read a file before calling update_file on it, so you preserve unrelated code.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Exact file path, e.g. "src/App.tsx"' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description:
        'Case-insensitive text search across every open file. Returns matching file paths with ' +
        'line numbers and a short snippet. Use this to find where something is defined or used ' +
        'before deciding which files are actually relevant — do not read every file "just in case".',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Text or identifier to search for' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description:
        'Stage a brand-new file with the given full content. Fails if the path already exists — ' +
        'use update_file for existing files instead.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'Full content of the new file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_file',
      description:
        'Stage a full replacement of an existing file\'s content. You MUST pass the file\'s ' +
        'ENTIRE new content, not a diff or a snippet — read_file first, then re-emit the whole ' +
        'file with only the necessary parts changed, keeping everything else byte-for-byte the same.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'Complete new file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description:
        'Stage deletion of a file. Destructive — only call this when the task clearly requires ' +
        'removing the file, and say why in your reply.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Stage renaming/moving a file to a new path, preserving its content unchanged.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, newPath: { type: 'string' } },
        required: ['path', 'newPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a project command (e.g. "npm run build", "npm test") to verify staged changes. ' +
        'Only a small allowlist of package-manager/build commands is permitted. This tool is ' +
        'only available when the app is connected to a local runtime — in a plain browser tab ' +
        'it will report that it is unavailable. Check the result before assuming anything ran.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
];

export type ValidatedArgs =
  | { ok: true; value: Record<string, string> }
  | { ok: false; error: string };

const PATH_ARG_TOOLS = new Set(['read_file', 'create_file', 'update_file', 'delete_file', 'rename_file']);

function isSafePath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.trim()) return false;
  if (path.includes('..')) return false; // no path traversal, even in a virtual FS
  if (path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)) return false; // stay relative to the project
  return true;
}

/** Validates a tool call's parsed JSON arguments before it ever reaches
 * executeTool. Rejecting bad calls here (rather than trusting the model)
 * is what Phase 14 means by "validate AI-generated tool arguments" —
 * the orchestrator reports the rejection back to the model as a tool
 * result so it can retry with corrected arguments. */
export function validateToolArgs(name: string, args: unknown): ValidatedArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, error: 'Arguments must be a JSON object.' };
  }
  const a = args as Record<string, unknown>;

  switch (name) {
    case 'list_files':
      return { ok: true, value: {} };

    case 'read_file':
    case 'delete_file':
      if (!isSafePath(a.path)) return { ok: false, error: 'A valid relative "path" string is required.' };
      return { ok: true, value: { path: a.path } };

    case 'search_files':
      if (typeof a.query !== 'string' || !a.query.trim()) {
        return { ok: false, error: 'A non-empty "query" string is required.' };
      }
      return { ok: true, value: { query: a.query } };

    case 'create_file':
    case 'update_file':
      if (!isSafePath(a.path)) return { ok: false, error: 'A valid relative "path" string is required.' };
      if (typeof a.content !== 'string') return { ok: false, error: 'A "content" string is required.' };
      return { ok: true, value: { path: a.path, content: a.content } };

    case 'rename_file':
      if (!isSafePath(a.path)) return { ok: false, error: 'A valid relative "path" string is required.' };
      if (!isSafePath(a.newPath)) return { ok: false, error: 'A valid relative "newPath" string is required.' };
      return { ok: true, value: { path: a.path, newPath: a.newPath } };

    case 'run_command':
      if (typeof a.command !== 'string' || !a.command.trim()) {
        return { ok: false, error: 'A non-empty "command" string is required.' };
      }
      return { ok: true, value: { command: a.command } };

    default:
      return { ok: false, error: 'Unknown tool "' + name + '".' };
  }
}

/** A short, human-readable label for the activity feed — parses best-effort
 * from raw (unvalidated) arguments so a malformed call still shows *something*
 * before validation rejects it. */
export function describeToolCall(name: string, rawArgs: string): string {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(rawArgs || '{}');
  } catch {
    /* fall through with empty args */
  }
  switch (name) {
    case 'list_files': return 'Inspecting project structure';
    case 'read_file': return 'Reading ' + (a.path ?? 'file');
    case 'search_files': return 'Searching for "' + (a.query ?? '') + '"';
    case 'create_file': return 'Creating ' + (a.path ?? 'file');
    case 'update_file': return 'Editing ' + (a.path ?? 'file');
    case 'delete_file': return 'Deleting ' + (a.path ?? 'file');
    case 'rename_file': return 'Renaming ' + (a.path ?? '?') + ' → ' + (a.newPath ?? '?');
    case 'run_command': return 'Running ' + (a.command ?? 'command');
    default: return 'Calling ' + name;
  }
}

/** Commands the agent may attempt to run, if a real CommandRunner is ever
 * connected. Deliberately narrow — package-manager/build/test/status
 * commands only. No shell metacharacters, chaining, redirection, or
 * arbitrary binaries (Phase 8/15: no unrestricted execution). */
const ALLOWED_COMMAND_RE =
  /^(npm|npx|yarn|pnpm)\s+(run\s+\S+|test|install|ci|build|start|--version)$|^(tsc|vite\s+build)(\s+--\S+)*$|^git\s+(status|diff)(\s+\S+)*$/;

export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || /[;&|`$><\n]/.test(trimmed)) return false; // no chaining/redirection/substitution
  return ALLOWED_COMMAND_RE.test(trimmed);
}

// Runs one validated tool call. Nothing here ever touches the editor's
// real `openFiles` React state — every file-mutating tool stages its
// change into `pendingChanges` (and updates `overlay` so subsequent
// read_file/list_files/search_files calls in the SAME run see it). The
// actual commit into the editor only happens later, after the user
// reviews the diff (or immediately, if they've turned approval off) —
// see lib/agent/apply.ts.
import type { OpenFile, FileNode } from '../../types';
import type { CommandRunner } from './commandRunner';
import type { CommandAttempt, PendingFileChange } from './types';
import { changedFraction } from './diff';
import { isCommandAllowed } from './tools';

export type OverlayMap = Map<string, string | null>; // null = deleted-in-this-run

export type ToolExecContext = {
  files: OpenFile[];
  overlay: OverlayMap;
  pendingChanges: Map<string, PendingFileChange>;
  commandRunner: CommandRunner;
  commandCallCount: { current: number };
};

export type ToolExecResult = {
  ok: boolean;
  summary: string;
  payload: unknown;
  commandAttempt?: CommandAttempt;
};

const MAX_COMMAND_CALLS = 5; // Phase 9: cap automatic build/fix retries
const MAX_SEARCH_MATCHES = 30;

/** Merges the real open files with this run's staged overlay. */
export function resolveFiles(files: OpenFile[], overlay: OverlayMap): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    seen.add(f.path);
    if (overlay.has(f.path)) {
      const v = overlay.get(f.path);
      if (v !== null) out.push({ path: f.path, content: v as string });
      // v === null means deleted this run — omit
    } else {
      out.push({ path: f.path, content: f.content });
    }
  }
  for (const [path, content] of overlay.entries()) {
    if (!seen.has(path) && content !== null) out.push({ path, content });
  }
  return out;
}

export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const dirIndex = new Map<string, FileNode>(); // "a/b" -> directory node

  for (const path of [...paths].sort()) {
    const parts = path.split('/').filter(Boolean);
    let siblings = root;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      prefix = prefix ? prefix + '/' + parts[i] : parts[i];
      if (isLast) {
        siblings.push({ name: parts[i], path, type: 'file' });
      } else {
        let dir = dirIndex.get(prefix);
        if (!dir) {
          dir = { name: parts[i], path: prefix, type: 'directory', children: [] };
          dirIndex.set(prefix, dir);
          siblings.push(dir);
        }
        siblings = dir.children!;
      }
    }
  }
  return root;
}

function findPendingDestructiveMerge(
  pending: Map<string, PendingFileChange>,
  path: string,
): PendingFileChange | undefined {
  return pending.get(path);
}

export async function executeTool(
  name: string,
  args: Record<string, string>,
  ctx: ToolExecContext,
): Promise<ToolExecResult> {
  const { files, overlay, pendingChanges, commandRunner, commandCallCount } = ctx;

  switch (name) {
    case 'list_files': {
      const resolved = resolveFiles(files, overlay);
      const tree = buildFileTree(resolved.map((f) => f.path));
      if (resolved.length === 0) {
        return { ok: true, summary: 'No files open', payload: { files: [], note: 'The project has no open files yet.' } };
      }
      return { ok: true, summary: resolved.length + ' file(s)', payload: { files: tree } };
    }

    case 'read_file': {
      const resolved = resolveFiles(files, overlay);
      const hit = resolved.find((f) => f.path === args.path);
      if (!hit) {
        return { ok: false, summary: 'Not found: ' + args.path, payload: { error: 'No file at path "' + args.path + '". Call list_files to see what exists.' } };
      }
      return { ok: true, summary: 'Read ' + args.path, payload: { path: hit.path, content: hit.content } };
    }

    case 'search_files': {
      const resolved = resolveFiles(files, overlay);
      const query = args.query.toLowerCase();
      const matches: { path: string; line: number; snippet: string }[] = [];
      outer: for (const f of resolved) {
        const lines = f.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            const snippet = lines[i].trim().slice(0, 160);
            matches.push({ path: f.path, line: i + 1, snippet });
            if (matches.length >= MAX_SEARCH_MATCHES) break outer;
          }
        }
      }
      return {
        ok: true,
        summary: matches.length + ' match(es) for "' + args.query + '"',
        payload: { matches, truncated: matches.length >= MAX_SEARCH_MATCHES },
      };
    }

    case 'create_file': {
      const resolved = resolveFiles(files, overlay);
      const exists = resolved.some((f) => f.path === args.path);
      if (exists) {
        return { ok: false, summary: 'Already exists: ' + args.path, payload: { error: 'A file already exists at "' + args.path + '". Use update_file instead.' } };
      }
      const prior = findPendingDestructiveMerge(pendingChanges, args.path);
      overlay.set(args.path, args.content);
      if (prior && prior.kind === 'delete') {
        // Recreating a file deleted earlier this same run — treat as an update
        // against its pre-deletion content so the diff reads sensibly.
        pendingChanges.set(args.path, {
          kind: 'update',
          path: args.path,
          oldContent: prior.oldContent,
          newContent: args.content,
          destructive: changedFraction(prior.oldContent, args.content) > 0.5,
        });
      } else {
        pendingChanges.set(args.path, { kind: 'create', path: args.path, newContent: args.content, destructive: false });
      }
      return { ok: true, summary: 'Staged new file ' + args.path, payload: { path: args.path, staged: true } };
    }

    case 'update_file': {
      const resolved = resolveFiles(files, overlay);
      const hit = resolved.find((f) => f.path === args.path);
      if (!hit) {
        return { ok: false, summary: 'Not found: ' + args.path, payload: { error: 'No file at path "' + args.path + '". Use create_file if this should be new.' } };
      }
      const existingChange = pendingChanges.get(args.path);
      const oldContent = existingChange && existingChange.kind === 'update' ? existingChange.oldContent : hit.content;
      overlay.set(args.path, args.content);
      if (existingChange && existingChange.kind === 'create') {
        pendingChanges.set(args.path, { kind: 'create', path: args.path, newContent: args.content, destructive: false });
      } else {
        pendingChanges.set(args.path, {
          kind: 'update',
          path: args.path,
          oldContent,
          newContent: args.content,
          destructive: changedFraction(oldContent, args.content) > 0.5,
        });
      }
      return { ok: true, summary: 'Staged edit to ' + args.path, payload: { path: args.path, staged: true } };
    }

    case 'delete_file': {
      const resolved = resolveFiles(files, overlay);
      const hit = resolved.find((f) => f.path === args.path);
      if (!hit) {
        return { ok: false, summary: 'Not found: ' + args.path, payload: { error: 'No file at path "' + args.path + '".' } };
      }
      const existingChange = pendingChanges.get(args.path);
      if (existingChange && existingChange.kind === 'create') {
        // Never existed for real yet — deleting it is just undoing the staged create.
        pendingChanges.delete(args.path);
        overlay.delete(args.path);
        return { ok: true, summary: 'Discarded staged file ' + args.path, payload: { path: args.path, staged: true } };
      }
      const oldContent = existingChange && existingChange.kind === 'update' ? existingChange.oldContent : hit.content;
      overlay.set(args.path, null);
      pendingChanges.set(args.path, { kind: 'delete', path: args.path, oldContent, destructive: true });
      return { ok: true, summary: 'Staged deletion of ' + args.path, payload: { path: args.path, staged: true } };
    }

    case 'rename_file': {
      const resolved = resolveFiles(files, overlay);
      const hit = resolved.find((f) => f.path === args.path);
      if (!hit) {
        return { ok: false, summary: 'Not found: ' + args.path, payload: { error: 'No file at path "' + args.path + '".' } };
      }
      const destExists = resolved.some((f) => f.path === args.newPath);
      if (destExists) {
        return { ok: false, summary: 'Destination exists: ' + args.newPath, payload: { error: 'A file already exists at "' + args.newPath + '".' } };
      }
      overlay.set(args.path, null);
      overlay.set(args.newPath, hit.content);
      pendingChanges.delete(args.path);
      pendingChanges.set(args.newPath, { kind: 'rename', path: args.path, newPath: args.newPath, content: hit.content, destructive: true });
      return { ok: true, summary: 'Staged rename ' + args.path + ' → ' + args.newPath, payload: { path: args.path, newPath: args.newPath, staged: true } };
    }

    case 'run_command': {
      if (!isCommandAllowed(args.command)) {
        return {
          ok: false,
          summary: 'Command not permitted',
          payload: { error: 'The command "' + args.command + '" is not on the allowed list (package-manager / build / test / git status commands only).' },
        };
      }
      if (commandCallCount.current >= MAX_COMMAND_CALLS) {
        return {
          ok: false,
          summary: 'Command retry limit reached',
          payload: { error: 'Reached the limit of ' + MAX_COMMAND_CALLS + ' command attempts for this task. Stop and summarize status instead of retrying again.' },
        };
      }
      commandCallCount.current += 1;
      const result = await commandRunner.run(args.command);
      const attempt: CommandAttempt = {
        command: args.command,
        available: result.available,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        message: result.message,
      };
      return {
        ok: result.available ? result.exitCode === 0 : false,
        summary: result.available ? result.message : 'Unavailable in this environment',
        payload: {
          available: result.available,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          message: result.message,
        },
        commandAttempt: attempt,
      };
    }

    default:
      return { ok: false, summary: 'Unknown tool', payload: { error: 'Unknown tool "' + name + '".' } };
  }
}

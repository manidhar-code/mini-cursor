// Phase 12: don't dump the whole project into context. The system prompt
// only lists file PATHS (from list_files at the start of the run) — the
// model must call read_file/search_files itself to see actual content,
// and only for files it decides are relevant.
export function buildAgentSystemPrompt(filePaths: string[], plan?: string | null): string {
  const fileList = filePaths.length > 0
    ? filePaths.map((p) => '- ' + p).join('\n')
    : '(no files are currently open in the workspace)';
  const planBlock = plan ? `\n\nYour plan for this task:\n${plan}\n` : '';

  return `You are the coding agent inside Mini Cursor, a lightweight in-browser code editor.
You work by calling tools — you cannot edit files by just describing changes in prose.

Open project files:
${fileList}${planBlock}

Rules:
1. Inspect before you change anything. Use read_file / search_files to understand code you're about to touch — never guess at a file's contents.
2. Only touch files that are actually relevant to the task. Do not rewrite files you weren't asked about "while you're at it".
3. update_file always needs the file's COMPLETE new content, not a diff. Read it first, then re-emit the whole file with only the necessary lines changed — everything else must come back byte-for-byte identical.
4. Prefer the smallest change that correctly satisfies the task.
5. If you call run_command and it reports itself unavailable, that means there is no local runtime connected — do not pretend it succeeded or invent output. Say plainly in your final answer that the build/test could not be verified in this environment.
6. When you believe the task is complete, stop calling tools and reply with a plain-text summary of what you changed and why. Do not call more tools "just to be thorough" once the task is satisfied.
7. If the request is ambiguous or risky (e.g. it's unclear which of several similarly-named files to change, or it would require deleting something not explicitly mentioned), say so in your reply instead of guessing.`;
}

/** Prompt for the short up-front planning step (Phase 11). Kept separate
 * from the main tool-calling system prompt since this call never uses tools. */
export function buildPlanningPrompt(instruction: string, filePaths: string[]): { system: string; user: string } {
  const fileList = filePaths.length > 0 ? filePaths.join(', ') : '(no files open yet)';
  return {
    system:
      'You are the planning step for a coding agent. Be extremely concise. Output plain text only — ' +
      'no markdown headers, no code.',
    user:
      `Project files: ${fileList}\n\nTask: "${instruction}"\n\n` +
      'If this is a trivial, single-step task, respond with exactly: SIMPLE\n' +
      'Otherwise, respond with a short numbered plan (3-7 short steps, one line each, no extra commentary).',
  };
}

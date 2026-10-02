// Pure line-splice math for the patch-based edit tools (replace_range,
// insert_after). Deliberately separated from executor.ts and given no
// dependency on file/overlay state, so the trickiest part of this feature
// — 1-indexed, inclusive line-range arithmetic, the classic source of
// off-by-one bugs — can be unit-tested directly (see patch.test.ts)
// without needing to stand up the whole agent execution context.

export type PatchResult =
  | { ok: true; content: string; lineCount: number }
  | { ok: false; error: string };

/**
 * Replaces lines [startLine, endLine] (1-indexed, inclusive) with
 * `newContent`. `newContent` is split on '\n' and may be empty (an empty
 * string deletes the range entirely, since ''.split('\n') is special-cased
 * to [] here rather than the usual [''], which would otherwise leave a
 * stray blank line behind).
 */
export function applyReplaceRange(
  original: string, startLine: number, endLine: number, newContent: string,
): PatchResult {
  const lines = original.split('\n');

  if (!Number.isInteger(startLine) || startLine < 1) {
    return { ok: false, error: `startLine must be a positive integer (got ${startLine}).` };
  }
  if (!Number.isInteger(endLine) || endLine < startLine) {
    return { ok: false, error: `endLine must be an integer >= startLine (got startLine=${startLine}, endLine=${endLine}).` };
  }
  if (startLine > lines.length) {
    return {
      ok: false,
      error: `startLine ${startLine} is beyond the end of the file — it has ${lines.length} line(s). Call read_file for current line numbers.`,
    };
  }

  // Clamp endLine to the file's actual length rather than erroring — a
  // model asking to replace "through the end" with a slightly-too-large
  // endLine is a benign, common case, not a real mistake worth rejecting.
  const clampedEnd = Math.min(endLine, lines.length);
  const insertedLines = newContent === '' ? [] : newContent.split('\n');
  const updatedLines = [...lines.slice(0, startLine - 1), ...insertedLines, ...lines.slice(clampedEnd)];

  return { ok: true, content: updatedLines.join('\n'), lineCount: updatedLines.length };
}

/**
 * Inserts `content` immediately after 1-indexed line `afterLine`.
 * `afterLine: 0` inserts before the first line (i.e. at the very top).
 */
export function applyInsertAfter(original: string, afterLine: number, content: string): PatchResult {
  const lines = original.split('\n');

  if (!Number.isInteger(afterLine) || afterLine < 0) {
    return { ok: false, error: `afterLine must be a non-negative integer (got ${afterLine}).` };
  }
  if (afterLine > lines.length) {
    return {
      ok: false,
      error: `afterLine ${afterLine} is beyond the end of the file — it has ${lines.length} line(s). Call read_file for current line numbers.`,
    };
  }

  const insertedLines = content === '' ? [] : content.split('\n');
  const updatedLines = [...lines.slice(0, afterLine), ...insertedLines, ...lines.slice(afterLine)];

  return { ok: true, content: updatedLines.join('\n'), lineCount: updatedLines.length };
}

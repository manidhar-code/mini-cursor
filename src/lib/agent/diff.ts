// Small line-based diff for the change-approval UI. No `diff` package
// dependency — this project has none and a full Myers diff isn't needed for
// reviewing AI-proposed file edits. Plain O(n*m) LCS is fine at editor-file
// sizes; DIFF_LINE_CUTOFF guards against pathological input.

export type DiffLine = { type: 'same' | 'add' | 'remove'; text: string };

const DIFF_LINE_CUTOFF = 4000;

export function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length > DIFF_LINE_CUTOFF || b.length > DIFF_LINE_CUTOFF) return null; // caller shows a summary instead

  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of LCS of a[i:], b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      result.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) { result.push({ type: 'remove', text: a[i] }); i++; }
  while (j < m) { result.push({ type: 'add', text: b[j] }); j++; }
  return result;
}

/** Rough measure of how much of a file a change touches, used to flag an
 * update_file call as destructive (Phase 15) even though it isn't a delete. */
export function changedFraction(oldText: string, newText: string): number {
  if (!oldText) return newText ? 1 : 0;
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines = diffLines(oldText, newText);
  if (!lines) {
    // Cutoff hit — fall back to a length-based estimate.
    const delta = Math.abs(newText.length - oldText.length);
    return Math.min(1, delta / Math.max(1, oldText.length));
  }
  const changed = lines.filter((l) => l.type !== 'same').length;
  return changed / Math.max(1, oldLines.length, newLines.length);
}

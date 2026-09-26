import { describe, it, expect } from 'vitest';
import { diffLines, changedFraction } from './diff';

describe('diffLines', () => {
  it('returns all "same" lines for identical text', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc');
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
      { type: 'same', text: 'c' },
    ]);
  });

  it('detects a pure addition', () => {
    const result = diffLines('a\nb', 'a\nb\nc');
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
      { type: 'add', text: 'c' },
    ]);
  });

  it('detects a pure removal', () => {
    const result = diffLines('a\nb\nc', 'a\nc');
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'same', text: 'c' },
    ]);
  });

  it('detects a single-line replacement as remove+add', () => {
    const result = diffLines('const x = 1;', 'const x = 2;');
    expect(result).toEqual([
      { type: 'remove', text: 'const x = 1;' },
      { type: 'add', text: 'const x = 2;' },
    ]);
  });

  it('treats an empty string as a single empty line (String.split quirk), not zero lines', () => {
    // ''.split('\n') === [''], so diffing against/from an empty string
    // produces an extra remove/add of that blank line — a real, minor quirk
    // of this line-based approach, not something callers need to special-case
    // (the UI only counts non-"same" lines, so it's cosmetic).
    expect(diffLines('', 'a')).toEqual([
      { type: 'remove', text: '' },
      { type: 'add', text: 'a' },
    ]);
    expect(diffLines('a', '')).toEqual([
      { type: 'remove', text: 'a' },
      { type: 'add', text: '' },
    ]);
  });

  it('returns null when either side exceeds the line cutoff', () => {
    const huge = Array.from({ length: 4001 }, (_, i) => `line ${i}`).join('\n');
    expect(diffLines(huge, 'a')).toBeNull();
    expect(diffLines('a', huge)).toBeNull();
  });
});

describe('changedFraction', () => {
  it('is 0 for identical text', () => {
    expect(changedFraction('a\nb\nc', 'a\nb\nc')).toBe(0);
  });

  it('is 1 when going from empty to non-empty', () => {
    expect(changedFraction('', 'a\nb')).toBe(1);
  });

  it('can exceed 1 when emptying existing content, due to the split("") quirk above', () => {
    // Only the empty-*old*-text path is special-cased to return exactly 1;
    // emptying existing content goes through the general diffLines path,
    // where the '' -> [''] quirk inflates the "changed" line count above the
    // line total, so the ratio isn't clamped. Not a functional bug (callers
    // only use this to flag "this is a big change"), but worth knowing about
    // if this function is ever used somewhere a strict 0-1 ratio is assumed.
    expect(changedFraction('a\nb', '')).toBeGreaterThan(1);
  });

  it('reports a fraction between 0 and 1 for a partial change', () => {
    const oldText = 'a\nb\nc\nd';
    const newText = 'a\nX\nc\nd';
    const fraction = changedFraction(oldText, newText);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(1);
  });

  it('falls back to a length-based estimate above the diff cutoff', () => {
    const huge = Array.from({ length: 4001 }, (_, i) => `line ${i}`).join('\n');
    const fraction = changedFraction(huge, huge + '\nextra');
    expect(fraction).toBeGreaterThanOrEqual(0);
    expect(fraction).toBeLessThanOrEqual(1);
  });
});

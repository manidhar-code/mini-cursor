import { describe, it, expect } from 'vitest';
import { applyReplaceRange, applyInsertAfter } from './patch';

describe('applyReplaceRange', () => {
  it('replaces a single middle line', () => {
    const result = applyReplaceRange('a\nb\nc', 2, 2, 'X');
    expect(result).toEqual({ ok: true, content: 'a\nX\nc', lineCount: 3 });
  });

  it('replaces a range with a different number of lines than it removes', () => {
    const result = applyReplaceRange('a\nb\nc', 1, 2, 'X\nY\nZ');
    expect(result).toEqual({ ok: true, content: 'X\nY\nZ\nc', lineCount: 4 });
  });

  it('deletes a range when newContent is empty', () => {
    const result = applyReplaceRange('a\nb\nc', 2, 3, '');
    expect(result).toEqual({ ok: true, content: 'a', lineCount: 1 });
  });

  it('deletes the entire file when the range covers every line', () => {
    const result = applyReplaceRange('a\nb\nc', 1, 3, '');
    expect(result).toEqual({ ok: true, content: '', lineCount: 0 });
  });

  it('clamps endLine to the file length instead of erroring ("replace through the end")', () => {
    const result = applyReplaceRange('a\nb\nc', 2, 999, 'X');
    expect(result).toEqual({ ok: true, content: 'a\nX', lineCount: 2 });
  });

  it('rejects a startLine beyond the end of the file', () => {
    const result = applyReplaceRange('a\nb\nc', 4, 4, 'X');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/beyond the end/);
  });

  it('rejects endLine < startLine', () => {
    const result = applyReplaceRange('a\nb\nc', 2, 1, 'X');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-positive startLine', () => {
    const result = applyReplaceRange('a\nb\nc', 0, 1, 'X');
    expect(result.ok).toBe(false);
  });
});

describe('applyInsertAfter', () => {
  it('inserts at the top when afterLine is 0', () => {
    const result = applyInsertAfter('a\nb\nc', 0, 'X');
    expect(result).toEqual({ ok: true, content: 'X\na\nb\nc', lineCount: 4 });
  });

  it('inserts at the end when afterLine equals the line count', () => {
    const result = applyInsertAfter('a\nb\nc', 3, 'X');
    expect(result).toEqual({ ok: true, content: 'a\nb\nc\nX', lineCount: 4 });
  });

  it('inserts multiple lines in one call', () => {
    const result = applyInsertAfter('a\nb', 1, 'X\nY');
    expect(result).toEqual({ ok: true, content: 'a\nX\nY\nb', lineCount: 4 });
  });

  it('rejects a negative afterLine', () => {
    const result = applyInsertAfter('a\nb\nc', -1, 'X');
    expect(result.ok).toBe(false);
  });

  it('rejects afterLine beyond the end of the file', () => {
    const result = applyInsertAfter('a\nb\nc', 4, 'X');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/beyond the end/);
  });

  it('leaves a trailing newline when inserting into a truly empty file', () => {
    // ''.split('\n') is ['' ] (one empty-string "line"), not [] — the same
    // JS quirk documented for changedFraction in diff.test.ts. Inserting
    // into an empty file therefore leaves that empty line after the
    // inserted content, i.e. a trailing newline in the result. Harmless
    // (most files end with one anyway) and documented here rather than
    // silently special-cased away.
    const result = applyInsertAfter('', 0, 'hello');
    expect(result).toEqual({ ok: true, content: 'hello\n', lineCount: 2 });
  });
});

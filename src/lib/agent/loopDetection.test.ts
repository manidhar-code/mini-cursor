import { describe, it, expect } from 'vitest';
import { toolCallSignature, classifyRepetition, REPEAT_WARN_THRESHOLD, REPEAT_ABORT_THRESHOLD } from './loopDetection';

describe('toolCallSignature', () => {
  it('is identical for the same name and args', () => {
    const a = toolCallSignature('update_file', { path: 'a.ts', content: 'x' });
    const b = toolCallSignature('update_file', { path: 'a.ts', content: 'x' });
    expect(a).toBe(b);
  });

  it('is identical regardless of key order', () => {
    const a = toolCallSignature('replace_range', { path: 'a.ts', startLine: '1', endLine: '2', newContent: 'x' });
    const b = toolCallSignature('replace_range', { newContent: 'x', endLine: '2', path: 'a.ts', startLine: '1' });
    expect(a).toBe(b);
  });

  it('differs when any argument value differs', () => {
    const a = toolCallSignature('update_file', { path: 'a.ts', content: 'x' });
    const b = toolCallSignature('update_file', { path: 'a.ts', content: 'y' });
    expect(a).not.toBe(b);
  });

  it('differs for different tool names with the same args', () => {
    const a = toolCallSignature('replace_range', { path: 'a.ts' });
    const b = toolCallSignature('insert_after', { path: 'a.ts' });
    expect(a).not.toBe(b);
  });
});

describe('classifyRepetition', () => {
  it('is "ok" below the warn threshold', () => {
    expect(classifyRepetition(1)).toBe('ok');
    expect(classifyRepetition(REPEAT_WARN_THRESHOLD - 1)).toBe('ok');
  });

  it('is "warn" from the warn threshold up to (not including) the abort threshold', () => {
    expect(classifyRepetition(REPEAT_WARN_THRESHOLD)).toBe('warn');
    expect(classifyRepetition(REPEAT_ABORT_THRESHOLD - 1)).toBe('warn');
  });

  it('is "abort" at and beyond the abort threshold', () => {
    expect(classifyRepetition(REPEAT_ABORT_THRESHOLD)).toBe('abort');
    expect(classifyRepetition(REPEAT_ABORT_THRESHOLD + 10)).toBe('abort');
  });
});

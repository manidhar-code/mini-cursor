import { describe, it, expect } from 'vitest';
import { shouldSkipPath, filterFileSelection } from './fileFilters';

function makeFile(relativePath: string, sizeBytes = 100): File {
  const file = new File(['x'.repeat(sizeBytes)], relativePath.split('/').pop()!, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('shouldSkipPath', () => {
  it('skips files inside ignored directories', () => {
    expect(shouldSkipPath('project/node_modules/pkg/index.js')).toBe(true);
    expect(shouldSkipPath('project/.git/HEAD')).toBe(true);
    expect(shouldSkipPath('project/dist/bundle.js')).toBe(true);
  });

  it('keeps ordinary source files', () => {
    expect(shouldSkipPath('project/src/App.tsx')).toBe(false);
    expect(shouldSkipPath('project/README.md')).toBe(false);
  });

  it('skips known binary extensions', () => {
    expect(shouldSkipPath('project/logo.png')).toBe(true);
    expect(shouldSkipPath('project/archive.zip')).toBe(true);
    expect(shouldSkipPath('project/yarn.lock')).toBe(true);
  });

  it('is case-insensitive about extensions', () => {
    expect(shouldSkipPath('project/photo.PNG')).toBe(true);
  });

  it('does not false-positive on directory names that merely contain a skipped segment as a substring', () => {
    expect(shouldSkipPath('project/my-dist-notes/file.ts')).toBe(false);
  });
});

describe('filterFileSelection', () => {
  it('separates junk, oversized, and loadable files', () => {
    const files = [
      makeFile('proj/src/index.ts', 500),
      makeFile('proj/node_modules/x/y.js', 500),
      makeFile('proj/big.txt', 2_000_000),
    ];
    const result = filterFileSelection(files);
    expect(result.toLoad).toHaveLength(1);
    expect(result.toLoad[0].webkitRelativePath).toBe('proj/src/index.ts');
    expect(result.skippedJunk).toBe(1);
    expect(result.skippedTooLarge).toBe(1);
    expect(result.skippedOverLimit).toBe(0);
  });

  it('caps the number of loaded files at the configured limit', () => {
    const files = Array.from({ length: 305 }, (_, i) => makeFile(`proj/src/file${i}.ts`));
    const result = filterFileSelection(files);
    expect(result.toLoad).toHaveLength(300);
    expect(result.skippedOverLimit).toBe(5);
  });

  it('returns an empty result for an empty selection', () => {
    const result = filterFileSelection([]);
    expect(result).toEqual({ toLoad: [], skippedJunk: 0, skippedTooLarge: 0, skippedOverLimit: 0 });
  });
});

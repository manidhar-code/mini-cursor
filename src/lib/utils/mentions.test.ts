import { describe, it, expect } from 'vitest';
import { extractMentionedFiles, buildMentionContext, activeMentionQuery, applyMentionCompletion } from './mentions';
import type { OpenFile } from '../../types';

function makeFile(path: string, content = 'content'): OpenFile {
  const name = path.split('/').pop()!;
  return { path, name, content, language: 'typescript' } as OpenFile;
}

describe('extractMentionedFiles', () => {
  const files = [makeFile('src/App.tsx'), makeFile('src/lib/utils/mentions.ts')];

  it('finds a file mentioned by full path', () => {
    const found = extractMentionedFiles('please fix @src/App.tsx now', files);
    expect(found.map((f) => f.path)).toEqual(['src/App.tsx']);
  });

  it('finds a file mentioned by bare name', () => {
    const found = extractMentionedFiles('what does @App.tsx do', files);
    expect(found.map((f) => f.path)).toEqual(['src/App.tsx']);
  });

  it('returns an empty array when there are no mentions', () => {
    expect(extractMentionedFiles('no mentions here', files)).toEqual([]);
  });

  it('ignores mentions that do not match any open file', () => {
    expect(extractMentionedFiles('see @unknown.ts', files)).toEqual([]);
  });

  it('deduplicates repeated mentions of the same file', () => {
    const found = extractMentionedFiles('@App.tsx and again @App.tsx', files);
    expect(found).toHaveLength(1);
  });

  it('finds multiple distinct mentioned files', () => {
    const found = extractMentionedFiles('@App.tsx and @src/lib/utils/mentions.ts', files);
    expect(found.map((f) => f.path).sort()).toEqual(['src/App.tsx', 'src/lib/utils/mentions.ts']);
  });
});

describe('buildMentionContext', () => {
  it('formats each mentioned file as a fenced code block with its path', () => {
    const context = buildMentionContext([makeFile('src/App.tsx', 'const x = 1;')]);
    expect(context).toContain('File: src/App.tsx');
    expect(context).toContain('```typescript');
    expect(context).toContain('const x = 1;');
  });

  it('joins multiple files with a blank line between them', () => {
    const context = buildMentionContext([makeFile('a.ts', '1'), makeFile('b.ts', '2')]);
    expect(context.split('\n\n')).toHaveLength(2);
  });

  it('returns an empty string for no files', () => {
    expect(buildMentionContext([])).toBe('');
  });
});

describe('activeMentionQuery', () => {
  it('returns the partial token when the cursor is inside an @mention', () => {
    expect(activeMentionQuery('fix @App', 8)).toBe('App');
  });

  it('returns an empty string right after typing "@"', () => {
    expect(activeMentionQuery('fix @', 5)).toBe('');
  });

  it('returns null when the cursor is not in a mention', () => {
    expect(activeMentionQuery('fix this please', 16)).toBeNull();
  });

  it('returns null once the mention is followed by a space', () => {
    expect(activeMentionQuery('fix @App.tsx now', 16)).toBeNull();
  });
});

describe('applyMentionCompletion', () => {
  it('replaces the in-progress token with the full path plus a trailing space', () => {
    const result = applyMentionCompletion('fix @Ap', 7, 'src/App.tsx');
    expect(result.text).toBe('fix @src/App.tsx ');
    expect(result.cursorPos).toBe('fix @src/App.tsx '.length);
  });

  it('preserves text after the cursor', () => {
    const result = applyMentionCompletion('fix @Ap please', 7, 'src/App.tsx');
    expect(result.text).toBe('fix @src/App.tsx  please');
  });
});

import { describe, it, expect } from 'vitest';
import { executeTool, type ToolExecContext } from './executor';
import { applyPendingChanges } from './apply';
import type { OpenFile } from '../../types';

function file(path: string, content: string): OpenFile {
  return { path, name: path.split('/').pop() ?? path, content, language: 'plaintext', modified: false };
}

function makeCtx(files: OpenFile[]): ToolExecContext {
  return {
    files,
    overlay: new Map(),
    pendingChanges: new Map(),
    commandRunner: { available: false, run: async () => ({ available: false, message: 'n/a' }) },
    commandCallCount: { current: 0 },
  };
}

describe('replace_range', () => {
  it('stages an update and returns the fresh full content', async () => {
    const ctx = makeCtx([file('a.txt', 'one\ntwo\nthree')]);
    const res = await executeTool('replace_range', { path: 'a.txt', startLine: '2', endLine: '2', newContent: 'TWO' }, ctx);
    expect(res.ok).toBe(true);
    expect((res.payload as { content: string }).content).toBe('one\nTWO\nthree');
    expect(ctx.pendingChanges.get('a.txt')).toMatchObject({ kind: 'update', oldContent: 'one\ntwo\nthree', newContent: 'one\nTWO\nthree' });
  });

  it('collapses several edits to one file into a single diff against the ORIGINAL content', async () => {
    const ctx = makeCtx([file('a.txt', 'one\ntwo\nthree')]);
    await executeTool('replace_range', { path: 'a.txt', startLine: '1', endLine: '1', newContent: 'ONE' }, ctx);
    await executeTool('insert_after', { path: 'a.txt', afterLine: '3', content: 'four' }, ctx);
    expect(ctx.pendingChanges.size).toBe(1);
    expect(ctx.pendingChanges.get('a.txt')).toMatchObject({
      kind: 'update',
      oldContent: 'one\ntwo\nthree',
      newContent: 'ONE\ntwo\nthree\nfour',
    });
  });

  it('a later edit sees the earlier edit (line numbers come from the overlay, not the original)', async () => {
    const ctx = makeCtx([file('a.txt', 'a\nb\nc')]);
    await executeTool('insert_after', { path: 'a.txt', afterLine: '0', content: 'top' }, ctx); // now: top,a,b,c
    const res = await executeTool('replace_range', { path: 'a.txt', startLine: '4', endLine: '4', newContent: 'C' }, ctx);
    expect(res.ok).toBe(true);
    expect((res.payload as { content: string }).content).toBe('top\na\nb\nC');
  });

  it('rejects an out-of-range edit without staging anything', async () => {
    const ctx = makeCtx([file('a.txt', 'one\ntwo')]);
    const res = await executeTool('replace_range', { path: 'a.txt', startLine: '9', endLine: '9', newContent: 'x' }, ctx);
    expect(res.ok).toBe(false);
    expect(ctx.pendingChanges.size).toBe(0);
    expect(ctx.overlay.size).toBe(0);
  });

  it('fails cleanly for a path that does not exist', async () => {
    const ctx = makeCtx([file('a.txt', 'x')]);
    const res = await executeTool('insert_after', { path: 'nope.txt', afterLine: '0', content: 'x' }, ctx);
    expect(res.ok).toBe(false);
  });

  it('keeps a file created earlier in the run as a create, with the patched content', async () => {
    const ctx = makeCtx([]);
    await executeTool('create_file', { path: 'new.txt', content: 'a\nb' }, ctx);
    await executeTool('replace_range', { path: 'new.txt', startLine: '2', endLine: '2', newContent: 'B' }, ctx);
    expect(ctx.pendingChanges.get('new.txt')).toMatchObject({ kind: 'create', newContent: 'a\nB' });
  });
});

describe('editing a file after renaming it in the same run', () => {
  it('stays a rename and carries the edited content (regression: edit + rename used to be lost)', async () => {
    const files = [file('old.txt', 'hello\nworld')];
    const ctx = makeCtx(files);
    await executeTool('rename_file', { path: 'old.txt', newPath: 'new.txt' }, ctx);
    const res = await executeTool('replace_range', { path: 'new.txt', startLine: '2', endLine: '2', newContent: 'there' }, ctx);
    expect(res.ok).toBe(true);
    expect(ctx.pendingChanges.get('new.txt')).toMatchObject({ kind: 'rename', path: 'old.txt', newPath: 'new.txt', content: 'hello\nthere' });

    const applied = applyPendingChanges(files, [...ctx.pendingChanges.values()]);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ path: 'new.txt', content: 'hello\nthere' });
  });
});

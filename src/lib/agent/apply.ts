import type { OpenFile } from '../../types';
import { detectLanguage } from '../utils/language';
import type { PendingFileChange } from './types';

function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Commits staged changes into the editor's real file list. Pure function —
 * takes the current files, returns the next array — so App.tsx can plug it
 * straight into setOpenFiles(prev => applyPendingChanges(prev, changes)). */
export function applyPendingChanges(files: OpenFile[], changes: PendingFileChange[]): OpenFile[] {
  let next = files;

  for (const change of changes) {
    switch (change.kind) {
      case 'create':
        next = [
          ...next,
          {
            path: change.path,
            name: baseName(change.path),
            content: change.newContent,
            language: detectLanguage(change.path),
            modified: true,
          },
        ];
        break;

      case 'update':
        next = next.map((f) => (f.path === change.path ? { ...f, content: change.newContent, modified: true } : f));
        break;

      case 'delete':
        next = next.filter((f) => f.path !== change.path);
        break;

      case 'rename':
        next = next.some((f) => f.path === change.path)
          ? next.map((f) =>
              f.path === change.path
                ? { ...f, path: change.newPath, name: baseName(change.newPath), language: detectLanguage(change.newPath), modified: true }
                : f,
            )
          : [
              ...next,
              {
                path: change.newPath,
                name: baseName(change.newPath),
                content: change.content,
                language: detectLanguage(change.newPath),
                modified: true,
              },
            ];
        break;
    }
  }

  return next;
}

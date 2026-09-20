import type { OpenFile } from '../../types';

export type TreeNode =
  | { type: 'file'; name: string; path: string }
  | { type: 'folder'; name: string; path: string; children: TreeNode[] };

// Groups a flat list of files (each identified by a "/"-separated path,
// e.g. "src/components/Button.tsx") into a nested folder tree for the
// explorer sidebar. Folders are synthesized purely from path segments —
// there's no separate "folder" entity anywhere else in the app, so an
// empty folder can't exist; it only appears once a file's path implies it.
export function buildFileTree(files: OpenFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  const findOrCreateFolder = (nodes: TreeNode[], name: string, path: string): TreeNode[] => {
    let existing = nodes.find((n) => n.type === 'folder' && n.name === name) as
      | Extract<TreeNode, { type: 'folder' }>
      | undefined;
    if (!existing) {
      existing = { type: 'folder', name, path, children: [] };
      nodes.push(existing);
    }
    return existing.children;
  };

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const segments = file.path.split('/').filter(Boolean);
    let cursor = root;
    let builtPath = '';
    for (let i = 0; i < segments.length - 1; i++) {
      builtPath = builtPath ? builtPath + '/' + segments[i] : segments[i];
      cursor = findOrCreateFolder(cursor, segments[i], builtPath);
    }
    const fileName = segments[segments.length - 1] ?? file.path;
    cursor.push({ type: 'file', name: fileName, path: file.path });
  }

  // Folders first, then files, alphabetically within each group — matches
  // the convention most file explorers use.
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    const folders = nodes.filter((n) => n.type === 'folder') as Extract<TreeNode, { type: 'folder' }>[];
    const fileNodes = nodes.filter((n) => n.type === 'file');
    for (const f of folders) f.children = sortNodes(f.children);
    return [
      ...folders.sort((a, b) => a.name.localeCompare(b.name)),
      ...fileNodes.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  };

  return sortNodes(root);
}

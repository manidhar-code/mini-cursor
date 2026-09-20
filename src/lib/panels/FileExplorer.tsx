import { useState } from 'react';
import { buildFileTree, type TreeNode } from '../utils/fileTree';
import type { OpenFile } from '../../types';

function FolderRow({
  node, depth, activeFile, onSelect, onDelete, collapsed, onToggle,
}: {
  node: Extract<TreeNode, { type: 'folder' }>;
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isCollapsed = collapsed.has(node.path);
  return (
    <div>
      <div
        className="file-tree-row folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onToggle(node.path)}
      >
        <span className="file-tree-caret">{isCollapsed ? '▸' : '▾'}</span>
        <span className="file-tree-icon">📁</span>
        <span className="file-tree-name">{node.name}</span>
      </div>
      {!isCollapsed && (
        <TreeNodes
          nodes={node.children}
          depth={depth + 1}
          activeFile={activeFile}
          onSelect={onSelect}
          onDelete={onDelete}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function TreeNodes(props: {
  nodes: TreeNode[];
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}) {
  const { nodes, depth, activeFile, onSelect, onDelete, collapsed, onToggle } = props;
  return (
    <>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <FolderRow
            key={node.path}
            node={node}
            depth={depth}
            activeFile={activeFile}
            onSelect={onSelect}
            onDelete={onDelete}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        ) : (
          <div
            key={node.path}
            className={'file-tree-row file' + (node.path === activeFile ? ' active' : '')}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onSelect(node.path)}
          >
            <span className="file-tree-icon">📄</span>
            <span className="file-tree-name">{node.name}</span>
            <button
              className="file-tree-delete"
              title="Delete file"
              onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
            >
              ✕
            </button>
          </div>
        ),
      )}
    </>
  );
}

export function FileExplorer({
  files, activeFile, onSelect, onDelete, onNewFile,
}: {
  files: OpenFile[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = buildFileTree(files);

  const onToggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <span>PROJECT FILES</span>
        <button className="icon-btn" title="New file (you can include a folder, e.g. src/App.tsx)" onClick={onNewFile}>+</button>
      </div>
      <div className="file-tree">
        {files.length === 0 ? (
          <div className="panel-empty-state">
            <p>No files yet.</p>
            <p className="settings-hint">Click + to create one — you can type a folder path like src/App.tsx.</p>
          </div>
        ) : (
          <TreeNodes
            nodes={tree}
            depth={0}
            activeFile={activeFile}
            onSelect={onSelect}
            onDelete={onDelete}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        )}
      </div>
    </div>
  );
}

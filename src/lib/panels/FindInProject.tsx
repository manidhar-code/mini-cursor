import { useEffect, useRef, useState } from 'react';
import type { OpenFile } from '../../types';

type Match = { path: string; lineNumber: number; lineText: string };

const MAX_RESULTS = 80;

function searchFiles(files: OpenFile[], query: string): Match[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: Match[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        results.push({ path: file.path, lineNumber: i + 1, lineText: lines[i].trim().slice(0, 160) });
        if (results.length >= MAX_RESULTS) return results;
      }
    }
  }
  return results;
}

export function FindInProject({
  open, onClose, files, onJumpTo,
}: {
  open: boolean;
  onClose: () => void;
  files: OpenFile[];
  onJumpTo: (path: string, lineNumber: number) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const results = searchFiles(files, query);

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search across all project files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'Enter' && results[0]) { onJumpTo(results[0].path, results[0].lineNumber); onClose(); }
          }}
        />
        <div className="palette-list">
          {query.trim() === '' && <div className="panel-empty-state">Start typing to search every open file's contents.</div>}
          {query.trim() !== '' && results.length === 0 && <div className="panel-empty-state">No matches.</div>}
          {results.map((r, i) => (
            <button
              key={r.path + ':' + r.lineNumber + ':' + i}
              className="palette-item find-item"
              onClick={() => { onJumpTo(r.path, r.lineNumber); onClose(); }}
            >
              <span className="find-item-path">{r.path}:{r.lineNumber}</span>
              <span className="find-item-line">{r.lineText}</span>
            </button>
          ))}
          {results.length >= MAX_RESULTS && (
            <div className="panel-empty-state" style={{ padding: '8px 12px' }}>Showing first {MAX_RESULTS} matches — narrow your search for more.</div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

export type Command = {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
};

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
      // Focus after the modal actually paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  if (!open) return null;

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    cmd.action();
  };

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(filtered[highlighted]); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="panel-empty-state">No matching commands.</div>}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={'palette-item' + (i === highlighted ? ' active' : '')}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => run(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.hint && <span className="palette-item-hint">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

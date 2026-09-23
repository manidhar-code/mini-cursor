import { useEffect, useRef } from 'react';
import type { RunEntry } from '../../hooks/useRunner';
import type { OpenFile } from '../../types';
import { PlayIcon, TrashIcon } from '../icons/Icons';

function EntryBlock({ entry }: { entry: RunEntry }) {
  const { outcome } = entry;
  return (
    <div className="terminal-entry">
      <div className="terminal-prompt">
        <span className="terminal-prompt-sigil">$</span> run {entry.fileName}
        {outcome?.provider === 'wandbox' && <span className="terminal-provider"> (via wandbox)</span>}
        {outcome?.provider === 'browser' && <span className="terminal-provider"> (in-browser)</span>}
      </div>
      {entry.running && <div className="terminal-line terminal-muted">Running…</div>}
      {outcome && !outcome.runnable && (
        <div className="terminal-line terminal-muted">{outcome.message}</div>
      )}
      {outcome && outcome.runnable && outcome.message && (
        <div className="terminal-line terminal-stderr">{outcome.message}</div>
      )}
      {outcome?.compileError && (
        <pre className="terminal-line terminal-stderr">{outcome.compileError}</pre>
      )}
      {outcome?.stdout && <pre className="terminal-line terminal-stdout">{outcome.stdout}</pre>}
      {outcome?.stderr && <pre className="terminal-line terminal-stderr">{outcome.stderr}</pre>}
      {outcome && outcome.runnable && !outcome.stdout && !outcome.stderr && !outcome.compileError && !outcome.message && (
        <div className="terminal-line terminal-muted">(no output)</div>
      )}
      {outcome && typeof outcome.exitCode === 'number' && (
        <div className={'terminal-line terminal-exit ' + (outcome.exitCode === 0 ? 'ok' : 'fail')}>
          exit code {outcome.exitCode}
        </div>
      )}
    </div>
  );
}

export function TerminalPane({
  history, running, onRun, onClear, currentFile,
}: {
  history: RunEntry[];
  running: boolean;
  onRun: () => void;
  onClear: () => void;
  currentFile: OpenFile | undefined;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, history[history.length - 1]?.running]);

  return (
    <div className="terminal-pane">
      <div className="panel-toolbar">
        <button
          className="settings-btn primary"
          onClick={onRun}
          disabled={!currentFile || running}
          title="Run the current file (Ctrl+Enter)"
        >
          {running ? 'Running…' : <><PlayIcon size={12} /> Run</>}
        </button>
        <button className="icon-btn" title="Clear terminal" onClick={onClear}><TrashIcon size={13} /></button>
        <span className="panel-toolbar-hint">
          {currentFile ? currentFile.name : 'No file open'}
        </span>
      </div>
      <div className="terminal-scrollback">
        {history.length === 0 && (
          <div className="panel-empty-state">
            <p>No runs yet.</p>
            <p className="settings-hint">Hit Run to execute the current file — JavaScript runs instantly in your browser; everything else runs via Wandbox.</p>
          </div>
        )}
        {history.map((entry) => <EntryBlock key={entry.id} entry={entry} />)}
        <div ref={endRef} />
      </div>
    </div>
  );
}

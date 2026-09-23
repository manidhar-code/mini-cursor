import type { RunEntry } from '../../hooks/useRunner';
import { CopyIcon } from '../icons/Icons';

export function OutputPane({ latest }: { latest: RunEntry | null }) {
  if (!latest) {
    return (
      <div className="panel-empty-state">
        <p>No output yet.</p>
        <p className="settings-hint">Run a file from the Terminal tab — the raw output of the most recent run shows up here.</p>
      </div>
    );
  }

  const { outcome } = latest;
  const raw = [
    outcome?.compileError,
    outcome?.stdout,
    outcome?.stderr,
    outcome && !outcome.runnable ? outcome.message : null,
    outcome && outcome.runnable && outcome.message ? outcome.message : null,
  ].filter(Boolean).join('\n\n');

  const copy = () => navigator.clipboard?.writeText(raw).catch(() => {});

  return (
    <div className="output-pane">
      <div className="panel-toolbar">
        <span className="panel-toolbar-hint">{latest.fileName}{latest.running ? ' — running…' : ''}</span>
        <button className="icon-btn" title="Copy output" onClick={copy} disabled={!raw}><CopyIcon size={13} /></button>
      </div>
      <pre className="output-content">{raw || (latest.running ? 'Running…' : '(no output)')}</pre>
    </div>
  );
}

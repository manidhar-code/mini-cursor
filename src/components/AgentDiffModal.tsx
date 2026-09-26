import { CheckIcon, CloseIcon, BotIcon } from '../lib/icons/Icons';
import { diffLines } from '../lib/agent/diff';
import type { AgentActivityEvent, PendingFileChange } from '../lib/agent/types';

/* ─── Agent Activity Feed (Phase 10) ──────────────────────────── */
export function AgentActivityFeed({ events }: { events: AgentActivityEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="agent-activity">
      {events.map((e) => (
        <div key={e.id} className={'agent-activity-row ' + e.status}>
          <span className="agent-activity-icon">
            {e.status === 'active' ? <span className="status-dot pulsing" /> : e.status === 'success' ? <CheckIcon size={12} /> : e.status === 'error' ? <CloseIcon size={12} /> : <span className="status-dot" />}
          </span>
          <span className="agent-activity-label">{e.label}</span>
          {e.detail && <span className="agent-activity-detail">{e.detail}</span>}
        </div>
      ))}
    </div>
  );
}

/* ─── Agent Diff / Approval Modal (Phase 7) ───────────────────── */
const MAX_DIFF_LINES_SHOWN = 400;

export function changeBadgeLabel(kind: PendingFileChange['kind']): string {
  switch (kind) {
    case 'create': return 'New';
    case 'update': return 'Modified';
    case 'delete': return 'Deleted';
    case 'rename': return 'Renamed';
  }
}

export function ChangeDiffView({ change }: { change: PendingFileChange }) {
  if (change.kind === 'rename') {
    return <p className="settings-hint">Content unchanged — only the file path changes.</p>;
  }
  if (change.kind === 'create') {
    const lines = change.newContent.split('\n');
    const shown = lines.slice(0, MAX_DIFF_LINES_SHOWN);
    return (
      <pre className="agent-diff-code">
        {shown.map((l, i) => <div key={i} className="diff-line add">+ {l}</div>)}
        {lines.length > shown.length && <div className="diff-line-more">… {lines.length - shown.length} more line(s) …</div>}
      </pre>
    );
  }
  if (change.kind === 'delete') {
    const lines = change.oldContent.split('\n');
    const shown = lines.slice(0, MAX_DIFF_LINES_SHOWN);
    return (
      <pre className="agent-diff-code">
        {shown.map((l, i) => <div key={i} className="diff-line remove">- {l}</div>)}
        {lines.length > shown.length && <div className="diff-line-more">… {lines.length - shown.length} more line(s) …</div>}
      </pre>
    );
  }
  // update
  const lines = diffLines(change.oldContent, change.newContent);
  if (!lines) {
    return (
      <p className="settings-hint">
        File too large to show a line-by-line diff ({change.newContent.length.toLocaleString()} characters after the change).
      </p>
    );
  }
  const shown = lines.slice(0, MAX_DIFF_LINES_SHOWN);
  return (
    <pre className="agent-diff-code">
      {shown.map((l, i) => (
        <div key={i} className={'diff-line ' + l.type}>
          {(l.type === 'add' ? '+ ' : l.type === 'remove' ? '- ' : '  ') + l.text}
        </div>
      ))}
      {lines.length > shown.length && <div className="diff-line-more">… {lines.length - shown.length} more line(s) …</div>}
    </pre>
  );
}

export function AgentDiffModal({
  open, changes, onApply, onReject, onClose,
}: {
  open: boolean;
  changes: PendingFileChange[];
  onApply: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="agent-diff-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><BotIcon size={16} /> Agent wants to modify {changes.length} file{changes.length === 1 ? '' : 's'}</h3>
        <div className="agent-diff-file-list">
          {changes.map((c) => {
            const path = c.kind === 'rename' ? c.path + ' → ' + c.newPath : c.path;
            return (
              <div key={path} className="agent-diff-file">
                <div className="agent-diff-file-header">
                  <span className={'agent-diff-badge ' + c.kind}>{changeBadgeLabel(c.kind)}</span>
                  <span className="agent-diff-file-path">{path}</span>
                </div>
                <ChangeDiffView change={c} />
              </div>
            );
          })}
        </div>
        <div className="ai-edit-actions">
          <button className="settings-btn" onClick={onReject}>Reject</button>
          <button className="settings-btn primary" onClick={onApply}>
            Apply {changes.length} change{changes.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

import type { EditHistoryEntry } from '../../hooks/useEditHistory';

function timeAgo(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.round(minutes / 60);
  return hours + 'h ago';
}

export function EditHistoryPanel({
  open, onClose, history, onRevert,
}: {
  open: boolean;
  onClose: () => void;
  history: EditHistoryEntry[];
  onRevert: (id: string) => void;
}) {
  if (!open) return null;
  const reversed = [...history].reverse(); // most recent first

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h3>AI Edit History</h3>
        {reversed.length === 0 ? (
          <div className="panel-empty-state">
            <p>No AI edits applied yet this session.</p>
            <p className="settings-hint">Every AI Edit (Ctrl+K) and applied Agent change gets recorded here so you can revert it.</p>
          </div>
        ) : (
          <div className="edit-history-list">
            {reversed.map((entry) => (
              <div key={entry.id} className="edit-history-item">
                <div className="edit-history-info">
                  <div className="edit-history-label">{entry.label}</div>
                  <div className="settings-hint">{timeAgo(entry.timestamp)} — {entry.snapshot.length} file(s) in snapshot</div>
                </div>
                <button className="settings-btn" onClick={() => onRevert(entry.id)}>Revert to before this</button>
              </div>
            ))}
          </div>
        )}
        <p className="settings-hint" style={{ marginTop: 12 }}>
          This history only lasts for the current browser session — it resets on page refresh (your files themselves are saved separately and survive refresh).
        </p>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="settings-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

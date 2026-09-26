import { SparkleIcon, BugIcon } from '../lib/icons/Icons';

/* ─── AI Edit Modal (Ctrl/Cmd+K) ──────────────────────────────── */
export function AiEditModal({
  open, fileName, hasSelection, loading, error, instruction, onChangeInstruction, onSubmit, onClose,
}: {
  open: boolean;
  fileName: string;
  hasSelection: boolean;
  loading: boolean;
  error: string | null;
  instruction: string;
  onChangeInstruction: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="ai-edit-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><SparkleIcon size={16} /> Edit with AI — {fileName}</h3>
        <p className="settings-hint" style={{ marginBottom: 10 }}>
          {hasSelection ? 'Editing your selection.' : 'No selection — editing the whole file.'}
        </p>
        <textarea
          className="ai-edit-input"
          autoFocus
          rows={3}
          placeholder="Describe the change, e.g. 'add error handling' or 'convert to async/await'"
          value={instruction}
          onChange={(e) => onChangeInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); }
            if (e.key === 'Escape') onClose();
          }}
        />
        {error && <p className="ai-edit-error">{error}</p>}
        <div className="ai-edit-actions">
          <button className="settings-btn" onClick={onClose}>Cancel</button>
          <button className="settings-btn primary" onClick={onSubmit} disabled={loading || !instruction.trim()}>
            {loading ? 'Editing…' : 'Edit (Ctrl+Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Explain Error modal ──────────────────────────────────────── */
export function ExplainErrorModal({
  open, fileName, loading, errorText, onChangeErrorText, onSubmit, onClose,
}: {
  open: boolean;
  fileName: string;
  loading: boolean;
  errorText: string;
  onChangeErrorText: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="ai-edit-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><BugIcon size={16} /> Explain this error{fileName ? ' — ' + fileName : ''}</h3>
        <p className="settings-hint" style={{ marginBottom: 10 }}>
          Paste an error message or stack trace. The AI will explain what's wrong and suggest a fix, using the open file as context if there is one.
        </p>
        <textarea
          className="ai-edit-input"
          autoFocus
          rows={6}
          placeholder="Paste the error or stack trace here…"
          value={errorText}
          onChange={(e) => onChangeErrorText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); }
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="ai-edit-actions">
          <button className="settings-btn" onClick={onClose}>Cancel</button>
          <button className="settings-btn primary" onClick={onSubmit} disabled={loading || !errorText.trim()}>
            {loading ? 'Asking…' : 'Explain (Ctrl+Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}

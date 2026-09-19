import { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useSettings } from './hooks/useSettings';
import { useChat, INLINE_EDIT_SYSTEM_PROMPT } from './hooks/useChat';
import { useAgent } from './hooks/useAgent';
import { useRunner } from './hooks/useRunner';
import { detectLanguage, extensionForLanguage } from './lib/utils/language';
import { chatWithFallback, type ProviderModel, type ApiKeys } from './lib/api';
import { stripCodeFence } from './lib/markdown/parse';
import { MessageContent } from './lib/markdown/MessageContent';
import { registerInlineCompletionProvider } from './lib/editor/inlineCompletion';
import { GROQ_CHAT_MODEL_OPTIONS } from './lib/api/groq';
import { MISTRAL_CHAT_MODEL_OPTIONS } from './lib/api/mistral';
import { OPENROUTER_CHAT_MODEL_OPTIONS } from './lib/api/openrouter';
import { GEMINI_CHAT_MODEL_OPTIONS } from './lib/api/gemini';
import { applyPendingChanges } from './lib/agent/apply';
import { diffLines } from './lib/agent/diff';
import { PreviewPane } from './lib/panels/PreviewPane';
import { TerminalPane } from './lib/panels/TerminalPane';
import { OutputPane } from './lib/panels/OutputPane';
import type { AgentActivityEvent, PendingFileChange } from './lib/agent/types';
import type { OpenFile, ProviderKey, AiMode } from './types';

type BottomPanelTab = 'preview' | 'terminal' | 'output' | null;

// Unified model picker — one flat list spanning every provider, in the
// exact order requested: the two GPT-OSS sizes, Qwen, Codestral, then the
// two "don't know/don't care which exact model answers" catch-alls.
// Picking an entry sets both the provider AND that provider's model in one
// action, replacing the old two-step "pick provider, then pick its model"
// UI.
type UnifiedModelOption = { provider: ProviderKey; model: string; label: string };
const ALL_PROVIDER_MODELS: UnifiedModelOption[] = [
  ...GROQ_CHAT_MODEL_OPTIONS.map((o) => ({ provider: 'groq' as const, model: o.id, label: o.label })),
  ...MISTRAL_CHAT_MODEL_OPTIONS.map((o) => ({ provider: 'mistral' as const, model: o.id, label: o.label })),
  ...OPENROUTER_CHAT_MODEL_OPTIONS.map((o) => ({ provider: 'openrouter' as const, model: o.id, label: o.label })),
  ...GEMINI_CHAT_MODEL_OPTIONS.map((o) => ({ provider: 'gemini' as const, model: o.id, label: o.label })),
];
const MODEL_ORDER = [
  'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b',
  'codestral-latest', 'openrouter/free', 'gemini-3.5-flash-lite',
];
const UNIFIED_MODEL_OPTIONS: UnifiedModelOption[] = MODEL_ORDER
  .map((id) => ALL_PROVIDER_MODELS.find((m) => m.model === id))
  .filter((m): m is UnifiedModelOption => Boolean(m));

function unifiedModelKey(provider: ProviderKey, model: string): string {
  return provider + ':' + model;
}

function primaryModelFor(settings: { preferredProvider: ProviderKey; groqModel: string; mistralModel: string; openrouterModel: string; geminiModel: string }): ProviderModel {
  switch (settings.preferredProvider) {
    case 'groq': return { provider: 'groq', model: settings.groqModel };
    case 'mistral': return { provider: 'mistral', model: settings.mistralModel };
    case 'openrouter': return { provider: 'openrouter', model: settings.openrouterModel };
    case 'gemini': return { provider: 'gemini', model: settings.geminiModel };
  }
}

function apiKeysFrom(settings: { groqApiKey: string; mistralApiKey: string; openrouterApiKey: string; geminiApiKey: string }): ApiKeys {
  return {
    groq: settings.groqApiKey,
    mistral: settings.mistralApiKey,
    openrouter: settings.openrouterApiKey,
    gemini: settings.geminiApiKey,
  };
}

/* ─── SVG Icons ────────────────────────────────────────────── */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

/* ─── Settings Panel ───────────────────────────────────────── */
function SettingsPanel({
  open, onClose, settings, onSetGroqKey, onSetMistralKey, onSetOpenrouterKey, onSetGeminiKey,
  onSetInlineCompletionsEnabled, onSetAgentRequireApproval,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useSettings>['settings'];
  onSetGroqKey: (k: string) => void;
  onSetMistralKey: (k: string) => void;
  onSetOpenrouterKey: (k: string) => void;
  onSetGeminiKey: (k: string) => void;
  onSetInlineCompletionsEnabled: (enabled: boolean) => void;
  onSetAgentRequireApproval: (required: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <div className="settings-group">
          <label>Groq API Key</label>
          <input className="settings-input" type="password" placeholder="gsk_..."
            value={settings.groqApiKey} onChange={(e) => onSetGroqKey(e.target.value)} />
          <p className="settings-hint">Get a free key at console.groq.com</p>
        </div>
        <div className="settings-group">
          <label>Mistral API Key</label>
          <input className="settings-input" type="password" placeholder="..."
            value={settings.mistralApiKey} onChange={(e) => onSetMistralKey(e.target.value)} />
          <p className="settings-hint">Get a key at console.mistral.ai — used for Codestral only</p>
        </div>
        <div className="settings-group">
          <label>OpenRouter API Key</label>
          <input className="settings-input" type="password" placeholder="sk-or-..."
            value={settings.openrouterApiKey} onChange={(e) => onSetOpenrouterKey(e.target.value)} />
          <p className="settings-hint">Get a free key at openrouter.ai — always routed through their free-model router, never a paid model</p>
        </div>
        <div className="settings-group">
          <label>Gemini API Key</label>
          <input className="settings-input" type="password" placeholder="AIza..."
            value={settings.geminiApiKey} onChange={(e) => onSetGeminiKey(e.target.value)} />
          <p className="settings-hint">Get a free key at aistudio.google.com — used for Gemini 3.5 Flash-Lite</p>
        </div>
        <div className="settings-group settings-checkbox-group">
          <label className="settings-checkbox-label">
            <input type="checkbox" checked={settings.inlineCompletionsEnabled}
              onChange={(e) => onSetInlineCompletionsEnabled(e.target.checked)} />
            Ghost-text code completion as you type
          </label>
          <p className="settings-hint">Uses your selected model to suggest completions inline (like Tab-complete). Turn off to save API usage.</p>
        </div>
        <div className="settings-group settings-checkbox-group">
          <label className="settings-checkbox-label">
            <input type="checkbox" checked={settings.agentRequireApproval}
              onChange={(e) => onSetAgentRequireApproval(e.target.checked)} />
            Agent mode requires approval before applying changes
          </label>
          <p className="settings-hint">
            Recommended. When on, Agent stages every file change for you to review before anything is written.
            Deletions and renames always require approval regardless of this setting.
          </p>
        </div>
        <div className="settings-group">
          <p className="settings-hint">
            If your selected model is rate-limited or its servers are busy, requests automatically fall back to
            another model that has a key configured — you'll see which one actually replied under its response.
          </p>
        </div>
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="settings-btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── AI Edit Modal (Ctrl/Cmd+K) ──────────────────────────────── */
function AiEditModal({
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
        <h3>✨ Edit with AI — {fileName}</h3>
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

/* ─── Agent Activity Feed (Phase 10) ──────────────────────────── */
function AgentActivityFeed({ events }: { events: AgentActivityEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="agent-activity">
      {events.map((e) => (
        <div key={e.id} className={'agent-activity-row ' + e.status}>
          <span className="agent-activity-icon">
            {e.status === 'active' ? '●' : e.status === 'success' ? '✓' : e.status === 'error' ? '✕' : '·'}
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

function changeBadgeLabel(kind: PendingFileChange['kind']): string {
  switch (kind) {
    case 'create': return 'New';
    case 'update': return 'Modified';
    case 'delete': return 'Deleted';
    case 'rename': return 'Renamed';
  }
}

function ChangeDiffView({ change }: { change: PendingFileChange }) {
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

function AgentDiffModal({
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
        <h3>🤖 Agent wants to modify {changes.length} file{changes.length === 1 ? '' : 's'}</h3>
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
/* ─── Main App ─────────────────────────────────────────────── */
export default function App() {
  const {
    settings, setGroqKey, setMistralKey, setOpenrouterKey, setGeminiKey, setProvider,
    setGroqModel, setMistralModel, setOpenrouterModel, setGeminiModel,
    setInlineCompletionsEnabled, setAgentRequireApproval, hasKeys,
  } = useSettings();
  const { messages, isStreaming, error, sendMessage, clearChat } = useChat(settings);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>('ask');

  // Resizable layout — editor-pane vs chat-pane (horizontal split) and
  // editor-area vs bottom-panel (vertical split). Plain pixel sizes in
  // state, dragged via the two resizer bars below.
  const [chatPaneWidth, setChatPaneWidth] = useState(380);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(260);
  const appShellRef = useRef<HTMLDivElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<'chat' | 'bottom' | null>(null);

  // Ctrl/Cmd+K inline-edit state
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiEditInstruction, setAiEditInstruction] = useState('');
  const [aiEditLoading, setAiEditLoading] = useState(false);
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  const aiEditRangeRef = useRef<{ start: number; end: number; original: string; hasSelection: boolean } | null>(null);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const inlineCompletionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentFile = openFiles.find((f) => f.path === activeFile);

  // Lets the (registered-once) inline completion provider always read
  // current settings without needing to re-register on every keystroke.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Agent mode — the orchestrator reads openFiles fresh each run via this
  // getter rather than a stale closure, since a run can take a while and
  // the user could edit files in the meantime.
  const openFilesRef = useRef(openFiles);
  useEffect(() => { openFilesRef.current = openFiles; }, [openFiles]);
  const { isRunning: agentRunning, turn: agentTurn, run: runAgentTurn, markApplied: markAgentApplied, markRejected: markAgentRejected, dismiss: dismissAgentTurn } =
    useAgent(settings, () => openFilesRef.current);
  const [agentDiffOpen, setAgentDiffOpen] = useState(false);

  // Preview / Terminal / Output bottom panel
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>(null);
  const runner = useRunner();
  const runCurrentFile = useCallback(() => {
    if (!currentFile) return;
    runner.run(currentFile);
    setBottomPanelTab((t) => t ?? 'terminal');
  }, [currentFile, runner]);

  /* ── File Management ──────────────────────────────────────── */

  const createNewFile = useCallback(() => {
    const name = prompt('File name:', 'untitled.ts');
    if (!name) return;
    setOpenFiles((prev) => [
      ...prev,
      { path: name, name, content: '', language: detectLanguage(name), modified: true },
    ]);
    setActiveFile(name);
  }, []);

  const openFromUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      Array.from(input.files || []).forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result);
          const nf: OpenFile = {
            path: file.name, name: file.name, content,
            language: detectLanguage(file.name), modified: false,
          };
          setOpenFiles((prev) => {
            const idx = prev.findIndex((f) => f.path === file.name);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = nf;
              return next;
            }
            return [...prev, nf];
          });
          setActiveFile(file.name);
        };
        reader.readAsText(file);
      });
    };
    input.click();
  }, []);

  const closeFile = useCallback(
    (path: string) => {
      setOpenFiles((prev) => prev.filter((f) => f.path !== path));
      if (activeFile === path) {
        const remaining = openFiles.filter((f) => f.path !== path);
        setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
      }
    },
    [activeFile, openFiles],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile) return;
      setOpenFiles((prev) =>
        prev.map((f) => f.path === activeFile ? { ...f, content: value || '', modified: true } : f),
      );
    },
    [activeFile],
  );

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (!inlineCompletionDisposableRef.current) {
      inlineCompletionDisposableRef.current = registerInlineCompletionProvider(
        monaco,
        () => settingsRef.current,
      );
    }
  }, []);

  useEffect(() => () => {
    inlineCompletionDisposableRef.current?.dispose();
  }, []);

  /* ── AI code-block actions (chat → editor) ────────────────── */

  const copyCode = useCallback((code: string) => {
    navigator.clipboard?.writeText(code).catch(() => { /* ignore */ });
  }, []);

  // "Apply": full-file rewrite. If a file is open, replaces its content —
  // this is what makes "ask AI to write code" actually land in the editor
  // instead of only ever sitting in the chat transcript. If no file is
  // open, creates one so there's always somewhere for the code to go.
  const applyCodeToFile = useCallback((code: string, lang: string) => {
    if (activeFile) {
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === activeFile ? { ...f, content: code, modified: true } : f)),
      );
      return;
    }
    const ext = extensionForLanguage(lang);
    const name = prompt('Save AI code as:', 'untitled' + ext);
    if (!name) return;
    setOpenFiles((prev) => [
      ...prev,
      { path: name, name, content: code, language: detectLanguage(name), modified: true },
    ]);
    setActiveFile(name);
  }, [activeFile]);

  // "Insert": drops the snippet in at the current cursor position instead
  // of replacing the whole file — for adding a function, not rewriting one.
  const insertCodeAtCursor = useCallback((code: string) => {
    if (!activeFile || !currentFile) {
      applyCodeToFile(code, 'plaintext');
      return;
    }
    const editor = editorRef.current;
    let offset = currentFile.content.length;
    if (editor) {
      const position = editor.getPosition();
      const model = editor.getModel();
      if (position && model) offset = model.getOffsetAt(position);
    }
    setOpenFiles((prev) =>
      prev.map((f) => {
        if (f.path !== activeFile) return f;
        const before = f.content.slice(0, offset);
        const after = f.content.slice(offset);
        const leadingNewline = before && !before.endsWith('\n') ? '\n' : '';
        const trailingNewline = after && !after.startsWith('\n') ? '\n' : '';
        return { ...f, content: before + leadingNewline + code + trailingNewline + after, modified: true };
      }),
    );
  }, [activeFile, currentFile, applyCodeToFile]);

  /* ── Ctrl/Cmd+K inline edit ──────────────────────────────────── */

  const openAiEdit = useCallback((prefill?: string) => {
    if (!currentFile) return;
    const editor = editorRef.current;
    let start = 0;
    let end = currentFile.content.length;
    let original = currentFile.content;
    let hasSelection = false;

    if (editor) {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model && !selection.isEmpty()) {
        start = model.getOffsetAt(selection.getStartPosition());
        end = model.getOffsetAt(selection.getEndPosition());
        original = model.getValueInRange(selection);
        hasSelection = true;
      }
    }

    aiEditRangeRef.current = { start, end, original, hasSelection };
    setAiEditInstruction(prefill ?? '');
    setAiEditError(null);
    setAiEditOpen(true);
  }, [currentFile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!currentFile) return;
        e.preventDefault();
        openAiEdit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentFile, openAiEdit]);

  // Ctrl/Cmd+Enter — run the current file. Skipped while the AI-edit modal
  // is open since that modal uses the same combo to submit its own form.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !aiEditOpen) {
        e.preventDefault();
        runCurrentFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [aiEditOpen, runCurrentFile]);

  const submitAiEdit = useCallback(async () => {
    if (!currentFile || !activeFile || !aiEditInstruction.trim() || !aiEditRangeRef.current) return;
    const { start, end, original } = aiEditRangeRef.current;
    const primary = primaryModelFor(settings);
    const keys = apiKeysFrom(settings);

    setAiEditLoading(true);
    setAiEditError(null);
    try {
      const { text: result } = await chatWithFallback(primary, keys, [
        { role: 'system', content: INLINE_EDIT_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'File: ' + currentFile.name + '\nLanguage: ' + currentFile.language +
            '\n\nSelected code:\n```' + currentFile.language + '\n' + original + '\n```' +
            '\n\nInstruction: ' + aiEditInstruction,
        },
      ]);
      const cleaned = stripCodeFence(result);
      const targetPath = activeFile;
      setOpenFiles((prev) =>
        prev.map((f) => {
          if (f.path !== targetPath) return f;
          return { ...f, content: f.content.slice(0, start) + cleaned + f.content.slice(end), modified: true };
        }),
      );
      setAiEditOpen(false);
    } catch (err) {
      setAiEditError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setAiEditLoading(false);
    }
  }, [currentFile, activeFile, aiEditInstruction, settings]);

  /* ── Chat / Ask / Edit / Agent dispatch ──────────────────────── */

  // Clearing the chat should also dismiss any Agent turn card — previously
  // the trash button only cleared `messages`, so an Agent conversation
  // (which lives in separate `agentTurn` state) stayed on screen forever.
  const handleClearChat = useCallback(() => {
    clearChat();
    dismissAgentTurn();
  }, [clearChat, dismissAgentTurn]);

  const handleRunAgent = useCallback((instruction: string) => {
    runAgentTurn(instruction).then((outcome) => {
      if (outcome?.autoApply) {
        setOpenFiles((prev) => applyPendingChanges(prev, outcome.result.pendingChanges));
        markAgentApplied();
      }
    });
  }, [runAgentTurn, markAgentApplied]);

  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim()) return;

    if (aiMode === 'agent') {
      if (agentRunning) return;
      const instruction = chatInput;
      setChatInput('');
      handleRunAgent(instruction);
      return;
    }

    if (aiMode === 'edit') {
      if (!currentFile) return; // guarded in UI too — Edit mode needs an open file
      const instruction = chatInput;
      setChatInput('');
      openAiEdit(instruction);
      return;
    }

    if (isStreaming) return;
    sendMessage(chatInput, currentFile?.content);
    setChatInput('');
  }, [chatInput, aiMode, agentRunning, handleRunAgent, currentFile, openAiEdit, isStreaming, sendMessage]);

  const handleApplyAgentChanges = useCallback(() => {
    if (!agentTurn) return;
    setOpenFiles((prev) => applyPendingChanges(prev, agentTurn.pendingChanges));
    markAgentApplied();
    setAgentDiffOpen(false);
  }, [agentTurn, markAgentApplied]);

  const handleRejectAgentChanges = useCallback(() => {
    markAgentRejected();
    setAgentDiffOpen(false);
  }, [markAgentRejected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentTurn?.activity.length, agentTurn?.finalMessage]);

  /* ── Render ───────────────────────────────────────────────── */

  const tabClassName = (file: OpenFile) =>
    'tab' + (activeFile === file.path ? ' active' : '');

  // Single flat model picker spanning all 4 providers, replacing the old
  // provider-toggle + per-provider dropdown combo. Selecting an entry sets
  // both the provider and that provider's model field in one action.
  const selectedUnifiedKey = unifiedModelKey(settings.preferredProvider,
    settings.preferredProvider === 'groq' ? settings.groqModel
      : settings.preferredProvider === 'mistral' ? settings.mistralModel
      : settings.preferredProvider === 'openrouter' ? settings.openrouterModel
      : settings.geminiModel);

  const handleUnifiedModelChange = useCallback((key: string) => {
    const [provider, model] = key.split(':') as [ProviderKey, string];
    setProvider(provider);
    if (provider === 'groq') setGroqModel(model);
    else if (provider === 'mistral') setMistralModel(model);
    else if (provider === 'openrouter') setOpenrouterModel(model);
    else setGeminiModel(model);
  }, [setProvider, setGroqModel, setMistralModel, setOpenrouterModel, setGeminiModel]);

  /* ── Resizable panels ────────────────────────────────────────── */

  const startResize = useCallback((which: 'chat' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = which;
    document.body.style.cursor = which === 'chat' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const which = resizingRef.current;
      if (!which) return;
      if (which === 'chat' && appShellRef.current) {
        const shellRight = appShellRef.current.getBoundingClientRect().right;
        const next = Math.min(560, Math.max(280, shellRight - e.clientX));
        setChatPaneWidth(next);
      } else if (which === 'bottom' && editorPaneRef.current) {
        const paneRect = editorPaneRef.current.getBoundingClientRect();
        const next = Math.min(paneRect.height - 120, Math.max(120, paneRect.bottom - e.clientY));
        setBottomPanelHeight(next);
      }
    };
    const handleUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  return (
    <div className="app-shell" ref={appShellRef}>
      {/* Editor Pane */}
      <div className="editor-pane" ref={editorPaneRef}>
        <div className="tab-bar">
          {openFiles.map((file) => (
            <button key={file.path} className={tabClassName(file)}
              onClick={() => setActiveFile(file.path)}>
              <span>{file.name}</span>
              {file.modified && <span className="tab-modified">*</span>}
              <button className="tab-close"
                onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
                aria-label={'Close ' + file.name}>x</button>
            </button>
          ))}
          <button className="tab" onClick={createNewFile} title="New file">+</button>
          <button className="tab" onClick={openFromUpload} title="Open file">Open</button>
          <div className="tab-bar-spacer" />
          <div className="panel-toggle-group">
            <button
              className={'panel-toggle-btn' + (bottomPanelTab === 'preview' ? ' active' : '')}
              onClick={() => setBottomPanelTab((t) => (t === 'preview' ? null : 'preview'))}
              title="Live preview of open HTML/CSS/JS files"
            >
              👁 Preview
            </button>
            <button
              className={'panel-toggle-btn' + (bottomPanelTab === 'terminal' ? ' active' : '')}
              onClick={() => setBottomPanelTab((t) => (t === 'terminal' ? null : 'terminal'))}
              title="Run the current file and see a scrollback of runs (Ctrl+Enter)"
            >
              ⌨ Terminal
            </button>
            <button
              className={'panel-toggle-btn' + (bottomPanelTab === 'output' ? ' active' : '')}
              onClick={() => setBottomPanelTab((t) => (t === 'output' ? null : 'output'))}
              title="Raw output of the most recent run"
            >
              📋 Output
            </button>
          </div>
        </div>

        <div className="editor-area">
          {currentFile ? (
            <Editor
              height="100%"
              language={currentFile.language}
              value={currentFile.content}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                minimap: { enabled: true, scale: 1 },
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                formatOnPaste: true,
                suggestOnTriggerCharacters: true,
                tabSize: 2,
              }}
            />
          ) : (
            <div className="welcome">
              <h1>Mini Cursor</h1>
              <p>A lightweight AI-powered code editor with Groq &amp; Mistral.
                Open a file or create a new one to get started.</p>
              <div className="welcome-features">
                <div className="welcome-feature">
                  <div className="welcome-feature-icon">💬</div>
                  <span>AI Chat</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon">⚡</div>
                  <span>Ghost-text Completion</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon">✨</div>
                  <span>Inline Edit</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon">📥</div>
                  <span>Apply to File</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon">🤖</div>
                  <span>Agent Mode</span>
                </div>
              </div>
              <p style={{ marginTop: 12 }}>
                <kbd>Enter</kbd> to send messages &middot; <kbd>Ctrl</kbd>+<kbd>K</kbd> to edit selection with AI &middot; Add API keys in Settings
              </p>
            </div>
          )}
        </div>

        {bottomPanelTab && (
          <>
            <div className="resizer resizer-horizontal" onMouseDown={startResize('bottom')} title="Drag to resize" />
            <div className="bottom-panel" style={{ height: bottomPanelHeight }}>
              <div className="bottom-panel-header">
                <div className="bottom-panel-tabs">
                  <button className={'bottom-panel-tab' + (bottomPanelTab === 'preview' ? ' active' : '')}
                    onClick={() => setBottomPanelTab('preview')}>Preview</button>
                  <button className={'bottom-panel-tab' + (bottomPanelTab === 'terminal' ? ' active' : '')}
                    onClick={() => setBottomPanelTab('terminal')}>Terminal</button>
                  <button className={'bottom-panel-tab' + (bottomPanelTab === 'output' ? ' active' : '')}
                    onClick={() => setBottomPanelTab('output')}>Output</button>
                </div>
                <button className="icon-btn" title="Close panel" onClick={() => setBottomPanelTab(null)}>✕</button>
              </div>
              <div className="bottom-panel-body">
                {bottomPanelTab === 'preview' && (
                  <PreviewPane openFiles={openFiles} activeFilePath={activeFile} />
                )}
                {bottomPanelTab === 'terminal' && (
                  <TerminalPane
                    history={runner.history}
                    running={runner.running}
                    onRun={runCurrentFile}
                    onClear={runner.clear}
                    currentFile={currentFile}
                  />
                )}
                {bottomPanelTab === 'output' && <OutputPane latest={runner.latest} />}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="resizer resizer-vertical" onMouseDown={startResize('chat')} title="Drag to resize" />

      {/* Chat Pane */}
      <div className="chat-pane" style={{ width: chatPaneWidth, flex: '0 0 auto' }}>
        <div className="chat-header">
          <h3>💬 AI Assistant</h3>
          <div className="chat-header-actions">
            <button className="icon-btn" onClick={handleClearChat} title="Clear chat">
              <TrashIcon />
            </button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <SettingsIcon />
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {!hasKeys && (
            <div className="empty-state">
              <p>👋 Welcome! Add your API keys in Settings to start chatting.</p>
            </div>
          )}

          {messages.length === 0 && hasKeys && (
            <div className="empty-state">
              <p>Ask me anything about your code!</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {currentFile
                  ? 'Context: ' + currentFile.name
                  : 'Open a file for context-aware help'}
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const showTyping = msg.role === 'assistant' && msg.isStreaming && !msg.content;
            return (
              <div key={i} className={'message ' + msg.role + (msg.isError ? ' error' : '')}>
                <div className="message-role">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                  {msg.provider && (
                    <span className="message-provider"> · {msg.provider}{msg.model ? ' · ' + msg.model : ''}</span>
                  )}
                </div>
                {showTyping ? (
                  <div className="typing-indicator"><span /><span /><span /></div>
                ) : (
                  <div className="message-content">
                    <MessageContent
                      content={msg.content}
                      activeFileName={currentFile ? currentFile.name : null}
                      onCopyCode={copyCode}
                      onInsertCode={insertCodeAtCursor}
                      onApplyCode={applyCodeToFile}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="message error">
              <div className="message-role">Error</div>
              <div className="message-content">{error}</div>
            </div>
          )}

          {agentTurn && (
            <>
              <div className="message user">
                <div className="message-role">You <span className="message-provider"> · agent</span></div>
                <div className="message-content">{agentTurn.instruction}</div>
              </div>
              <div className="message assistant agent-turn">
                <div className="message-role">🤖 Agent</div>
                <div className="message-content">
                  {agentTurn.plan && (
                    <div className="agent-plan">
                      <div className="agent-plan-title">Plan</div>
                      <pre className="agent-plan-text">{agentTurn.plan}</pre>
                    </div>
                  )}
                  <AgentActivityFeed events={agentTurn.activity} />
                  {agentTurn.finalMessage && (
                    <div className="message-content" style={{ marginTop: 10 }}>
                      <MessageContent
                        content={agentTurn.finalMessage}
                        activeFileName={currentFile ? currentFile.name : null}
                        onCopyCode={copyCode}
                        onInsertCode={insertCodeAtCursor}
                        onApplyCode={applyCodeToFile}
                      />
                    </div>
                  )}
                  {agentTurn.pendingChanges.length > 0 && (
                    <div className="agent-changes-summary">
                      <span>
                        {agentTurn.pendingChanges.length} file change{agentTurn.pendingChanges.length === 1 ? '' : 's'} proposed
                      </span>
                      {agentTurn.awaitingApproval ? (
                        <div className="agent-approval-actions">
                          <button className="settings-btn" onClick={handleRejectAgentChanges}>Reject</button>
                          <button className="settings-btn primary" onClick={() => setAgentDiffOpen(true)}>Review changes</button>
                        </div>
                      ) : agentTurn.applied ? (
                        <span className="agent-status-note applied">✓ Applied</span>
                      ) : agentTurn.rejected ? (
                        <span className="agent-status-note rejected">✕ Rejected</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="composer">
          <div className="ai-mode-switch">
            {(['ask', 'edit', 'agent'] as AiMode[]).map((m) => (
              <button
                key={m}
                className={'ai-mode-btn' + (aiMode === m ? ' active' : '')}
                onClick={() => setAiMode(m)}
                title={
                  m === 'ask' ? 'Ask questions about your code'
                    : m === 'edit' ? 'Edit the current file (or your selection) with AI'
                    : 'Let the agent inspect and modify the project for you'
                }
              >
                {m === 'ask' ? '💬 Ask' : m === 'edit' ? '✨ Edit' : '🤖 Agent'}
              </button>
            ))}
          </div>
          <div className="composer-input-wrap">
            <textarea
              ref={textareaRef}
              className="composer-input"
              rows={3}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !hasKeys
                  ? 'Add API keys in settings first...'
                  : aiMode === 'agent'
                    ? (agentRunning ? 'Agent is working…' : 'Describe a task, e.g. "add a login page" or "fix the type errors"')
                    : aiMode === 'edit'
                      ? (currentFile ? 'Describe the edit for ' + currentFile.name + '...' : 'Open a file first to use Edit mode')
                      : currentFile
                        ? 'Ask about ' + currentFile.name + '...'
                        : 'Ask me anything...'
              }
              disabled={!hasKeys || (aiMode === 'edit' && !currentFile) || (aiMode === 'agent' && agentRunning)}
            />
            <button className="composer-send" onClick={handleSendMessage}
              disabled={
                !chatInput.trim() || !hasKeys ||
                (aiMode === 'ask' && isStreaming) ||
                (aiMode === 'edit' && !currentFile) ||
                (aiMode === 'agent' && agentRunning)
              }
              title="Send (Enter)">
              <SendIcon />
            </button>
          </div>
          <div className="composer-footer">
            <div className="composer-footer-left">
              <span>{currentFile ? currentFile.name : 'No file open'}</span>
              {currentFile && (
                <button className="ai-edit-trigger" onClick={() => openAiEdit()} title="Edit with AI (Ctrl+K)">
                  ✨ Ctrl+K
                </button>
              )}
            </div>
            <div className="composer-footer-right">
              <select
                className="model-select"
                value={selectedUnifiedKey}
                onChange={(e) => handleUnifiedModelChange(e.target.value)}
                title="Model used for chat (auto-falls back to another if this one is rate-limited or busy)"
              >
                {UNIFIED_MODEL_OPTIONS.map((opt) => (
                  <option key={unifiedModelKey(opt.provider, opt.model)} value={unifiedModelKey(opt.provider, opt.model)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSetGroqKey={setGroqKey}
        onSetMistralKey={setMistralKey}
        onSetOpenrouterKey={setOpenrouterKey}
        onSetGeminiKey={setGeminiKey}
        onSetInlineCompletionsEnabled={setInlineCompletionsEnabled}
        onSetAgentRequireApproval={setAgentRequireApproval}
      />

      <AiEditModal
        open={aiEditOpen}
        fileName={currentFile?.name ?? ''}
        hasSelection={aiEditRangeRef.current?.hasSelection ?? false}
        loading={aiEditLoading}
        error={aiEditError}
        instruction={aiEditInstruction}
        onChangeInstruction={setAiEditInstruction}
        onSubmit={submitAiEdit}
        onClose={() => setAiEditOpen(false)}
      />

      <AgentDiffModal
        open={agentDiffOpen && !!agentTurn?.awaitingApproval}
        changes={agentTurn?.pendingChanges ?? []}
        onApply={handleApplyAgentChanges}
        onReject={handleRejectAgentChanges}
        onClose={() => setAgentDiffOpen(false)}
      />
    </div>
  );
}

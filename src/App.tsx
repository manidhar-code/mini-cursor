import { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useSettings } from './hooks/useSettings';
import { useChat, INLINE_EDIT_SYSTEM_PROMPT } from './hooks/useChat';
import { useAgent } from './hooks/useAgent';
import { useRunner } from './hooks/useRunner';
import { useEditHistory } from './hooks/useEditHistory';
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
import { FileExplorer } from './lib/panels/FileExplorer';
import { CommandPalette, type Command } from './lib/panels/CommandPalette';
import { FindInProject } from './lib/panels/FindInProject';
import { EditHistoryPanel } from './lib/panels/EditHistoryPanel';
import { extractMentionedFiles, buildMentionContext, activeMentionQuery, applyMentionCompletion } from './lib/utils/mentions';
import { loadProject, saveProject, exportProjectZip, importProjectZip } from './lib/storage/project';
import { deployToNetlify, type DeployResult } from './lib/deploy/netlifyDeploy';
import { formatCode, isFormattable } from './lib/format/formatCode';
import { filterFileSelection } from './lib/utils/fileFilters';
import {
  MenuIcon, FolderOpenIcon, FileIcon, DownloadIcon, UploadIcon, WandIcon, RocketIcon,
  EyeIcon, TerminalIcon, OutputIcon, CloseIcon, SearchIcon, BugIcon, CommandIcon,
  ClockIcon, CheckIcon, PlusIcon, SparkleIcon, ZapIcon, InboxIcon, ChatIcon, BotIcon,
} from './lib/icons/Icons';
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
  onSetTheme, onSetEditorFontSize, onSetEditorTabSize, onSetNetlifyToken,
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
  onSetTheme: (theme: 'dark' | 'light') => void;
  onSetEditorFontSize: (size: number) => void;
  onSetEditorTabSize: (size: number) => void;
  onSetNetlifyToken: (token: string) => void;
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

        <div className="settings-group">
          <label>Theme</label>
          <div className="provider-toggle">
            <button
              className={'provider-btn' + (settings.theme === 'dark' ? ' active' : '')}
              onClick={() => onSetTheme('dark')}
            >
              Dark
            </button>
            <button
              className={'provider-btn' + (settings.theme === 'light' ? ' active' : '')}
              onClick={() => onSetTheme('light')}
            >
              Light
            </button>
          </div>
        </div>
        <div className="settings-group">
          <label>Editor font size ({settings.editorFontSize}px)</label>
          <input
            type="range" min={11} max={22} step={1}
            value={settings.editorFontSize}
            onChange={(e) => onSetEditorFontSize(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <div className="settings-group">
          <label>Tab size ({settings.editorTabSize} spaces)</label>
          <div className="provider-toggle">
            {[2, 4].map((size) => (
              <button
                key={size}
                className={'provider-btn' + (settings.editorTabSize === size ? ' active' : '')}
                onClick={() => onSetEditorTabSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-group">
          <label>Netlify Access Token</label>
          <input className="settings-input" type="password" placeholder="nfp_..."
            value={settings.netlifyToken} onChange={(e) => onSetNetlifyToken(e.target.value)} />
          <p className="settings-hint">
            Optional — only needed for the Deploy button. Create a personal access token at
            app.netlify.com/user/applications, under "New access token". Kept only in your browser, same as your AI provider keys.
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
function ExplainErrorModal({
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

/* ─── Agent Activity Feed (Phase 10) ──────────────────────────── */
function AgentActivityFeed({ events }: { events: AgentActivityEvent[] }) {
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
/* ─── Main App ─────────────────────────────────────────────── */
export default function App() {
  const {
    settings, setGroqKey, setMistralKey, setOpenrouterKey, setGeminiKey, setProvider,
    setGroqModel, setMistralModel, setOpenrouterModel, setGeminiModel,
    setInlineCompletionsEnabled, setAgentRequireApproval,
    setTheme, setEditorFontSize, setEditorTabSize, setNetlifyToken, hasKeys,
  } = useSettings();
  const { messages, isStreaming, error, sendMessage, clearChat } = useChat(settings);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>('ask');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Persistent projects — restore whatever was saved last time on mount.
  // Only runs once; an empty saved project (or none saved yet) just leaves
  // the normal empty-state UI in place.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const restored = loadProject();
    if (restored && restored.files.length > 0) {
      setOpenFiles(restored.files);
      setActiveFile(restored.activeFile ?? restored.files[0].path);
    }
  }, []);

  // Applies the chosen theme to the whole document (not just the Monaco
  // editor) — the CSS in index.css defines light-theme overrides under
  // [data-theme="light"].
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Autosave — debounced so rapid typing doesn't hit localStorage on every
  // keystroke. Skips the very first render (nothing to save yet / would
  // otherwise immediately overwrite what restore just loaded before it
  // finishes if effects ordering ever changes).
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!restoredRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveProject(openFiles, activeFile);
    }, 600);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [openFiles, activeFile]);

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

  // Explain Error modal
  const [explainErrorOpen, setExplainErrorOpen] = useState(false);
  const [explainErrorText, setExplainErrorText] = useState('');

  // Find-in-project / Command palette
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pendingJumpLineRef = useRef<number | null>(null);

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
  const editHistory = useEditHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
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

  // Shared by both "Open Files" and "Open Folder" — the only difference
  // between them is the `webkitdirectory` flag on the <input>, which
  // changes what the native picker shows (a file chooser vs. a folder
  // chooser). When a folder is picked, each File's `webkitRelativePath`
  // carries the folder structure (e.g. "myproject/src/App.tsx"); for a
  // plain multi-file pick that property is usually empty, so this falls
  // back to the bare filename — which is exactly the old behavior.
  const loadFilesFromInput = useCallback((files: FileList) => {
    const { toLoad, skippedJunk, skippedTooLarge, skippedOverLimit } = filterFileSelection(Array.from(files));

    if (skippedJunk > 0 || skippedTooLarge > 0 || skippedOverLimit > 0) {
      const parts: string[] = [];
      if (skippedJunk > 0) parts.push(`${skippedJunk} from node_modules/.git/build output/binary files`);
      if (skippedTooLarge > 0) parts.push(`${skippedTooLarge} larger than 1MB`);
      if (skippedOverLimit > 0) parts.push(`${skippedOverLimit} beyond the 300-file limit for one import`);
      alert(`Skipped ${skippedJunk + skippedTooLarge + skippedOverLimit} file(s): ${parts.join(', ')}.\n\nLoading ${toLoad.length} file(s).`);
    }

    toLoad.forEach((file) => {
      const path = file.webkitRelativePath || file.name;
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result);
        const nf: OpenFile = {
          path, name: file.name, content,
          language: detectLanguage(path), modified: false,
        };
        setOpenFiles((prev) => {
          const idx = prev.findIndex((f) => f.path === path);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = nf;
            return next;
          }
          return [...prev, nf];
        });
        setActiveFile(path);
      };
      reader.readAsText(file);
    });
  }, []);

  const openFromUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => { if (input.files) loadFilesFromInput(input.files); };
    input.click();
  }, [loadFilesFromInput]);

  // "Open Folder" — a real folder picker, unlike the plain multi-file
  // dialog above. Supported in Chromium browsers (Chrome, Edge) and
  // Safari; Firefox's support has historically lagged, so this is offered
  // as an addition to "Open Files", not a replacement for it.
  const openFolderFromUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => { if (input.files) loadFilesFromInput(input.files); };
    input.click();
  }, [loadFilesFromInput]);

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

  const handleImportZip = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imported = await importProjectZip(file);
        if (imported.length === 0) {
          alert('That zip had no readable text files in it.');
          return;
        }
        setOpenFiles((prev) => {
          const byPath = new Map(prev.map((f) => [f.path, f]));
          for (const f of imported) byPath.set(f.path, f);
          return [...byPath.values()];
        });
        setActiveFile(imported[0].path);
      } catch (err) {
        alert('Could not read that zip: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    input.click();
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!settings.netlifyToken.trim()) {
      alert('Add a Netlify access token in Settings first — see the hint under "Netlify Access Token".');
      setSettingsOpen(true);
      return;
    }
    setDeploying(true);
    setDeployResult(null);
    const result = await deployToNetlify(settings.netlifyToken, openFiles);
    setDeployResult(result);
    setDeploying(false);
  }, [settings.netlifyToken, openFiles]);

  const handleFormatCurrentFile = useCallback(async () => {
    if (!currentFile) return;
    setFormatting(true);
    setFormatError(null);
    const result = await formatCode(currentFile.content, currentFile.language);
    setFormatting(false);
    if (!result.ok) {
      setFormatError(result.error);
      alert('Formatting failed: ' + result.error);
      return;
    }
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === currentFile.path ? { ...f, content: result.code, modified: true } : f)),
    );
  }, [currentFile]);

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
      editHistory.record('AI Edit: ' + currentFile.name, openFilesRef.current);
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
  }, [currentFile, activeFile, aiEditInstruction, settings, editHistory]);

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
        editHistory.record('Agent: ' + instruction.slice(0, 60), openFilesRef.current);
        setOpenFiles((prev) => applyPendingChanges(prev, outcome.result.pendingChanges));
        markAgentApplied();
      }
    });
  }, [runAgentTurn, markAgentApplied, editHistory]);

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

    // Expand any "@filename" mentions into extra file context, on top of
    // the current file's own content (kept separate so the current file
    // isn't duplicated if someone also @-mentions it).
    const mentioned = extractMentionedFiles(chatInput, openFiles).filter((f) => f.path !== activeFile);
    const mentionBlock = mentioned.length > 0 ? buildMentionContext(mentioned) : '';
    const combinedContext = [currentFile?.content, mentionBlock].filter(Boolean).join('\n\n');

    sendMessage(chatInput, combinedContext || undefined);
    setChatInput('');
    setMentionQuery(null);
  }, [chatInput, aiMode, agentRunning, handleRunAgent, currentFile, openFiles, activeFile, openAiEdit, isStreaming, sendMessage]);

  const handleApplyAgentChanges = useCallback(() => {
    if (!agentTurn) return;
    editHistory.record('Agent: ' + agentTurn.pendingChanges.map((c) => c.path).join(', '), openFilesRef.current);
    setOpenFiles((prev) => applyPendingChanges(prev, agentTurn.pendingChanges));
    markAgentApplied();
    setAgentDiffOpen(false);
  }, [agentTurn, markAgentApplied, editHistory]);

  const handleRejectAgentChanges = useCallback(() => {
    markAgentRejected();
    setAgentDiffOpen(false);
  }, [markAgentRejected]);

  // Reverting restores the snapshot taken right before that entry's edit —
  // and, so revert itself is undoable, first records the *current* state
  // as a new history entry before jumping back.
  const revertToEntry = useCallback((id: string) => {
    const entry = editHistory.history.find((h) => h.id === id);
    if (!entry) return;
    editHistory.record('Before revert to: ' + entry.label, openFilesRef.current);
    setOpenFiles(entry.snapshot);
  }, [editHistory]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  /* ── Review file / Explain error ─────────────────────────────── */

  const handleReviewFile = useCallback(() => {
    if (!currentFile || isStreaming) return;
    setAiMode('ask');
    sendMessage(
      `Please review this file for bugs, unused code, unclear naming, and possible improvements. Be specific and reference the relevant part of the code for each point. If it looks solid, say so plainly rather than inventing nitpicks.`,
      currentFile.content,
    );
  }, [currentFile, isStreaming, sendMessage]);

  const openExplainError = useCallback(() => {
    setExplainErrorText('');
    setExplainErrorOpen(true);
  }, []);

  const submitExplainError = useCallback(() => {
    if (!explainErrorText.trim() || isStreaming) return;
    setAiMode('ask');
    sendMessage(
      `I'm seeing this error/stack trace:\n\n${explainErrorText}\n\nPlease explain what's causing it and suggest a fix.`,
      currentFile?.content,
    );
    setExplainErrorOpen(false);
  }, [explainErrorText, isStreaming, currentFile, sendMessage]);

  /* ── Find in project / Command palette ───────────────────────── */

  const jumpToFile = useCallback((path: string, lineNumber?: number) => {
    if (lineNumber) pendingJumpLineRef.current = lineNumber;
    setActiveFile(path);
  }, []);

  // Once the editor has (re)mounted for the newly-active file, jump to the
  // pending line from a Find-in-project result, if there is one.
  useEffect(() => {
    if (pendingJumpLineRef.current == null) return;
    const line = pendingJumpLineRef.current;
    pendingJumpLineRef.current = null;
    const editor = editorRef.current;
    if (!editor) return;
    // Small delay — Monaco needs a tick to finish swapping to the new
    // file's model before revealLineInCenter/setPosition have any effect.
    const t = setTimeout(() => {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [activeFile]);

  const paletteCommands: Command[] = [
    { id: 'new-file', label: 'New File', hint: 'Ctrl+click supports folder paths', action: createNewFile },
    { id: 'open-file', label: 'Open File(s)…', action: openFromUpload },
    { id: 'open-folder', label: 'Open Folder…', hint: 'keeps folder structure', action: openFolderFromUpload },
    { id: 'export-zip', label: 'Export Project as .zip', action: () => exportProjectZip(openFiles).catch((err) => alert('Export failed: ' + (err instanceof Error ? err.message : String(err)))) },
    { id: 'import-zip', label: 'Import Project from .zip', action: handleImportZip },
    { id: 'toggle-explorer', label: explorerOpen ? 'Hide File Explorer' : 'Show File Explorer', action: () => setExplorerOpen((v) => !v) },
    { id: 'toggle-preview', label: 'Toggle Preview Panel', action: () => setBottomPanelTab((t) => (t === 'preview' ? null : 'preview')) },
    { id: 'toggle-terminal', label: 'Toggle Terminal Panel', action: () => setBottomPanelTab((t) => (t === 'terminal' ? null : 'terminal')) },
    { id: 'toggle-output', label: 'Toggle Output Panel', action: () => setBottomPanelTab((t) => (t === 'output' ? null : 'output')) },
    { id: 'run-file', label: 'Run Current File', hint: 'Ctrl+Enter', action: runCurrentFile },
    { id: 'format-file', label: 'Format Current File with Prettier', action: handleFormatCurrentFile },
    { id: 'deploy', label: 'Deploy to Netlify', action: handleDeploy },
    { id: 'review-file', label: 'AI: Review Current File', action: handleReviewFile },
    { id: 'explain-error', label: 'AI: Explain an Error…', action: openExplainError },
    { id: 'find-in-project', label: 'Find in Project…', hint: 'Ctrl+Shift+F', action: () => setFindOpen(true) },
    { id: 'edit-history', label: 'View AI Edit History', action: () => setHistoryOpen(true) },
    { id: 'toggle-theme', label: settings.theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme', action: () => setTheme(settings.theme === 'dark' ? 'light' : 'dark') },
    { id: 'open-settings', label: 'Open Settings', action: () => setSettingsOpen(true) },
    { id: 'clear-chat', label: 'Clear Chat', action: clearChat },
  ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPaletteOpen(false);
        setFindOpen(true);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setFindOpen(false);
        setPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setFindOpen(false);
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      {explorerOpen && (
        <FileExplorer
          files={openFiles}
          activeFile={activeFile}
          onSelect={setActiveFile}
          onDelete={closeFile}
          onNewFile={createNewFile}
        />
      )}
      {/* Editor Pane */}
      <div className="editor-pane" ref={editorPaneRef}>
        <div className="editor-header">
          <div className="toolbar-row">
            <button className="toolbar-btn" onClick={createNewFile} title="New file (you can type a folder path, e.g. src/App.tsx)">
              <PlusIcon size={14} /><span>New</span>
            </button>
            <button className="toolbar-btn" onClick={openFromUpload} title="Open one or more individual files">
              <FileIcon size={14} /><span>Open Files</span>
            </button>
            <button className="toolbar-btn" onClick={openFolderFromUpload} title="Open a whole folder, keeping its folder structure (Chrome/Edge/Safari)">
              <FolderOpenIcon size={14} /><span>Open Folder</span>
            </button>
            <span className="toolbar-divider" />
            <button
              className="toolbar-btn"
              title="Export the whole project as a .zip"
              onClick={() => exportProjectZip(openFiles).catch((err) => alert('Export failed: ' + (err instanceof Error ? err.message : String(err))))}
              disabled={openFiles.length === 0}
            >
              <DownloadIcon size={14} /><span>Export</span>
            </button>
            <button className="toolbar-btn" onClick={handleImportZip} title="Import a project from a .zip">
              <UploadIcon size={14} /><span>Import</span>
            </button>
            {currentFile && isFormattable(currentFile.language) && (
              <button className="toolbar-btn" onClick={handleFormatCurrentFile} disabled={formatting} title="Format this file with Prettier">
                <WandIcon size={14} /><span>{formatting ? 'Formatting…' : 'Format'}</span>
              </button>
            )}
            <span className="toolbar-divider" />
            <button className="toolbar-btn accent" onClick={handleDeploy} disabled={deploying} title="Deploy the current HTML/CSS/JS files to Netlify">
              <RocketIcon size={14} /><span>{deploying ? 'Deploying…' : 'Deploy'}</span>
            </button>
            <div className="tab-bar-spacer" />
            <div className="panel-toggle-group">
              <button
                className={'panel-toggle-btn' + (bottomPanelTab === 'preview' ? ' active' : '')}
                onClick={() => setBottomPanelTab((t) => (t === 'preview' ? null : 'preview'))}
                title="Live preview of open HTML/CSS/JS files"
              >
                <EyeIcon size={14} /><span>Preview</span>
              </button>
              <button
                className={'panel-toggle-btn' + (bottomPanelTab === 'terminal' ? ' active' : '')}
                onClick={() => setBottomPanelTab((t) => (t === 'terminal' ? null : 'terminal'))}
                title="Run the current file and see a scrollback of runs (Ctrl+Enter)"
              >
                <TerminalIcon size={14} /><span>Terminal</span>
              </button>
              <button
                className={'panel-toggle-btn' + (bottomPanelTab === 'output' ? ' active' : '')}
                onClick={() => setBottomPanelTab((t) => (t === 'output' ? null : 'output'))}
                title="Raw output of the most recent run"
              >
                <OutputIcon size={14} /><span>Output</span>
              </button>
            </div>
          </div>

          <div className="tab-bar">
            <button className="tab icon-only" onClick={() => setExplorerOpen((v) => !v)} title="Toggle file explorer">
              <MenuIcon size={15} />
            </button>
            {openFiles.map((file) => (
              <button key={file.path} className={tabClassName(file)}
                onClick={() => setActiveFile(file.path)}>
                <span>{file.name}</span>
                {file.modified && <span className="tab-modified">•</span>}
                <button className="tab-close"
                  onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
                  aria-label={'Close ' + file.name}>
                  <CloseIcon size={12} />
                </button>
              </button>
            ))}
          </div>

          {deployResult && (
            <div className={'deploy-banner' + (deployResult.ok ? ' ok' : ' fail')}>
              {deployResult.ok ? (
                <span>
                  <CheckIcon size={13} /> Deployed — <a href={deployResult.url} target="_blank" rel="noreferrer">{deployResult.url}</a>
                </span>
              ) : (
                <span><CloseIcon size={13} /> Deploy failed — {deployResult.error}</span>
              )}
              <button className="icon-btn" title="Dismiss" onClick={() => setDeployResult(null)}><CloseIcon size={13} /></button>
            </div>
          )}
        </div>

        <div className="editor-area">
          {currentFile ? (
            <Editor
              height="100%"
              language={currentFile.language}
              value={currentFile.content}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme={settings.theme === 'light' ? 'vs' : 'vs-dark'}
              options={{
                fontSize: settings.editorFontSize,
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
                tabSize: settings.editorTabSize,
              }}
            />
          ) : (
            <div className="welcome">
              <h1>Mini Cursor</h1>
              <p>A lightweight AI-powered code editor with Groq &amp; Mistral.
                Open a file or create a new one to get started.</p>
              <div className="welcome-features">
                <div className="welcome-feature">
                  <div className="welcome-feature-icon"><ChatIcon size={18} /></div>
                  <span>AI Chat</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon"><ZapIcon size={18} /></div>
                  <span>Ghost-text Completion</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon"><SparkleIcon size={18} /></div>
                  <span>Inline Edit</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon"><InboxIcon size={18} /></div>
                  <span>Apply to File</span>
                </div>
                <div className="welcome-feature">
                  <div className="welcome-feature-icon"><BotIcon size={18} /></div>
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
                <button className="icon-btn" title="Close panel" onClick={() => setBottomPanelTab(null)}><CloseIcon size={14} /></button>
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
          <h3 className="modal-title"><ChatIcon size={16} /> AI Assistant</h3>
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
              <p>Welcome! Add your API keys in Settings to start chatting.</p>
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
                <div className="message-role"><BotIcon size={12} /> Agent</div>
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
                        <span className="agent-status-note applied"><CheckIcon size={12} /> Applied</span>
                      ) : agentTurn.rejected ? (
                        <span className="agent-status-note rejected"><CloseIcon size={12} /> Rejected</span>
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
                {m === 'ask' ? <><ChatIcon size={13} /> Ask</> : m === 'edit' ? <><SparkleIcon size={13} /> Edit</> : <><BotIcon size={13} /> Agent</>}
              </button>
            ))}
          </div>
          <div className="composer-input-wrap" style={{ position: 'relative' }}>
            {mentionQuery !== null && (() => {
              const q = mentionQuery.toLowerCase();
              const matches = openFiles.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 6);
              if (matches.length === 0) return null;
              return (
                <div className="mention-dropdown">
                  {matches.map((f) => (
                    <button
                      key={f.path}
                      className="mention-dropdown-item"
                      onClick={() => {
                        const textarea = textareaRef.current;
                        const cursor = textarea?.selectionStart ?? chatInput.length;
                        const { text, cursorPos } = applyMentionCompletion(chatInput, cursor, f.path);
                        setChatInput(text);
                        setMentionQuery(null);
                        requestAnimationFrame(() => {
                          textarea?.focus();
                          textarea?.setSelectionRange(cursorPos, cursorPos);
                        });
                      }}
                    >
                      <FileIcon size={12} /> {f.path}
                    </button>
                  ))}
                </div>
              );
            })()}
            <textarea
              ref={textareaRef}
              className="composer-input"
              rows={3}
              value={chatInput}
              onChange={(e) => {
                setChatInput(e.target.value);
                setMentionQuery(activeMentionQuery(e.target.value, e.target.selectionStart));
              }}
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
                  <SparkleIcon size={12} /> Ctrl+K
                </button>
              )}
              {currentFile && (
                <button className="ai-edit-trigger" onClick={handleReviewFile} disabled={isStreaming} title="AI reviews the current file for bugs/improvements">
                  <SearchIcon size={12} /> Review
                </button>
              )}
              <button className="ai-edit-trigger" onClick={openExplainError} disabled={isStreaming} title="Paste an error/stack trace for the AI to explain">
                <BugIcon size={12} /> Explain Error
              </button>
              <button className="ai-edit-trigger" onClick={() => setFindOpen(true)} title="Find in Project (Ctrl+Shift+F)">
                <SearchIcon size={12} /> Find
              </button>
              <button className="ai-edit-trigger" onClick={() => setPaletteOpen(true)} title="Command Palette (Ctrl+Shift+P)">
                <CommandIcon size={12} /> Palette
              </button>
              <button className="ai-edit-trigger" onClick={() => setHistoryOpen(true)} title="View/revert AI edit history">
                <ClockIcon size={12} /> History{editHistory.history.length > 0 ? ` (${editHistory.history.length})` : ''}
              </button>
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
        onSetTheme={setTheme}
        onSetEditorFontSize={setEditorFontSize}
        onSetEditorTabSize={setEditorTabSize}
        onSetNetlifyToken={setNetlifyToken}
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

      <ExplainErrorModal
        open={explainErrorOpen}
        fileName={currentFile?.name ?? ''}
        loading={isStreaming}
        errorText={explainErrorText}
        onChangeErrorText={setExplainErrorText}
        onSubmit={submitExplainError}
        onClose={() => setExplainErrorOpen(false)}
      />

      <FindInProject
        open={findOpen}
        onClose={() => setFindOpen(false)}
        files={openFiles}
        onJumpTo={jumpToFile}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      <EditHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={editHistory.history}
        onRevert={(id) => { revertToEntry(id); setHistoryOpen(false); }}
      />
    </div>
  );
}

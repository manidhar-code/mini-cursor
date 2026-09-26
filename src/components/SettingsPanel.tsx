import type { useSettings } from '../hooks/useSettings';

/* ─── Settings Panel ───────────────────────────────────────── */
export function SettingsPanel({
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

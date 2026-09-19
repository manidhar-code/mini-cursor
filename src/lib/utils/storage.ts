import type { ProviderSettings } from '../../types';
import { GROQ_MODELS } from '../api/groq';
import { MISTRAL_MODELS } from '../api/mistral';

const SETTINGS_KEY = 'mini-cursor-settings';

const DEFAULT_SETTINGS: ProviderSettings = {
  groqApiKey: '',
  mistralApiKey: '',
  preferredProvider: 'groq',
  groqModel: GROQ_MODELS.chat,
  mistralModel: MISTRAL_MODELS.chat,
  inlineCompletionsEnabled: true,
  agentRequireApproval: true, // Phase 15: safe by default
};

export function loadSettings(): ProviderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: ProviderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

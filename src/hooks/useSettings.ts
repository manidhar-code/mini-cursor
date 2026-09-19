import { useState, useEffect, useCallback } from 'react';
import { loadSettings, saveSettings } from '../lib/utils/storage';
import type { ProviderSettings, ProviderKey } from '../types';

export function useSettings() {
  const [settings, setSettings] = useState<ProviderSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setGroqKey = useCallback((key: string) => {
    setSettings((s) => ({ ...s, groqApiKey: key }));
  }, []);

  const setMistralKey = useCallback((key: string) => {
    setSettings((s) => ({ ...s, mistralApiKey: key }));
  }, []);

  const setOpenrouterKey = useCallback((key: string) => {
    setSettings((s) => ({ ...s, openrouterApiKey: key }));
  }, []);

  const setGeminiKey = useCallback((key: string) => {
    setSettings((s) => ({ ...s, geminiApiKey: key }));
  }, []);

  const setProvider = useCallback((provider: ProviderKey) => {
    setSettings((s) => ({ ...s, preferredProvider: provider }));
  }, []);

  const setGroqModel = useCallback((model: string) => {
    setSettings((s) => ({ ...s, groqModel: model }));
  }, []);

  const setMistralModel = useCallback((model: string) => {
    setSettings((s) => ({ ...s, mistralModel: model }));
  }, []);

  const setOpenrouterModel = useCallback((model: string) => {
    setSettings((s) => ({ ...s, openrouterModel: model }));
  }, []);

  const setGeminiModel = useCallback((model: string) => {
    setSettings((s) => ({ ...s, geminiModel: model }));
  }, []);

  const setInlineCompletionsEnabled = useCallback((enabled: boolean) => {
    setSettings((s) => ({ ...s, inlineCompletionsEnabled: enabled }));
  }, []);

  const setAgentRequireApproval = useCallback((required: boolean) => {
    setSettings((s) => ({ ...s, agentRequireApproval: required }));
  }, []);

  const hasKeys = Boolean(
    settings.groqApiKey || settings.mistralApiKey || settings.openrouterApiKey || settings.geminiApiKey,
  );

  return {
    settings,
    setGroqKey,
    setMistralKey,
    setOpenrouterKey,
    setGeminiKey,
    setProvider,
    setGroqModel,
    setMistralModel,
    setOpenrouterModel,
    setGeminiModel,
    setInlineCompletionsEnabled,
    setAgentRequireApproval,
    hasKeys,
  };
}

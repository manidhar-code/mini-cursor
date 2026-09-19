export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
};

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  role: MessageRole;
  content: string;
  provider?: ProviderKey;
  model?: string;
  isError?: boolean;
  isStreaming?: boolean;
};

export type ProviderKey = 'groq' | 'mistral' | 'openrouter' | 'gemini';

export type ModelOption = {
  id: string;
  label: string;
};

export type ProviderSettings = {
  groqApiKey: string;
  mistralApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  preferredProvider: ProviderKey;
  groqModel: string;
  mistralModel: string;
  openrouterModel: string;
  geminiModel: string;
  inlineCompletionsEnabled: boolean;
  agentRequireApproval: boolean;
};

export type AiMode = 'ask' | 'edit' | 'agent';

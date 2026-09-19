// OpenRouter API Client
//
// OpenRouter exposes an OpenAI-compatible chat-completions endpoint over
// 300+ models from many providers. Pricing varies wildly per model — most
// are metered — so to guarantee this app can NEVER rack up a bill through
// OpenRouter, the only model wired up here is `openrouter/free`: OpenRouter's
// own "Free Models Router". It's a real routed endpoint (not a client-side
// filter) that automatically picks among OpenRouter's currently-free
// (":free"-suffixed) models on every request, filtering for whichever
// features the request needs (tool calling included), at a guaranteed
// $0/M input and $0/M output. That also matches why this provider exists in
// this app at all: it's the "we don't know / don't care which exact model
// answers, just don't charge us" option — OpenRouter's free router does
// exactly that, and if a given free model has a rough day, the router itself
// moves on to a different free model on its own, without any input from
// this app's code.
import type { AgentMessage, ToolDefinition, ToolChatResult } from './agentTypes';
export type { ToolDefinition, ToolCall, AgentMessage } from './agentTypes';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export const OPENROUTER_MODELS = {
  chat: 'openrouter/free',
} as const;

export const OPENROUTER_CHAT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'openrouter/free', label: 'OpenRouter (auto free model)' },
];

export type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey,
    // Optional per OpenRouter's docs — only affects whether this app shows
    // up on their public leaderboards, never billing or access.
    'X-Title': 'Mini Cursor',
  };
}

/**
 * Stream a chat completion from OpenRouter.
 */
export async function streamChat(
  apiKey: string,
  messages: OpenRouterChatMessage[],
  callbacks: StreamCallbacks,
  model: string = OPENROUTER_MODELS.chat,
): Promise<void> {
  const res = await fetch(OPENROUTER_BASE + '/chat/completions', {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.3, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('OpenRouter API error ' + res.status + ': ' + errBody);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          callbacks.onDone(fullText);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            callbacks.onToken(delta);
          }
        } catch {
          // skip malformed / keep-alive chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone(fullText);
}

/**
 * Non-streaming chat completion from OpenRouter.
 */
export async function chat(
  apiKey: string,
  messages: OpenRouterChatMessage[],
  model: string = OPENROUTER_MODELS.chat,
): Promise<string> {
  const res = await fetch(OPENROUTER_BASE + '/chat/completions', {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('OpenRouter API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Chat completion with OpenAI-style tool calling. The free router filters
 * for tool-calling-capable free models automatically when `tools` is present.
 */
export async function chatWithTools(
  apiKey: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  model: string = OPENROUTER_MODELS.chat,
): Promise<ToolChatResult> {
  const res = await fetch(OPENROUTER_BASE + '/chat/completions', {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('OpenRouter API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  return { content: msg.content ?? '', toolCalls: msg.tool_calls ?? [] };
}

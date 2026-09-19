// Mistral API Client — Codestral for completions, Large for complex tasks
//
// Model choice: all three models below are reachable at $0 on Mistral's
// free "Experiment" plan on La Plateforme (console.mistral.ai) — a
// rate-limited tier (no per-token billing) that requires opting into
// data-training use and phone verification, rather than a paid plan.
// Unlike Groq, Mistral doesn't put every model behind the same free door —
// so if this key isn't on the Experiment plan, calls to any of these will
// 401/429 with a billing error, not silently downgrade. Worth surfacing
// that in Settings if users report failures.
//
// Fit for a mini-cursor style code editor:
//   - completion (codestral-latest): Mistral's dedicated fill-in-the-middle
//     code model — the right tool for ghost-text/inline completion, not a
//     general chat model pressed into service.
//   - codeChat (mistral-medium-latest): balanced cost/quality, good default
//     for everyday "explain/fix this code" chat.
//   - chat (mistral-large-latest): strongest reasoning, best for harder
//     multi-file refactors or architecture questions — heavier on the
//     shared free-tier rate limit, so it's the "when it matters" option
//     rather than the default for quick exchanges.
import type { AgentMessage, ToolDefinition, ToolChatResult } from './agentTypes';
export type { ToolDefinition, ToolCall, AgentMessage } from './agentTypes';

const MISTRAL_BASE = 'https://api.mistral.ai/v1';

export const MISTRAL_MODELS = {
  chat: 'mistral-large-latest',
  codeChat: 'mistral-medium-latest',
  completion: 'codestral-latest',
} as const;

// Models selectable for chat/assistant use in the UI. Codestral is included
// here (not just for ghost-text completion) since it's a strong pick for
// code-focused conversations.
export const MISTRAL_CHAT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'mistral-large-latest', label: 'Mistral Large (best reasoning)' },
  { id: 'mistral-medium-latest', label: 'Mistral Medium (balanced)' },
  { id: 'codestral-latest', label: 'Codestral (code specialist)' },
];

export type MistralChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

/**
 * Stream a chat completion from Mistral.
 */
export async function streamChat(
  apiKey: string,
  messages: MistralChatMessage[],
  callbacks: StreamCallbacks,
  model: string = MISTRAL_MODELS.chat,
): Promise<void> {
  const res = await fetch(MISTRAL_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Mistral API error ' + res.status + ': ' + errBody);
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
          // skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone(fullText);
}

/**
 * Non-streaming chat completion from Mistral.
 */
export async function chat(
  apiKey: string,
  messages: MistralChatMessage[],
  model: string = MISTRAL_MODELS.chat,
): Promise<string> {
  const res = await fetch(MISTRAL_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Mistral API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Code completion via Codestral, using Mistral's real fill-in-the-middle
 * (FIM) endpoint rather than the general chat-completions endpoint.
 *
 * Codestral is trained specifically for this task/prompt shape (prefix +
 * suffix, no instructions in between), so this gives noticeably tighter,
 * more reliable completions than asking a chat model to "fill in the
 * <CURSOR> marker" — no risk of the model adding commentary, re-explaining
 * the surrounding code, or drifting from the FIM training distribution.
 * Same `api.mistral.ai` base/key as everything else, so it's still covered
 * by the free Experiment plan.
 */
export async function completeFIM(
  apiKey: string,
  prefix: string,
  suffix: string,
): Promise<string> {
  const res = await fetch(MISTRAL_BASE + '/fim/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: MISTRAL_MODELS.completion,
      prompt: prefix,
      suffix,
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!res.ok) throw new Error('Mistral FIM completion error ' + res.status);

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Chat completion with OpenAI-style function/tool calling — same contract
 * as groq.ts's chatWithTools, so the agent orchestrator can treat both
 * providers identically. Mistral's La Plateforme chat-completions endpoint
 * supports `tools`/`tool_choice` the same way.
 */
export async function chatWithTools(
  apiKey: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  model: string = MISTRAL_MODELS.chat,
): Promise<ToolChatResult> {
  const res = await fetch(MISTRAL_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Mistral API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  return {
    content: msg.content ?? '',
    toolCalls: msg.tool_calls ?? [],
  };
}

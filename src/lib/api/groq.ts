// Groq API Client — fast inference for code completion and chat
//
// Model choice: every model below is served on Groq's free developer tier
// (no credit card, rate-limited to ~30 req/min & 14,400 req/day rather than
// billed per token). Every one is open-weight (not merely free-to-call) —
// OpenAI's GPT-OSS and Alibaba's Qwen3 series — so nothing here can
// surprise-bill the user and there's no proprietary-weights lock-in.
//
// NOTE: `qwen/qwen3-32b` (the previous completion model) was deprecated and
// shut down by Groq on 07/17/26. Groq's own migration guidance points
// qwen3-32b users to `openai/gpt-oss-120b` (quality) or `openai/gpt-oss-20b`
// (speed) — we use the 20B variant for completions since inline/ghost-text
// completion is latency-sensitive and needs a fast round-trip.
//
// `qwen/qwen3.8-27b` — Groq's current free-tier Qwen model for agentic
// coding, with a 131K context window and confirmed tool-calling support,
// so it works with Agent Mode's function-calling flow with no other code
// changes needed.
//
// CORRECTION: an earlier version of this file used `qwen/qwen3.6-27b`.
// Groq has since silently withdrawn that model from GroqCloud (no formal
// deprecation notice — it was simply removed; calls to it now 404).
// qwen3.8-27b is the surviving model in that family and is used here
// instead.
import type { AgentMessage, ToolDefinition, ToolChatResult } from './agentTypes';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export const GROQ_MODELS = {
  chat: 'openai/gpt-oss-120b',       // best reasoning/coding quality, still free tier
  fastChat: 'openai/gpt-oss-20b',    // fastest response, good for quick Q&A
  completion: 'openai/gpt-oss-20b',  // low-latency, suited to inline ghost-text completion
} as const;

// Models selectable for chat/assistant use in the UI — all free-tier,
// open-weight Groq models suited to a code assistant.
export const GROQ_CHAT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (best quality)' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (fastest)' },
  { id: 'qwen/qwen3.8-27b', label: 'Qwen3.8 27B (agentic coding, 131K context)' },
];

export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type { ToolDefinition, ToolCall, AgentMessage } from './agentTypes';

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

/**
 * Stream a chat completion from Groq.
 */
export async function streamChat(
  apiKey: string,
  messages: GroqChatMessage[],
  callbacks: StreamCallbacks,
  model: string = GROQ_MODELS.chat,
): Promise<void> {
  const res = await fetch(GROQ_BASE + '/chat/completions', {
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
    throw new Error('Groq API error ' + res.status + ': ' + errBody);
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
 * Non-streaming chat completion from Groq.
 */
export async function chat(
  apiKey: string,
  messages: GroqChatMessage[],
  model: string = GROQ_MODELS.chat,
): Promise<string> {
  const res = await fetch(GROQ_BASE + '/chat/completions', {
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
    throw new Error('Groq API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Code completion via Groq.
 */
export async function complete(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(GROQ_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: GROQ_MODELS.completion,
      messages: [
        {
          role: 'system',
          content: 'You are a code completion engine. Complete the code at the cursor position. Output ONLY the completion text, no explanations, no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!res.ok) throw new Error('Groq completion error ' + res.status);

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Chat completion with OpenAI-style function/tool calling — the primitive
 * the agent loop is built on. Non-streaming: the orchestrator needs the
 * full set of tool calls (if any) before it can decide what to execute
 * next, so there's nothing useful to stream here.
 */
export async function chatWithTools(
  apiKey: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  model: string = GROQ_MODELS.chat,
): Promise<ToolChatResult> {
  const res = await fetch(GROQ_BASE + '/chat/completions', {
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
    throw new Error('Groq API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  return {
    content: msg.content ?? '',
    toolCalls: msg.tool_calls ?? [],
  };
}

// Gemini API Client (Google AI Studio / Generative Language API)
//
// Unlike Groq/Mistral/OpenRouter, Gemini is NOT OpenAI-compatible — it uses
// its own `contents`/`parts` request shape, a `model` role instead of
// `assistant`, a `function` role for tool results instead of `tool`, and
// function calls come back as `functionCall` parts rather than
// OpenAI-style `tool_calls`. Everything in this file exists to adapt
// between that shape and the AgentMessage/ToolDefinition/ToolCall shape
// the rest of this app already speaks, so callers never need to know
// Gemini works differently under the hood.
//
// Model: gemini-3.5-flash-lite — Google's fastest, cheapest 3.5-series
// model, free at the API level (rate-limited: no billing without opting
// into a paid tier) via Google AI Studio.
import type { AgentMessage, ToolDefinition, ToolChatResult, ToolCall } from './agentTypes';
export type { ToolDefinition, ToolCall, AgentMessage } from './agentTypes';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_MODELS = {
  chat: 'gemini-3.5-flash-lite',
} as const;

export const GEMINI_CHAT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
];

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

type GeminiPart = { text?: string; functionCall?: { name: string; args: unknown }; functionResponse?: { name: string; response: unknown } };
type GeminiContent = { role: 'user' | 'model' | 'function'; parts: GeminiPart[] };

/** Converts our unified AgentMessage[] into Gemini's systemInstruction +
 * contents shape. Tool-result messages need the ORIGINAL function name,
 * which Gemini requires but our `tool` messages only carry a
 * `tool_call_id` for — so this walks forward tracking id→name from each
 * assistant message's tool_calls as it goes. */
function toGeminiRequest(messages: AgentMessage[]): { systemInstruction?: { parts: GeminiPart[] }; contents: GeminiContent[] } {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];
  const callIdToName = new Map<string, string>();

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push({ text: m.content });
      continue;
    }
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.tool_calls ?? []) {
        callIdToName.set(call.id, call.function.name);
        let args: unknown = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* leave empty */ }
        parts.push({ functionCall: { name: call.function.name, args } });
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }
    if (m.role === 'tool') {
      const name = (m.tool_call_id && callIdToName.get(m.tool_call_id)) || 'unknown_function';
      let responseObj: unknown;
      try { responseObj = JSON.parse(m.content); } catch { responseObj = { result: m.content }; }
      contents.push({ role: 'function', parts: [{ functionResponse: { name, response: responseObj } }] });
    }
  }

  return systemParts.length > 0 ? { systemInstruction: { parts: systemParts }, contents } : { contents };
}

function toGeminiTools(tools: ToolDefinition[]): { functionDeclarations: { name: string; description: string; parameters: unknown }[] }[] {
  if (!tools.length) return [];
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }];
}

function extractText(candidate: any): string {
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}

function extractToolCalls(candidate: any): ToolCall[] {
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  return parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: 'gemini_call_' + Date.now() + '_' + i,
      type: 'function' as const,
      function: {
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args ?? {}),
      },
    }));
}

/**
 * Non-streaming chat completion from Gemini.
 */
export async function chat(
  apiKey: string,
  messages: AgentMessage[],
  model: string = GEMINI_MODELS.chat,
): Promise<string> {
  const { systemInstruction, contents } = toGeminiRequest(messages);
  const res = await fetch(GEMINI_BASE + '/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Gemini API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  return extractText(data.candidates?.[0]);
}

/**
 * Stream a chat completion from Gemini via its SSE endpoint.
 */
export async function streamChat(
  apiKey: string,
  messages: AgentMessage[],
  callbacks: StreamCallbacks,
  model: string = GEMINI_MODELS.chat,
): Promise<void> {
  const { systemInstruction, contents } = toGeminiRequest(messages);
  const res = await fetch(GEMINI_BASE + '/models/' + model + ':streamGenerateContent?alt=sse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Gemini API error ' + res.status + ': ' + errBody);
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
        try {
          const parsed = JSON.parse(data);
          const delta = extractText(parsed.candidates?.[0]);
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
 * Chat completion with tool/function calling — converts to/from Gemini's
 * functionDeclarations/functionCall shape so the agent orchestrator can
 * treat Gemini exactly like the OpenAI-compatible providers.
 */
export async function chatWithTools(
  apiKey: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  model: string = GEMINI_MODELS.chat,
): Promise<ToolChatResult> {
  const { systemInstruction, contents } = toGeminiRequest(messages);
  const res = await fetch(GEMINI_BASE + '/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      tools: toGeminiTools(tools),
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Gemini API error ' + res.status + ': ' + errBody);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  return { content: extractText(candidate), toolCalls: extractToolCalls(candidate) };
}

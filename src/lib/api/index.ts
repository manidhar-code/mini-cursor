// Unified API layer — routes to Groq or Mistral based on settings

import * as groq from './groq';
import * as mistral from './mistral';
import type { ProviderKey } from '../../types';
import type { AgentMessage, ToolDefinition, ToolChatResult } from './agentTypes';
export type { AgentMessage, ToolDefinition, ToolCall, ToolChatResult } from './agentTypes';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

/**
 * Stream chat completion, routing to the chosen provider and model.
 * `model` MUST be passed explicitly by the caller (e.g. from the user's
 * selected model in settings) — the provider modules only fall back to
 * their own default when no model is given, which previously meant the
 * user's chosen Mistral/Groq model was silently ignored everywhere.
 */
export async function streamChat(
  provider: ProviderKey,
  keys: { groq: string; mistral: string },
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const apiKey = provider === 'groq' ? keys.groq : keys.mistral;
  if (!apiKey) {
    callbacks.onError(new Error('No API key configured for ' + provider));
    return;
  }

  try {
    if (provider === 'groq') {
      await groq.streamChat(apiKey, messages, callbacks, model);
    } else {
      await mistral.streamChat(apiKey, messages, callbacks, model);
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Non-streaming chat.
 */
export async function chat(
  provider: ProviderKey,
  keys: { groq: string; mistral: string },
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const apiKey = provider === 'groq' ? keys.groq : keys.mistral;
  if (!apiKey) throw new Error('No API key configured for ' + provider);

  if (provider === 'groq') {
    return groq.chat(apiKey, messages, model);
  }
  return mistral.chat(apiKey, messages, model);
}

/**
 * Code completion — prefer Mistral Codestral's real FIM endpoint, fall
 * back to Groq's chat-based completion if no Mistral key is set or the
 * FIM call fails.
 *
 * `context.prefix`/`context.suffix` are the raw code before/after the
 * cursor. Codestral takes these directly (that's what FIM means). Groq has
 * no dedicated FIM endpoint, so its fallback path stitches them into a
 * single prompt with a `<CURSOR>` marker for a general chat model instead.
 */
export async function complete(
  keys: { groq: string; mistral: string },
  context: { prefix: string; suffix: string },
): Promise<string> {
  if (keys.mistral) {
    try {
      return await mistral.completeFIM(keys.mistral, context.prefix, context.suffix);
    } catch {
      // fall through to Groq
    }
  }

  if (keys.groq) {
    const prompt =
      'Complete the code at the <CURSOR> marker. Output ONLY the text that should be ' +
      'inserted at <CURSOR> to continue the code naturally — no markdown fences, no ' +
      'repeating existing code, no explanations.\n\n' +
      context.prefix + '<CURSOR>' + context.suffix;
    return groq.complete(keys.groq, prompt);
  }
  throw new Error('No API key available for completion');
}

/**
 * Chat completion with tool/function calling, routed to whichever provider
 * the agent is configured to use. This is the single primitive the agent
 * orchestrator is built on — it never talks to groq.ts/mistral.ts directly,
 * so provider-specific request shaping stays isolated there (Phase 13).
 */
export async function generateWithTools(
  provider: ProviderKey,
  keys: { groq: string; mistral: string },
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
): Promise<ToolChatResult> {
  const apiKey = provider === 'groq' ? keys.groq : keys.mistral;
  if (!apiKey) throw new Error('No API key configured for ' + provider);

  if (provider === 'groq') {
    return groq.chatWithTools(apiKey, messages, tools, model);
  }
  return mistral.chatWithTools(apiKey, messages, tools, model);
}

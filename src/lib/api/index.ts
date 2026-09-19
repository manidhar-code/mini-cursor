// Unified API layer — routes to Groq / Mistral / OpenRouter / Gemini based
// on settings, AND automatically falls back to another provider/model if
// the current one is rate-limited (TPM exhausted) or its servers are busy.
//
// Fallback design: every call (chat, streamChat, generateWithTools) is
// given a ProviderModel "chain" — the user's selected provider/model first,
// then a fixed priority list of the other available models, skipping any
// provider with no API key configured. If a call fails with a *retryable*
// error (HTTP 429 "too many requests" / rate-limit / TPM exhausted, or a
// 5xx "server error" / "overloaded" / "unavailable" response), we silently
// move to the next candidate in the chain instead of surfacing the error.
// A non-retryable error (bad API key, invalid request, etc.) is NOT
// retried — retrying that against a different provider wouldn't fix it and
// would just hide a real problem. Callers can find out which provider/model
// actually answered via the returned/emitted `servedBy` field, since it may
// differ from what the user has selected.

import * as groq from './groq';
import * as mistral from './mistral';
import * as openrouter from './openrouter';
import * as gemini from './gemini';
import { GROQ_MODELS } from './groq';
import { MISTRAL_MODELS } from './mistral';
import { OPENROUTER_MODELS } from './openrouter';
import { GEMINI_MODELS } from './gemini';
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

export type ApiKeys = { groq: string; mistral: string; openrouter: string; gemini: string };

export type ProviderModel = { provider: ProviderKey; model: string };

// Priority order used to fill out the rest of the fallback chain, after the
// user's own selection. Ordered roughly fastest/most-reliable-free-tier
// first; the last two are the "known quantity is running low" escape
// hatches that don't depend on Groq/Mistral quotas at all.
const FALLBACK_PRIORITY: ProviderModel[] = [
  { provider: 'groq', model: GROQ_MODELS.fastChat },
  { provider: 'groq', model: GROQ_MODELS.chat },
  { provider: 'mistral', model: MISTRAL_MODELS.chat },
  { provider: 'openrouter', model: OPENROUTER_MODELS.chat },
  { provider: 'gemini', model: GEMINI_MODELS.chat },
];

function apiKeyFor(keys: ApiKeys, provider: ProviderKey): string {
  return keys[provider] || '';
}

/** Builds the ordered list of provider/model candidates to try for one
 * request: the caller's chosen provider/model first (if it has a key),
 * then the rest of FALLBACK_PRIORITY, deduplicated, skipping anything
 * without a configured API key. */
export function buildFallbackChain(primary: ProviderModel, keys: ApiKeys): ProviderModel[] {
  const chain: ProviderModel[] = [];
  const seen = new Set<string>();
  const add = (pm: ProviderModel) => {
    const key = pm.provider + ':' + pm.model;
    if (seen.has(key) || !apiKeyFor(keys, pm.provider)) return;
    seen.add(key);
    chain.push(pm);
  };
  add(primary);
  for (const candidate of FALLBACK_PRIORITY) add(candidate);
  return chain;
}

/** True for errors worth retrying against a different provider: rate
 * limits (TPM/RPM exhausted, HTTP 429) and server-side trouble (5xx,
 * "overloaded", "unavailable", "busy"). False for anything that looks like
 * a real, provider-agnostic problem (bad key, invalid request) — retrying
 * those elsewhere would just mask the actual issue. */
function isRetryable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/\b429\b/.test(msg) || /\b5\d\d\b/.test(msg)) return true;
  return /rate.?limit|too many requests|tpm|rpm|quota|overloaded|unavailable|server error|service busy|try again/i.test(msg);
}

async function chatOnce(provider: ProviderKey, keys: ApiKeys, model: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = apiKeyFor(keys, provider);
  switch (provider) {
    case 'groq': return groq.chat(apiKey, messages, model);
    case 'mistral': return mistral.chat(apiKey, messages, model);
    case 'openrouter': return openrouter.chat(apiKey, messages, model);
    case 'gemini': return gemini.chat(apiKey, messages, model);
  }
}

async function streamChatOnce(
  provider: ProviderKey, keys: ApiKeys, model: string, messages: ChatMessage[], callbacks: StreamCallbacks,
): Promise<void> {
  const apiKey = apiKeyFor(keys, provider);
  switch (provider) {
    case 'groq': return groq.streamChat(apiKey, messages, callbacks, model);
    case 'mistral': return mistral.streamChat(apiKey, messages, callbacks, model);
    case 'openrouter': return openrouter.streamChat(apiKey, messages, callbacks, model);
    case 'gemini': return gemini.streamChat(apiKey, messages, callbacks, model);
  }
}

async function generateWithToolsOnce(
  provider: ProviderKey, keys: ApiKeys, model: string, messages: AgentMessage[], tools: ToolDefinition[],
): Promise<ToolChatResult> {
  const apiKey = apiKeyFor(keys, provider);
  switch (provider) {
    case 'groq': return groq.chatWithTools(apiKey, messages, tools, model);
    case 'mistral': return mistral.chatWithTools(apiKey, messages, tools, model);
    case 'openrouter': return openrouter.chatWithTools(apiKey, messages, tools, model);
    case 'gemini': return gemini.chatWithTools(apiKey, messages, tools, model);
  }
}

/**
 * Non-streaming chat completion with automatic fallback. Returns which
 * provider/model actually served the response, since it may not be the one
 * requested.
 */
export async function chatWithFallback(
  primary: ProviderModel,
  keys: ApiKeys,
  messages: ChatMessage[],
): Promise<{ text: string; servedBy: ProviderModel }> {
  const chain = buildFallbackChain(primary, keys);
  if (chain.length === 0) throw new Error('No API key configured for any provider.');

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    try {
      const text = await chatOnce(candidate.provider, keys, candidate.model, messages);
      return { text, servedBy: candidate };
    } catch (err) {
      lastErr = err;
      const isLast = i === chain.length - 1;
      if (isLast || !isRetryable(err)) throw err;
      // else: quietly try the next candidate
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All providers failed.');
}

/** Back-compat direct call, no fallback — used where a specific provider is
 * intentionally forced (currently unused by the app, kept for API parity). */
export async function chat(
  provider: ProviderKey,
  keys: ApiKeys,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const apiKey = apiKeyFor(keys, provider);
  if (!apiKey) throw new Error('No API key configured for ' + provider);
  return chatOnce(provider, keys, model, messages);
}

/**
 * Streaming chat completion with automatic fallback. If the very first
 * candidate fails before emitting any tokens (the common case: a 429/5xx
 * arrives as the initial HTTP response, before any SSE data), the next
 * candidate is tried silently. Once any token has been streamed to the
 * caller, a later failure is surfaced as an error rather than retried —
 * splicing a second model's output into an already-started reply would be
 * incoherent and dishonest about what actually generated it.
 */
export async function streamChatWithFallback(
  primary: ProviderModel,
  keys: ApiKeys,
  messages: ChatMessage[],
  callbacks: StreamCallbacks & { onProvider?: (servedBy: ProviderModel) => void },
): Promise<void> {
  const chain = buildFallbackChain(primary, keys);
  if (chain.length === 0) {
    callbacks.onError(new Error('No API key configured for any provider.'));
    return;
  }

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    let gotAnyToken = false;

    try {
      await new Promise<void>((resolve, reject) => {
        streamChatOnce(candidate.provider, keys, candidate.model, messages, {
          onToken: (t) => {
            gotAnyToken = true;
            callbacks.onToken(t);
          },
          onDone: (full) => {
            callbacks.onProvider?.(candidate);
            callbacks.onDone(full);
            resolve();
          },
          onError: (err) => {
            reject(err);
          },
        }).catch(reject);
      });
      return; // success
    } catch (err) {
      const isLast = i === chain.length - 1;
      if (gotAnyToken || isLast || !isRetryable(err)) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      // else: quietly try the next candidate — nothing was shown to the user yet
    }
  }
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
 * Chat completion with tool/function calling, with the same automatic
 * fallback as chatWithFallback/streamChatWithFallback. This is the single
 * primitive the agent orchestrator is built on — it never talks to a
 * specific provider module directly, so provider-specific request shaping
 * stays isolated there (Phase 13), and the fallback chain applies to Agent
 * mode exactly the same way it applies to normal chat.
 */
export async function generateWithToolsFallback(
  primary: ProviderModel,
  keys: ApiKeys,
  messages: AgentMessage[],
  tools: ToolDefinition[],
): Promise<ToolChatResult & { servedBy: ProviderModel }> {
  const chain = buildFallbackChain(primary, keys);
  if (chain.length === 0) throw new Error('No API key configured for any provider.');

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    try {
      const result = await generateWithToolsOnce(candidate.provider, keys, candidate.model, messages, tools);
      return { ...result, servedBy: candidate };
    } catch (err) {
      lastErr = err;
      const isLast = i === chain.length - 1;
      if (isLast || !isRetryable(err)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All providers failed.');
}

/** Back-compat direct call, no fallback. */
export async function generateWithTools(
  provider: ProviderKey,
  keys: ApiKeys,
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
): Promise<ToolChatResult> {
  const apiKey = apiKeyFor(keys, provider);
  if (!apiKey) throw new Error('No API key configured for ' + provider);
  return generateWithToolsOnce(provider, keys, model, messages, tools);
}

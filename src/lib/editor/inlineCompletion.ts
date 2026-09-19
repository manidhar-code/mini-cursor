import { complete } from '../api';
import type { ProviderSettings } from '../../types';

// Resolves once `ms` has elapsed, or immediately with `false` if the token
// is cancelled first (Monaco cancels the previous request's token as soon
// as a newer one comes in, e.g. on every keystroke) — this is what gives us
// debouncing without ever leaving a stale request hanging forever.
function waitUnlessCancelled(ms: number, token: { isCancellationRequested: boolean; onCancellationRequested: (cb: () => void) => { dispose(): void } }): Promise<boolean> {
  return new Promise((resolve) => {
    if (token.isCancellationRequested) { resolve(false); return; }
    const timer = setTimeout(() => { sub.dispose(); resolve(true); }, ms);
    const sub = token.onCancellationRequested(() => { clearTimeout(timer); resolve(false); });
  });
}

const MAX_PREFIX_CHARS = 2000;
const MAX_SUFFIX_CHARS = 400;

/**
 * Registers an inline-completion ("ghost text") provider for every
 * language. Returns a disposable to unregister it (call on unmount).
 *
 * `getSettings` is a getter, not a snapshot, so the provider always sees
 * the user's current API keys/model/toggle without needing to be
 * re-registered whenever settings change.
 */
export function registerInlineCompletionProvider(
  monaco: any,
  getSettings: () => ProviderSettings,
) {
  return monaco.languages.registerInlineCompletionsProvider('*', {
    async provideInlineCompletions(model: any, position: any, _context: any, token: any) {
      const settings = getSettings();
      if (!settings.inlineCompletionsEnabled) return { items: [] };
      if (!settings.groqApiKey && !settings.mistralApiKey) return { items: [] };

      const proceed = await waitUnlessCancelled(400, token);
      if (!proceed || token.isCancellationRequested) return { items: [] };

      const offset = model.getOffsetAt(position);
      const fullText: string = model.getValue();
      const before = fullText.slice(Math.max(0, offset - MAX_PREFIX_CHARS), offset);
      const after = fullText.slice(offset, offset + MAX_SUFFIX_CHARS);
      if (!before.trim()) return { items: [] };

      // Pass raw prefix/suffix through — the unified `complete()` uses
      // Codestral's actual FIM endpoint when a Mistral key is available
      // (no prompt engineering needed, that's the model's native format),
      // and only builds a `<CURSOR>`-marker prompt itself for the Groq
      // chat-model fallback.
      try {
        const raw = await complete(
          { groq: settings.groqApiKey, mistral: settings.mistralApiKey },
          { prefix: before, suffix: after },
        );
        if (token.isCancellationRequested) return { items: [] };

        const cleaned = raw.replace(/^```[\w-]*\n?/, '').replace(/```$/, '');
        if (!cleaned.trim()) return { items: [] };

        return {
          items: [
            {
              insertText: cleaned,
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            },
          ],
        };
      } catch {
        return { items: [] };
      }
    },
    freeInlineCompletions() {
      // Nothing to release — no server-held handles for our completions.
    },
  });
}

// Detects an agent run that's stuck repeating itself — the same tool
// called with the exact same (validated, normalized) arguments over and
// over, which is the dominant failure mode for a model that's confused
// about why an edit "isn't working" (often because it's not actually
// reading the tool result that already told it).
//
// Kept as pure functions, separate from orchestrator.ts's stateful
// while-loop, so the two thresholds and the signature format can be
// unit-tested directly.

/** Canonical signature for one tool call's (name, args) pair. Object key
 * order from JSON parsing isn't guaranteed stable across equivalent calls,
 * so keys are sorted before joining — two calls with the same arguments in
 * a different key order must produce the same signature. */
export function toolCallSignature(name: string, args: Record<string, string>): string {
  const normalized = Object.keys(args).sort().map((k) => k + '=' + args[k]).join('|');
  return name + '::' + normalized;
}

// 3rd identical call: nudge the model with a warning instead of executing
// it again. 5th identical call: give up on this run entirely — by that
// point it's not a one-off mistake, it's genuinely stuck.
export const REPEAT_WARN_THRESHOLD = 3;
export const REPEAT_ABORT_THRESHOLD = 5;

export type RepetitionVerdict = 'ok' | 'warn' | 'abort';

export function classifyRepetition(count: number): RepetitionVerdict {
  if (count >= REPEAT_ABORT_THRESHOLD) return 'abort';
  if (count >= REPEAT_WARN_THRESHOLD) return 'warn';
  return 'ok';
}

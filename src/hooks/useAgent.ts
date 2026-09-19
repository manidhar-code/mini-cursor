import { useCallback, useState } from 'react';
import type { OpenFile, ProviderSettings } from '../types';
import { runAgent } from '../lib/agent/orchestrator';
import type { AgentActivityEvent, AgentRunResult, PendingFileChange } from '../lib/agent/types';

export type AgentTurn = {
  instruction: string;
  activity: AgentActivityEvent[];
  plan: string | null;
  finalMessage: string;
  pendingChanges: PendingFileChange[];
  awaitingApproval: boolean; // true until the user Applies or Rejects
  applied: boolean;
  rejected: boolean;
  stoppedReason: AgentRunResult['stoppedReason'];
};

export function useAgent(settings: ProviderSettings, getFiles: () => OpenFile[]) {
  const [isRunning, setIsRunning] = useState(false);
  const [turn, setTurn] = useState<AgentTurn | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (instruction: string) => {
      setIsRunning(true);
      setError(null);
      setTurn({
        instruction,
        activity: [],
        plan: null,
        finalMessage: '',
        pendingChanges: [],
        awaitingApproval: false,
        applied: false,
        rejected: false,
        stoppedReason: 'done',
      });

      try {
        const result = await runAgent({
          instruction,
          files: getFiles(),
          settings,
          onActivity: (activity) => setTurn((t) => (t ? { ...t, activity } : t)),
        });

        // Any destructive change (delete/rename, or an update that rewrites
        // most of a file) always requires approval, regardless of the
        // "require approval" setting — Phase 15's safety floor.
        const hasDestructive = result.pendingChanges.some((c) => c.destructive);
        const mustApprove = settings.agentRequireApproval || hasDestructive;

        setTurn((t) =>
          t
            ? {
                ...t,
                activity: result.activity,
                plan: result.plan,
                finalMessage: result.finalMessage,
                pendingChanges: result.pendingChanges,
                stoppedReason: result.stoppedReason,
                awaitingApproval: mustApprove && result.pendingChanges.length > 0,
                applied: !mustApprove && result.pendingChanges.length > 0, // auto-applied by caller below
              }
            : t,
        );

        return { result, autoApply: !mustApprove && result.pendingChanges.length > 0 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Agent failed unexpectedly.';
        setError(msg);
        setTurn((t) => (t ? { ...t, finalMessage: msg, stoppedReason: 'error' } : t));
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    [settings, getFiles],
  );

  const markApplied = useCallback(() => {
    setTurn((t) => (t ? { ...t, awaitingApproval: false, applied: true } : t));
  }, []);

  const markRejected = useCallback(() => {
    setTurn((t) => (t ? { ...t, awaitingApproval: false, rejected: true } : t));
  }, []);

  const dismiss = useCallback(() => setTurn(null), []);

  return { isRunning, turn, error, run, markApplied, markRejected, dismiss };
}

import { useCallback, useState } from 'react';
import type { OpenFile } from '../types';

export type EditHistoryEntry = {
  id: string;
  timestamp: number;
  label: string;
  snapshot: OpenFile[]; // full project state immediately BEFORE this change
};

const MAX_HISTORY = 15;

// Deliberately snapshots the *whole* open-files array rather than a
// per-file diff. AI edits can create, delete, or rename files (Agent
// mode), and reconstructing all of that correctly from individual diffs
// is a lot of special-casing for what's meant to be a safety net. A full
// snapshot reverts any of those uniformly — the only cost is memory,
// which the history cap keeps bounded.
export function useEditHistory() {
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);

  const record = useCallback((label: string, snapshotBefore: OpenFile[]) => {
    setHistory((prev) => {
      const entry: EditHistoryEntry = {
        id: 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        timestamp: Date.now(),
        label,
        snapshot: snapshotBefore,
      };
      return [...prev, entry].slice(-MAX_HISTORY);
    });
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  return { history, record, clear };
}

import { useCallback, useState } from 'react';
import { runFile, type RunOutcome } from '../lib/sandbox/runFile';
import type { OpenFile } from '../types';

export type RunEntry = {
  id: string;
  fileName: string;
  language: string;
  startedAt: number;
  running: boolean;
  outcome: RunOutcome | null;
};

export function useRunner() {
  const [history, setHistory] = useState<RunEntry[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (file: OpenFile | undefined) => {
    if (!file || running) return;
    const id = 'run-' + Date.now();
    setRunning(true);
    setHistory((prev) => [
      ...prev,
      { id, fileName: file.name, language: file.language, startedAt: Date.now(), running: true, outcome: null },
    ]);

    const outcome = await runFile(file.language, file.content);

    setHistory((prev) => prev.map((e) => (e.id === id ? { ...e, running: false, outcome } : e)));
    setRunning(false);
  }, [running]);

  const clear = useCallback(() => setHistory([]), []);

  return { history, running, run, clear, latest: history[history.length - 1] ?? null };
}

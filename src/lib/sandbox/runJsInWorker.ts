// Runs JavaScript entirely in the browser, with no network call and no
// Wandbox round-trip — it's already local, so there's nothing to proxy.
//
// Executes inside a Web Worker rather than a same-thread eval/iframe so
// that (a) it can't touch the page/DOM, and (b) an infinite loop in the
// user's code can actually be stopped from the outside via worker.terminate()
// instead of freezing the whole tab.

export type JsRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const TIMEOUT_MS = 5000;

const WORKER_SRC = `
self.onmessage = (e) => {
  const logs = [];
  const push = (kind, args) => {
    try {
      logs.push(kind + ': ' + args.map((a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' '));
    } catch {}
  };
  console.log = (...a) => push('log', a);
  console.info = (...a) => push('log', a);
  console.warn = (...a) => push('warn', a);
  console.error = (...a) => push('error', a);

  let errorMsg = null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(e.data);
    fn();
  } catch (err) {
    errorMsg = (err && err.stack) ? err.stack : String(err);
  }
  self.postMessage({ logs, errorMsg });
};
`;

export function runJsInWorker(code: string): Promise<JsRunResult> {
  return new Promise((resolve) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    let settled = false;
    const finish = (result: JsRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, stdout: '', stderr: 'Execution timed out after 5s (possible infinite loop).', timedOut: true });
    }, TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent) => {
      const { logs, errorMsg } = e.data as { logs: string[]; errorMsg: string | null };
      const stdout = logs.filter((l) => l.startsWith('log:')).map((l) => l.slice(4).trim()).join('\n');
      const warnErr = logs.filter((l) => l.startsWith('warn:') || l.startsWith('error:')).map((l) => l.trim());
      const stderrParts = [...warnErr];
      if (errorMsg) stderrParts.push(errorMsg);
      finish({ ok: !errorMsg, stdout, stderr: stderrParts.join('\n'), timedOut: false });
    };

    worker.onerror = (e) => {
      finish({ ok: false, stdout: '', stderr: e.message || 'Worker error', timedOut: false });
    };

    worker.postMessage(code);
  });
}

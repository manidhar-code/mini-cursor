// Phase 17: a plain browser tab cannot execute npm/tsc/etc. against the
// user's real filesystem, and this project has no backend of its own. We
// do NOT fake that capability — every command attempt made without a real
// runtime honestly reports itself as unavailable, with no invented
// stdout/exit codes. This interface exists so a future local companion
// (Electron/Tauri app, or a small local daemon) can plug in a real
// implementation without the agent orchestrator changing at all.

export type CommandResult = {
  available: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message: string; // always present — shown to the model and the user either way
};

export interface CommandRunner {
  readonly available: boolean;
  run(command: string): Promise<CommandResult>;
}

/** Default runner for this build: browser-only, nothing to plug into. */
class BrowserCommandRunner implements CommandRunner {
  readonly available = false;

  async run(command: string): Promise<CommandResult> {
    return {
      available: false,
      message:
        'Command execution is not available in this browser-based build of Mini Cursor — there is ' +
        'no local runtime to run "' + command + '" against. Wire up a local companion app to enable this.',
    };
  }
}

/** Shape a future local runtime should expose on `window` to be picked up
 * automatically. Kept intentionally minimal (one method) so it's easy for
 * an Electron/Tauri preload script or a local daemon's bridge to implement. */
export type MiniCursorRuntimeBridge = {
  runCommand: (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
};

declare global {
  interface Window {
    miniCursorRuntime?: MiniCursorRuntimeBridge;
  }
}

class BridgedCommandRunner implements CommandRunner {
  readonly available = true;
  constructor(private bridge: MiniCursorRuntimeBridge) {}

  async run(command: string): Promise<CommandResult> {
    try {
      const { exitCode, stdout, stderr } = await this.bridge.runCommand(command);
      return {
        available: true,
        exitCode,
        stdout,
        stderr,
        message: exitCode === 0
          ? 'Command succeeded.'
          : 'Command exited with code ' + exitCode + '.',
      };
    } catch (err) {
      return {
        available: true,
        message: 'Command failed to run: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  }
}

/** Picks a real runner if a local runtime bridge has attached itself to
 * `window`, otherwise falls back to the honest browser stub. Call this
 * fresh each agent run rather than caching at module load, in case a
 * runtime attaches after the page loads. */
export function getCommandRunner(): CommandRunner {
  if (typeof window !== 'undefined' && window.miniCursorRuntime) {
    return new BridgedCommandRunner(window.miniCursorRuntime);
  }
  return new BrowserCommandRunner();
}

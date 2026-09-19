export type AgentActivityStatus = 'active' | 'success' | 'error' | 'info';

export type AgentActivityEvent = {
  id: string;
  label: string;
  status: AgentActivityStatus;
  detail?: string;
};

export type PendingFileChange =
  | { kind: 'create'; path: string; newContent: string; destructive: false }
  | { kind: 'update'; path: string; oldContent: string; newContent: string; destructive: boolean }
  | { kind: 'delete'; path: string; oldContent: string; destructive: true }
  | { kind: 'rename'; path: string; newPath: string; content: string; destructive: true };

export type CommandAttempt = {
  command: string;
  available: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message: string;
};

export type AgentStoppedReason = 'done' | 'max_iterations' | 'error' | 'rejected';

export type AgentRunResult = {
  activity: AgentActivityEvent[];
  plan: string | null;
  pendingChanges: PendingFileChange[];
  finalMessage: string;
  commandAttempts: CommandAttempt[];
  stoppedReason: AgentStoppedReason;
};

import type { OpenFile, ProviderSettings } from '../../types';
import { chat, generateWithTools } from '../api';
import type { AgentMessage } from '../api/agentTypes';
import { AGENT_TOOLS, describeToolCall, validateToolArgs } from './tools';
import { buildAgentSystemPrompt, buildPlanningPrompt } from './systemPrompt';
import { executeTool, resolveFiles, type OverlayMap } from './executor';
import { getCommandRunner } from './commandRunner';
import type { AgentActivityEvent, AgentRunResult, CommandAttempt, PendingFileChange } from './types';

const MAX_ITERATIONS = 20; // Phase 3/9: never loop forever

export type RunAgentParams = {
  instruction: string;
  files: OpenFile[];
  settings: ProviderSettings;
  onActivity?: (activity: AgentActivityEvent[]) => void;
};

function safeParseJSON(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw || '{}') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

export async function runAgent(params: RunAgentParams): Promise<AgentRunResult> {
  const { instruction, files, settings, onActivity } = params;

  const activity: AgentActivityEvent[] = [];
  const emit = (ev: AgentActivityEvent) => {
    const idx = activity.findIndex((e) => e.id === ev.id);
    if (idx >= 0) activity[idx] = ev;
    else activity.push(ev);
    onActivity?.([...activity]);
  };
  const succeed = (id: string, label?: string, detail?: string) => {
    const prior = activity.find((e) => e.id === id);
    emit({ id, label: label ?? prior?.label ?? id, status: 'success', detail });
  };
  const fail = (id: string, label?: string, detail?: string) => {
    const prior = activity.find((e) => e.id === id);
    emit({ id, label: label ?? prior?.label ?? id, status: 'error', detail });
  };

  const provider = settings.preferredProvider;
  const model = provider === 'groq' ? settings.groqModel : settings.mistralModel;
  const keys = { groq: settings.groqApiKey, mistral: settings.mistralApiKey };
  const commandRunner = getCommandRunner();

  emit({ id: 'understand', label: 'Understanding request', status: 'active' });

  const overlay: OverlayMap = new Map();
  const pendingChanges = new Map<string, PendingFileChange>();
  const commandAttempts: CommandAttempt[] = [];
  const commandCallCount = { current: 0 };

  const initialPaths = resolveFiles(files, overlay).map((f) => f.path);
  succeed('understand', 'Understanding request');
  emit({
    id: 'inspect',
    label: 'Inspecting project (' + initialPaths.length + ' file' + (initialPaths.length === 1 ? '' : 's') + ')',
    status: 'success',
  });

  // ── Phase 11: short up-front plan for non-trivial tasks ──
  let plan: string | null = null;
  emit({ id: 'plan', label: 'Planning approach', status: 'active' });
  try {
    const { system, user } = buildPlanningPrompt(instruction, initialPaths);
    const planResponse = await chat(provider, keys, model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const trimmed = planResponse.trim();
    if (trimmed && !/^simple\b/i.test(trimmed)) {
      plan = trimmed;
      succeed('plan', 'Plan ready', plan);
    } else {
      succeed('plan', 'Simple task — no plan needed');
    }
  } catch {
    // Planning is a nice-to-have; if it fails, proceed straight to the tool loop.
    succeed('plan', 'Skipped planning');
  }

  // The plan (if any) is folded into the system prompt rather than pushed as
  // its own assistant turn — some providers (Mistral's serving API in
  // particular) reject a conversation that ends on `assistant` right before
  // asking for the next completion; it must end on `user` or `tool`.
  const conversation: AgentMessage[] = [
    { role: 'system', content: buildAgentSystemPrompt(initialPaths, plan) },
    { role: 'user', content: instruction },
  ];

  let iter = 0;
  let finalMessage = '';
  let stoppedReason: AgentRunResult['stoppedReason'] = 'done';

  while (iter < MAX_ITERATIONS) {
    iter++;
    const stepId = 'step-' + iter;
    emit({ id: stepId, label: 'Thinking…', status: 'active' });

    let response;
    try {
      response = await generateWithTools(provider, keys, model, conversation, AGENT_TOOLS);
    } catch (err) {
      fail(stepId, 'Model call failed', err instanceof Error ? err.message : String(err));
      stoppedReason = 'error';
      finalMessage = 'The agent stopped because a model call failed: ' + (err instanceof Error ? err.message : String(err));
      break;
    }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      succeed(stepId, 'Responded');
      finalMessage = response.content || '(No further changes were needed.)';
      break;
    }

    succeed(stepId, response.toolCalls.length + ' tool call' + (response.toolCalls.length === 1 ? '' : 's'));
    conversation.push({ role: 'assistant', content: response.content || '', tool_calls: response.toolCalls });

    for (const call of response.toolCalls) {
      const callId = call.id;
      const label = describeToolCall(call.function.name, call.function.arguments);
      emit({ id: callId, label, status: 'active' });

      const parsed = safeParseJSON(call.function.arguments);
      if (!parsed.ok) {
        conversation.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify({ error: 'Invalid JSON arguments: ' + parsed.error }) });
        fail(callId, label, 'Invalid arguments');
        continue;
      }

      const validated = validateToolArgs(call.function.name, parsed.value);
      if (!validated.ok) {
        conversation.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify({ error: validated.error }) });
        fail(callId, label, validated.error);
        continue;
      }

      const result = await executeTool(call.function.name, validated.value, {
        files, overlay, pendingChanges, commandRunner, commandCallCount,
      });

      if (result.commandAttempt) commandAttempts.push(result.commandAttempt);
      conversation.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify(result.payload) });

      if (result.ok) succeed(callId, label, result.summary);
      else fail(callId, label, result.summary);
    }
  }

  if (iter >= MAX_ITERATIONS && !finalMessage) {
    stoppedReason = 'max_iterations';
    finalMessage =
      'Stopped after ' + MAX_ITERATIONS + ' steps to avoid an endless loop. Here is what changed so far — ' +
      'review it below, and send another message to continue.';
    emit({ id: 'limit', label: 'Reached step limit', status: 'error' });
  }

  return {
    activity,
    plan,
    pendingChanges: [...pendingChanges.values()],
    finalMessage,
    commandAttempts,
    stoppedReason,
  };
}

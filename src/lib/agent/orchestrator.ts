import type { OpenFile, ProviderSettings } from '../../types';
import { chatWithFallback, generateWithToolsFallback, type ApiKeys, type ProviderModel } from '../api';
import type { AgentMessage } from '../api/agentTypes';
import { AGENT_TOOLS, describeToolCall, validateToolArgs } from './tools';
import { buildAgentSystemPrompt, buildPlanningPrompt } from './systemPrompt';
import { executeTool, resolveFiles, type OverlayMap } from './executor';
import { getCommandRunner } from './commandRunner';
import { findProjectRules } from './projectRules';
import { toolCallSignature, classifyRepetition } from './loopDetection';
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

function primaryModelFor(settings: ProviderSettings): ProviderModel {
  switch (settings.preferredProvider) {
    case 'groq': return { provider: 'groq', model: settings.groqModel };
    case 'mistral': return { provider: 'mistral', model: settings.mistralModel };
    case 'openrouter': return { provider: 'openrouter', model: settings.openrouterModel };
    case 'gemini': return { provider: 'gemini', model: settings.geminiModel };
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

  const primary = primaryModelFor(settings);
  const keys: ApiKeys = {
    groq: settings.groqApiKey,
    mistral: settings.mistralApiKey,
    openrouter: settings.openrouterApiKey,
    gemini: settings.geminiApiKey,
  };
  const commandRunner = getCommandRunner();

  emit({ id: 'understand', label: 'Understanding request', status: 'active' });

  const overlay: OverlayMap = new Map();
  const pendingChanges = new Map<string, PendingFileChange>();
  const commandAttempts: CommandAttempt[] = [];
  const commandCallCount = { current: 0 };

  const resolvedInitial = resolveFiles(files, overlay);
  const initialPaths = resolvedInitial.map((f) => f.path);
  succeed('understand', 'Understanding request');
  emit({
    id: 'inspect',
    label: 'Inspecting project (' + initialPaths.length + ' file' + (initialPaths.length === 1 ? '' : 's') + ')',
    status: 'success',
  });

  const projectRules = findProjectRules(resolvedInitial);
  if (projectRules) {
    emit({
      id: 'rules',
      label: 'Using project rules from ' + projectRules.path,
      status: 'info',
      detail: projectRules.truncated ? 'Rules file was truncated to fit the size limit.' : undefined,
    });
  }

  // ── Phase 11: short up-front plan for non-trivial tasks ──
  let plan: string | null = null;
  emit({ id: 'plan', label: 'Planning approach', status: 'active' });
  try {
    const { system, user } = buildPlanningPrompt(instruction, initialPaths);
    const { text: planResponse } = await chatWithFallback(primary, keys, [
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
    { role: 'system', content: buildAgentSystemPrompt(initialPaths, plan, projectRules) },
    { role: 'user', content: instruction },
  ];

  let iter = 0;
  let finalMessage = '';
  let stoppedReason: AgentRunResult['stoppedReason'] = 'done';
  const callSignatureCounts = new Map<string, number>(); // loop / repeated-action detection

  while (iter < MAX_ITERATIONS) {
    iter++;
    const stepId = 'step-' + iter;
    emit({ id: stepId, label: 'Thinking…', status: 'active' });

    let response;
    try {
      response = await generateWithToolsFallback(primary, keys, conversation, AGENT_TOOLS);
      if (response.servedBy.provider !== primary.provider || response.servedBy.model !== primary.model) {
        emit({
          id: stepId + '-fallback',
          label: 'Switched to ' + response.servedBy.provider + ' / ' + response.servedBy.model,
          status: 'info',
          detail: primary.provider + ' was rate-limited or busy',
        });
      }
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

    let loopDetected = false;
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

      // Loop / repeated-action detection: the same tool called with the
      // exact same arguments, over and over, is the dominant symptom of a
      // model stuck re-emitting an edit that "isn't working" — usually
      // because it never actually looked at the tool result that already
      // explained why. Nudge at 3 repeats, give up at 5 rather than
      // silently burning through the rest of MAX_ITERATIONS.
      const signature = toolCallSignature(call.function.name, validated.value);
      const count = (callSignatureCounts.get(signature) ?? 0) + 1;
      callSignatureCounts.set(signature, count);
      const repetition = classifyRepetition(count);

      if (repetition === 'abort') {
        conversation.push({
          role: 'tool', tool_call_id: callId,
          content: JSON.stringify({ error: 'Stopped: this exact action has been called ' + count + ' times with identical arguments.' }),
        });
        fail(callId, label, 'Repeated ' + count + 'x with no progress — stopping to avoid a loop');
        stoppedReason = 'loop_detected';
        finalMessage =
          'The agent stopped because it repeated the exact same action (' + label + ') ' + count + ' times in a row ' +
          'without making progress — a sign it\'s stuck rather than actually working through the task. ' +
          'Review what changed so far below, then try rephrasing your request or breaking it into a smaller step.';
        loopDetected = true;
        break;
      }

      if (repetition === 'warn') {
        conversation.push({
          role: 'tool', tool_call_id: callId,
          content: JSON.stringify({
            warning:
              'You have already called this exact action ' + (count - 1) + ' time(s) before with identical arguments. ' +
              'Repeating it again is unlikely to help. Either explain what is actually blocking progress and try a ' +
              'different approach, or say so if the task already looks complete.',
          }),
        });
        emit({ id: callId, label, status: 'info', detail: 'Repeated action (' + count + 'x) — nudged to reconsider instead of re-running it' });
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
    if (loopDetected) break;
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

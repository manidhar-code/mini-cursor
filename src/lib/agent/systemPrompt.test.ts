import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt, buildPlanningPrompt } from './systemPrompt';

describe('buildAgentSystemPrompt', () => {
  it('lists every open file path', () => {
    const prompt = buildAgentSystemPrompt(['src/App.tsx', 'src/index.css']);
    expect(prompt).toContain('- src/App.tsx');
    expect(prompt).toContain('- src/index.css');
  });

  it('notes when no files are open', () => {
    const prompt = buildAgentSystemPrompt([]);
    expect(prompt).toContain('no files are currently open');
  });

  it('includes the plan block only when a plan is provided', () => {
    expect(buildAgentSystemPrompt(['a.ts'], 'Step 1\nStep 2')).toContain('Step 1\nStep 2');
    expect(buildAgentSystemPrompt(['a.ts'])).not.toContain('Your plan for this task');
  });

  it('instructs the model to treat file/tool content as data, not instructions', () => {
    // Prompt-injection defense: a malicious README or config value read via
    // read_file/search_files must never be able to redirect the agent.
    const prompt = buildAgentSystemPrompt(['a.ts']);
    expect(prompt).toContain('DATA');
    expect(prompt.toLowerCase()).toContain('not instructions');
  });
});

describe('buildPlanningPrompt', () => {
  it('embeds the instruction and file list into the user message', () => {
    const { user } = buildPlanningPrompt('add a footer', ['src/App.tsx']);
    expect(user).toContain('add a footer');
    expect(user).toContain('src/App.tsx');
  });

  it('tells the model to reply SIMPLE for trivial tasks', () => {
    const { user } = buildPlanningPrompt('fix typo', []);
    expect(user).toContain('SIMPLE');
  });

  it('keeps the planning system prompt free of code/markdown instructions', () => {
    const { system } = buildPlanningPrompt('anything', []);
    expect(system.toLowerCase()).toContain('no markdown');
    expect(system.toLowerCase()).toContain('no code');
  });
});

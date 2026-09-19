// Shared tool-calling types — both Groq and Mistral expose an
// OpenAI-compatible `tools` / `tool_calls` shape on their chat-completions
// endpoint, so one set of types covers both providers. Kept separate from
// groq.ts/mistral.ts so neither has to import the other, and so the agent
// orchestrator can depend on this file without pulling in a specific
// provider's implementation.

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // raw JSON string, as returned by the API — caller must parse+validate
  };
};

// A conversation message that may carry (assistant) tool calls or be a
// (tool) result being fed back. `content` is always a string — providers
// are fine with an empty string when an assistant turn is pure tool calls.
export type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolChatResult = {
  content: string;
  toolCalls: ToolCall[];
};

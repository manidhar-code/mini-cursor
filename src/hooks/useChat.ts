import { useState, useCallback } from 'react';
import { streamChat, type ChatMessage as APIMessage } from '../lib/api';
import type { ChatMessage, ProviderSettings } from '../types';

const SYSTEM_PROMPT = `You are an expert coding assistant inside a code editor. You help with:
- Writing and explaining code
- Debugging errors
- Refactoring and optimizing
- Answering programming questions

When showing code, use markdown code blocks with the language specified.
Be concise and direct. Focus on practical, working solutions.
Every code block you write can be inserted into the user's editor with one
click, so always put runnable code in a fenced code block rather than
describing it in prose.`;

// Used by the Ctrl/Cmd+K "edit selection" feature — a much narrower prompt
// since the model must return ONLY replacement code, nothing else.
export const INLINE_EDIT_SYSTEM_PROMPT = `You are a code-editing engine embedded in an editor.
You will be given a file's language, a selected snippet of code, and an instruction.
Rewrite the snippet to satisfy the instruction.
Output ONLY the replacement code for that exact snippet — no explanations, no markdown code fences, no commentary before or after.`;

export function useChat(settings: ProviderSettings) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (userMessage: string, context?: string) => {
    if (!userMessage.trim()) return;

    let fullMessage = userMessage;
    if (context) {
      fullMessage = "Here's the current file context:\n```\n" + context + "\n```\n\nMy question: " + userMessage;
    }

    const userMsg: ChatMessage = { role: 'user', content: fullMessage };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', isStreaming: true };
    setMessages((prev) => [...prev, assistantMsg]);

    const apiMessages: APIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: fullMessage },
    ];

    const model = settings.preferredProvider === 'groq' ? settings.groqModel : settings.mistralModel;

    try {
      await streamChat(
        settings.preferredProvider,
        { groq: settings.groqApiKey, mistral: settings.mistralApiKey },
        model,
        apiMessages,
        {
          onToken: (token) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + token };
              }
              return next;
            });
          },
          onDone: () => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  isStreaming: false,
                  provider: settings.preferredProvider,
                  model,
                };
              }
              return next;
            });
            setIsStreaming(false);
          },
          onError: (err) => {
            setError(err.message);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant' && !last.content) {
                next.pop();
              }
              return next;
            });
            setIsStreaming(false);
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsStreaming(false);
    }
  }, [messages, settings]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, clearChat };
}

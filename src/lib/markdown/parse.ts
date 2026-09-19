// Lightweight markdown handling for chat messages — no external deps.
// Covers what an AI coding assistant's replies actually use: fenced code
// blocks, headings, lists, bold/italic/inline-code, and links.

export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; lang: string; code: string };

const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;
const OPEN_FENCE_RE = /```(\w*)\n([\s\S]*)$/;

/**
 * Splits raw message content into alternating text/code segments.
 * Handles a still-streaming, not-yet-closed code fence by treating the
 * remainder as an in-progress code block, so code renders live instead of
 * showing raw backticks while the response is still streaming in.
 */
export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', lang: match[1] || 'plaintext', code: match[2].replace(/\n$/, '') });
    lastIndex = FENCE_RE.lastIndex;
  }

  const rest = content.slice(lastIndex);
  const openMatch = rest.match(OPEN_FENCE_RE);
  if (openMatch && openMatch.index !== undefined) {
    if (openMatch.index > 0) {
      segments.push({ type: 'text', content: rest.slice(0, openMatch.index) });
    }
    segments.push({ type: 'code', lang: openMatch[1] || 'plaintext', code: openMatch[2] });
  } else if (rest) {
    segments.push({ type: 'text', content: rest });
  }

  return segments;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t;
}

/** Renders a non-code text segment (headings, lists, paragraphs, inline formatting) to safe HTML. */
export function formatInlineText(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);

    if (heading) {
      closeList();
      const level = Math.min(heading[1].length, 3);
      out.push(`<div class="md-h${level}">${inline(heading[2])}</div>`);
    } else if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else {
      closeList();
      if (line.trim() === '') out.push('<div class="md-spacer"></div>');
      else out.push(`<div class="md-line">${inline(line)}</div>`);
    }
  }
  closeList();
  return out.join('');
}

/**
 * Strips a single wrapping ```lang ... ``` fence if the model ignored the
 * "no markdown fences" instruction (common even with explicit prompting).
 * Used by the Ctrl/Cmd+K inline-edit feature, which needs raw code back.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : trimmed;
}

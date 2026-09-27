import { describe, it, expect } from 'vitest';
import { formatInlineText, parseMessageContent, stripCodeFence } from './parse';

describe('formatInlineText escaping', () => {
  it('escapes angle brackets so raw HTML/script tags cannot be injected', () => {
    const out = formatInlineText('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapes quote characters so a crafted link cannot break out of the href attribute', () => {
    // Security regression test: escapeHtml previously only escaped & < >,
    // not quotes. A markdown link whose URL contains a `"` could close the
    // href attribute early and inject a new one (e.g. onmouseover=...),
    // executing arbitrary JS in the app's own origin — where every
    // provider API key and the Netlify token live in localStorage. Since
    // this content can come from AI output (which isn't fully trusted —
    // a prompt-injected or jailbroken response could contain it), this
    // needed to be closed at the renderer, not assumed away.
    const malicious = '[click me](http://evil.com/"onmouseover="alert(1)")';
    const out = formatInlineText(malicious);
    expect(out).not.toMatch(/"\s*onmouseover\s*=/);
    expect(out).not.toContain('onmouseover="alert(1)"');
  });

  it('still renders a well-formed link normally', () => {
    const out = formatInlineText('[docs](https://example.com/path)');
    expect(out).toContain('<a href="https://example.com/path" target="_blank" rel="noopener noreferrer">docs</a>');
  });

  it('renders headings, lists and inline formatting', () => {
    expect(formatInlineText('# Title')).toContain('<div class="md-h1">Title</div>');
    expect(formatInlineText('- item')).toContain('<li>item</li>');
    expect(formatInlineText('**bold** and *italic*')).toContain('<strong>bold</strong>');
  });
});

describe('parseMessageContent', () => {
  it('splits text and fenced code blocks', () => {
    const segments = parseMessageContent('before\n```js\nconsole.log(1)\n```\nafter');
    expect(segments.map((s) => s.type)).toEqual(['text', 'code', 'text']);
    expect(segments[1]).toMatchObject({ lang: 'js', code: 'console.log(1)' });
  });

  it('treats an unclosed trailing fence as an in-progress code block', () => {
    const segments = parseMessageContent('here:\n```python\nprint(1)');
    expect(segments[segments.length - 1]).toMatchObject({ type: 'code', lang: 'python' });
  });
});

describe('stripCodeFence', () => {
  it('removes a single wrapping fence', () => {
    expect(stripCodeFence('```ts\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('leaves unfenced text untouched', () => {
    expect(stripCodeFence('const x = 1;')).toBe('const x = 1;');
  });
});

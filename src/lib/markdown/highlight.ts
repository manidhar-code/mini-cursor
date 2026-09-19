// Small heuristic syntax highlighter for chat code blocks. It's not a real
// tokenizer for any specific language — it's a generic pass that covers
// comments/strings/numbers/keywords well enough to make code readable at a
// glance, without pulling in a full highlighting library.

const KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'class', 'extends', 'implements', 'interface',
  'type', 'enum', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'try',
  'catch', 'finally', 'throw', 'new', 'this', 'self', 'public', 'private', 'protected',
  'static', 'void', 'int', 'float', 'double', 'bool', 'boolean', 'string', 'String',
  'number', 'def', 'elif', 'pass', 'lambda', 'None', 'True', 'False', 'null', 'undefined',
  'true', 'false', 'struct', 'impl', 'fn', 'pub', 'use', 'mod', 'trait', 'func', 'package',
  'go', 'defer', 'chan', 'select', 'namespace', 'using', 'include', 'template', 'typename',
  'yield', 'in', 'of', 'instanceof', 'typeof', 'with', 'match', 'when',
]);

// Order matters within the alternation: comments/strings first so keyword
// matching never fires inside them.
const TOKEN_RE =
  /(\/\/[^\n]*)|(#[^\n]*)|(\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?''')|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightCode(code: string): string {
  const escaped = escapeHtml(code);
  return escaped.replace(
    TOKEN_RE,
    (match, lineComment, hashComment, blockComment, tripleStr, str, num, word) => {
      if (lineComment || hashComment || blockComment) return `<span class="tok-comment">${match}</span>`;
      if (tripleStr || str) return `<span class="tok-string">${match}</span>`;
      if (num) return `<span class="tok-number">${match}</span>`;
      if (word && KEYWORDS.has(word)) return `<span class="tok-keyword">${match}</span>`;
      return match;
    },
  );
}

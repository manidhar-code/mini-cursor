const EXT_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.dockerfile': 'dockerfile',
  '.toml': 'toml',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.txt': 'plaintext',
};

export function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  const ext = lower.substring(lower.lastIndexOf('.'));
  return EXT_MAP[ext] || 'plaintext';
}

/* Maps a markdown fence tag (```tsx, ```py, ```rust ...) to a sensible
 * file extension, so code blocks from the AI can be saved as real files. */
const FENCE_TO_EXT: Record<string, string> = {
  ts: '.ts', typescript: '.ts',
  tsx: '.tsx',
  js: '.js', javascript: '.js', jsx: '.jsx',
  py: '.py', python: '.py',
  rs: '.rs', rust: '.rs',
  go: '.go', golang: '.go',
  java: '.java',
  c: '.c',
  cpp: '.cpp', 'c++': '.cpp', cc: '.cpp',
  h: '.h', hpp: '.hpp',
  cs: '.cs', csharp: '.cs',
  rb: '.rb', ruby: '.rb',
  php: '.php',
  swift: '.swift',
  kt: '.kt', kotlin: '.kt',
  scala: '.scala',
  html: '.html',
  css: '.css',
  scss: '.scss',
  less: '.less',
  json: '.json',
  yaml: '.yaml', yml: '.yaml',
  xml: '.xml',
  md: '.md', markdown: '.md',
  sql: '.sql',
  sh: '.sh', bash: '.sh', shell: '.sh',
  toml: '.toml',
  vue: '.vue',
  svelte: '.svelte',
};

export function extensionForLanguage(fenceLang: string): string {
  const key = (fenceLang || '').toLowerCase().trim();
  return FENCE_TO_EXT[key] || '.txt';
}

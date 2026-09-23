// Guards against the failure mode "Open Folder" specifically invites:
// pointing it at a real project directory, which typically contains
// node_modules, .git, build output, and binary assets. Without filtering,
// that's potentially tens of thousands of files read as text into memory
// and then into localStorage on every autosave — freezing the tab and
// corrupting anything binary in the process.

const IGNORED_DIR_SEGMENTS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache',
  'coverage', '.turbo', '.vercel', '.netlify', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.idea', '.vscode',
]);

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
  'db', 'sqlite', 'sqlite3',
  'lock', // package-lock.json is text but huge/noisy; yarn.lock etc are genuinely unhelpful to load as editable "code"
]);

const MAX_FILE_SIZE_BYTES = 1_000_000; // 1MB — generous for real source files, guards against accidentally-included data dumps
const MAX_FILE_COUNT = 300; // generous for a real small-to-medium project, well short of what would actually hang a tab

export function shouldSkipPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((seg) => IGNORED_DIR_SEGMENTS.has(seg))) return true;
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext && BINARY_EXTENSIONS.has(ext)) return true;
  return false;
}

export type FilteredSelection = {
  toLoad: File[];
  skippedJunk: number;
  skippedTooLarge: number;
  skippedOverLimit: number;
};

export function filterFileSelection(files: File[]): FilteredSelection {
  let skippedJunk = 0;
  let skippedTooLarge = 0;
  let skippedOverLimit = 0;
  const toLoad: File[] = [];

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (shouldSkipPath(path)) { skippedJunk++; continue; }
    if (file.size > MAX_FILE_SIZE_BYTES) { skippedTooLarge++; continue; }
    if (toLoad.length >= MAX_FILE_COUNT) { skippedOverLimit++; continue; }
    toLoad.push(file);
  }

  return { toLoad, skippedJunk, skippedTooLarge, skippedOverLimit };
}

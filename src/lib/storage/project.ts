import JSZip from 'jszip';
import type { OpenFile } from '../../types';
import { detectLanguage } from '../utils/language';

const PROJECT_KEY = 'mini-cursor-project';

type StoredProject = {
  files: { path: string; content: string }[];
  activeFile: string | null;
};

// Autosave — same simple localStorage approach already used for settings
// (see storage.ts). Only path+content is persisted; `language` and
// `modified` are cheap to recompute/reset on load, so they're left out to
// keep the stored payload smaller.
export function saveProject(files: OpenFile[], activeFile: string | null): void {
  try {
    const payload: StoredProject = {
      files: files.map((f) => ({ path: f.path, content: f.content })),
      activeFile,
    };
    localStorage.setItem(PROJECT_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can throw if full/disabled (e.g. private browsing) —
    // autosave silently no-ops rather than interrupting editing.
  }
}

export function loadProject(): { files: OpenFile[]; activeFile: string | null } | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    const parsed: StoredProject = JSON.parse(raw);
    if (!Array.isArray(parsed.files)) return null;
    const files: OpenFile[] = parsed.files.map((f) => ({
      path: f.path,
      name: f.path.split('/').pop() || f.path,
      content: f.content,
      language: detectLanguage(f.path),
      modified: false,
    }));
    return { files, activeFile: parsed.activeFile ?? null };
  } catch {
    return null;
  }
}

export function clearSavedProject(): void {
  try {
    localStorage.removeItem(PROJECT_KEY);
  } catch { /* ignore */ }
}

// Export the current project as a downloadable .zip, preserving folder
// structure from each file's `path` (e.g. "src/components/Button.tsx"
// becomes a real nested entry in the zip).
export async function exportProjectZip(files: OpenFile[], projectName = 'mini-cursor-project'): Promise<void> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectName.replace(/[^a-z0-9-_]+/gi, '-') + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Import a .zip back into a flat OpenFile[] list, skipping directory
// entries (JSZip lists them explicitly) and anything that fails to decode
// as text (e.g. an accidentally-included binary asset).
export async function importProjectZip(file: File): Promise<OpenFile[]> {
  const zip = await JSZip.loadAsync(file);
  const results: OpenFile[] = [];

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    try {
      const content = await entry.async('string');
      results.push({
        path: entry.name,
        name: entry.name.split('/').pop() || entry.name,
        content,
        language: detectLanguage(entry.name),
        modified: false,
      });
    } catch {
      // skip unreadable/binary entries
    }
  }
  return results;
}

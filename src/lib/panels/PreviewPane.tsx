import { useEffect, useState } from 'react';
import { buildPreviewDoc } from '../sandbox/buildPreviewDoc';
import type { OpenFile } from '../../types';
import { RefreshIcon } from '../icons/Icons';

const DEBOUNCE_MS = 400;

export function PreviewPane({ openFiles, activeFilePath }: { openFiles: OpenFile[]; activeFilePath: string | null }) {
  const doc = buildPreviewDoc(openFiles, activeFilePath);
  const [committedDoc, setCommittedDoc] = useState(doc);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounced live-update. Note this sets the iframe's `srcDoc` attribute
  // rather than reaching into `iframe.contentWindow.document` and calling
  // .write() — a sandboxed iframe with no `allow-same-origin` (which this
  // deliberately is, so preview code can't reach the parent page) is
  // treated by the browser as cross-origin for JS property access, so
  // `contentWindow.document` throws a SecurityError and silently leaves the
  // iframe blank. `srcDoc` is a plain HTML attribute, not a script call
  // across that boundary, so it works with full sandboxing intact.
  useEffect(() => {
    const t = setTimeout(() => setCommittedDoc(doc), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [doc]);

  if (doc === null) {
    return (
      <div className="panel-empty-state">
        <p>No HTML file is open.</p>
        <p className="settings-hint">Open or create an .html file to see a live preview here — any open .css/.js files are injected in automatically.</p>
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <div className="panel-toolbar">
        <button className="icon-btn" title="Reload preview" onClick={() => setRefreshKey((k) => k + 1)}><RefreshIcon size={13} /></button>
        <span className="panel-toolbar-hint">Live preview — updates automatically as you type</span>
      </div>
      <iframe
        key={refreshKey}
        className="preview-frame"
        title="Preview"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={committedDoc ?? ''}
      />
    </div>
  );
}

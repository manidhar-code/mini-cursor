import { useEffect, useRef, useState } from 'react';
import { buildPreviewDoc } from '../sandbox/buildPreviewDoc';
import type { OpenFile } from '../../types';

const DEBOUNCE_MS = 400;

export function PreviewPane({ openFiles, activeFilePath }: { openFiles: OpenFile[]; activeFilePath: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doc = buildPreviewDoc(openFiles, activeFilePath);

  // Debounced live-update: re-write the iframe's document as HTML/CSS/JS
  // files change, without re-mounting the iframe on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe || doc === null) return;
      const win = iframe.contentWindow;
      if (!win) return;
      win.document.open();
      win.document.write(doc);
      win.document.close();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, refreshKey]);

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
        <button className="icon-btn" title="Reload preview" onClick={() => setRefreshKey((k) => k + 1)}>⟳</button>
        <span className="panel-toolbar-hint">Live preview — updates automatically as you type</span>
      </div>
      <iframe
        ref={iframeRef}
        className="preview-frame"
        title="Preview"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
      />
    </div>
  );
}

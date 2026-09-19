import { useState } from 'react';
import { parseMessageContent, formatInlineText } from './parse';
import { highlightCode } from './highlight';

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CodeBlock({
  code, lang, onCopy, onInsert, onApply, applyLabel,
}: {
  code: string;
  lang: string;
  onCopy: () => void;
  onInsert: () => void;
  onApply: () => void;
  applyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{lang || 'text'}</span>
        <div className="code-block-actions">
          <button
            className="code-block-btn"
            onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            title="Copy code"
          >
            {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="code-block-btn" onClick={onInsert} title="Insert at cursor position">
            Insert
          </button>
          <button className="code-block-btn primary" onClick={onApply} title={applyLabel}>
            Apply
          </button>
        </div>
      </div>
      <pre><code dangerouslySetInnerHTML={{ __html: highlightCode(code) }} /></pre>
    </div>
  );
}

export function MessageContent({
  content, activeFileName, onCopyCode, onInsertCode, onApplyCode,
}: {
  content: string;
  activeFileName: string | null;
  onCopyCode: (code: string) => void;
  onInsertCode: (code: string) => void;
  onApplyCode: (code: string, lang: string) => void;
}) {
  const segments = parseMessageContent(content);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock
            key={i}
            code={seg.code}
            lang={seg.lang}
            onCopy={() => onCopyCode(seg.code)}
            onInsert={() => onInsertCode(seg.code)}
            onApply={() => onApplyCode(seg.code, seg.lang)}
            applyLabel={activeFileName ? 'Apply to ' + activeFileName : 'Apply as new file'}
          />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: formatInlineText(seg.content) }} />
        ),
      )}
    </>
  );
}

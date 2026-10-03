'use client';
import { useMemo, useState } from 'react';
import { generateMermaid } from '@/lib/mermaid/generator';
import { typeLabel } from '@/lib/diagrams/model';
import MermaidReference from './MermaidReference';

function CodeBlock({ text, label }) {
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <pre className="dw-code" aria-label={label} tabIndex={0}>
      {lines.map((l, i) => <div key={i} className="dw-code-line"><span className="dw-ln" aria-hidden="true">{i + 1}</span><span>{l || ' '}</span></div>)}
    </pre>
  );
}

async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }

export default function SourcePanel({ diagram, current, onResetToOriginal }) {
  const [copied, setCopied] = useState('');
  const [showRef, setShowRef] = useState(false);
  const isMermaid = diagram.source.format === 'mermaid';
  const gen = useMemo(() => (current && current.kind !== 'reference' ? generateMermaid(current) : null), [current]);
  const edited = useMemo(() => gen?.text && isMermaid && gen.text.trim() !== diagram.source.content.trim(), [gen, isMermaid, diagram]);
  const doCopy = async (t, key) => { if (await copyText(t)) { setCopied(key); setTimeout(() => setCopied(''), 1400); } };
  const m = diagram.metadata ?? {};

  return (
    <div className="dw-source">
      <div className="dw-source-col">
        <header className="dw-source-head">
          <h2>Original source <span className="dw-chip">{isMermaid ? 'Mermaid' : 'ASCII'} · {typeLabel(diagram.source.type)}</span></h2>
          <div className="dw-btn-row">
            <button type="button" className="dw-btn" onClick={() => doCopy(diagram.source.content, 'orig')}>{copied === 'orig' ? 'Copied ✓' : 'Copy'}</button>
            {isMermaid && <button type="button" className="dw-btn" onClick={() => setShowRef((v) => !v)} aria-pressed={showRef}>{showRef ? 'Hide' : 'Render'} reference</button>}
          </div>
        </header>
        <p className="dw-source-meta">
          {diagram.sourceFile}{m.sourceLine ? ` · lines ${m.sourceLine}–${m.sourceEndLine}` : ''}{m.sourceHeading ? ` · “${m.sourceHeading}”` : ''}
          {m.sourceHash ? <> · hash <code>{m.sourceHash.slice(0, 8)}</code></> : null}
        </p>
        <p className="dw-hint">Read-only. This is the exact text found in the Markdown file; editing the visual diagram never changes it, and the Markdown file itself is never modified.</p>
        {showRef && isMermaid && <MermaidReference source={diagram.source.content} />}
        <CodeBlock text={diagram.source.content} label="Original source" />
      </div>

      <div className="dw-source-col">
        <header className="dw-source-head">
          <h2>Mermaid generated from the visual model</h2>
          {gen?.text && <div className="dw-btn-row"><button type="button" className="dw-btn" onClick={() => doCopy(gen.text, 'gen')}>{copied === 'gen' ? 'Copied ✓' : 'Copy'}</button></div>}
        </header>
        {!gen && <p className="dw-banner dw-banner-warn">No editable model is available for this diagram, so no Mermaid can be generated.</p>}
        {gen && gen.ok && (
          <p className="dw-banner dw-banner-ok">
            Verified: this text was parsed back and matches the model (nodes, connectors, groups, labels).
            {edited ? ' It differs from the original source because the diagram was edited or normalised.' : ' It is equivalent to the original.'}
          </p>
        )}
        {gen && !gen.ok && (
          <div className="dw-banner dw-banner-warn">
            <strong>Not an exact round trip.</strong> The text below is a best effort and should not replace the original:
            <ul>{gen.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>
          </div>
        )}
        {gen?.notes?.map((n, i) => <p className="dw-hint" key={i}>{n}</p>)}
        {gen?.text && <CodeBlock text={gen.text} label="Generated Mermaid" />}
        <div className="dw-source-actions">
          <button type="button" className="dw-btn" onClick={onResetToOriginal}>Discard edits — rebuild visual model from original source</button>
        </div>
      </div>
    </div>
  );
}

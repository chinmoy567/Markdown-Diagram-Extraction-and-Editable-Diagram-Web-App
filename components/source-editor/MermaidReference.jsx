'use client';
// Read-only reference render of the ORIGINAL Mermaid source using the Mermaid library.
// This is for comparison only — it is never used as the editable representation.
// Loaded lazily; strict security level; output additionally sanitised with DOMPurify.
import { useEffect, useRef, useState } from 'react';

let initialised = false;

export default function MermaidReference({ source }) {
  const [state, setState] = useState({ status: 'loading', svg: '', error: '' });
  const idRef = useRef(`mmd-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import('mermaid'), import('dompurify')]);
        if (!initialised) {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false }, htmlLabels: false });
          initialised = true;
        }
        await mermaid.parse(source);
        const { svg } = await mermaid.render(idRef.current, source);
        const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        if (!cancelled) setState({ status: 'ok', svg: clean, error: '' });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', svg: '', error: String(e?.message ?? e).slice(0, 400) });
      }
    })();
    return () => { cancelled = true; document.getElementById(`d${idRef.current}`)?.remove(); };
  }, [source]);

  if (state.status === 'loading') return <p className="dw-hint">Rendering reference…</p>;
  if (state.status === 'error') return <p className="dw-banner dw-banner-warn">Mermaid itself could not render this source: {state.error}</p>;
  return <div className="dw-ref-render" aria-label="Reference render of the original Mermaid source" dangerouslySetInnerHTML={{ __html: state.svg }} />;
}

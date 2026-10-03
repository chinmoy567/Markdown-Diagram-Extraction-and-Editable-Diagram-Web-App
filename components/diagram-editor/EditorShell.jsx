'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GraphEditor from './GraphEditor';
import SequenceEditor from './SequenceEditor';
import SourcePanel from '../source-editor/SourcePanel';
import MermaidReference from '../source-editor/MermaidReference';
import { storage } from '@/lib/storage/db';
import { layoutDiagram } from '@/lib/diagrams/layout';
import { convertSource } from '@/lib/diagrams/converter';
import { createDiagram, typeLabel } from '@/lib/diagrams/model';
import { exportDiagram } from '@/lib/export';
import { generateMermaid } from '@/lib/mermaid/generator';

const STATUS_TEXT = { converted: 'Converted', partial: 'Partly converted', reference: 'Reference only', failed: 'Conversion failed' };

function Btn({ onClick, disabled, title, children, pressed, danger }) {
  return <button type="button" className={`dw-tb${danger ? ' dw-danger' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-label={title} aria-pressed={pressed}>{children}</button>;
}

export default function EditorShell({ id }) {
  const router = useRouter();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('visual');
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState({ canUndo: false, canRedo: false, selectedNodes: 0, selectedEdges: 0, selectedGroups: 0 });
  const [saving, setSaving] = useState('');
  const [name, setName] = useState('');
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [current, setCurrent] = useState(null);
  const [menu, setMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [busy, setBusy] = useState('');
  const editor = useRef(null);
  const root = useRef(null);
  const [editorKey, setEditorKey] = useState(0);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 2600); }, []);

  /* ---------- load (+ first-open auto layout) ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let rec = await storage.getDiagram(id);
        if (!rec) { setError('This diagram was not found in the browser library. It may have been deleted, or imported in another browser profile.'); return; }
        if (rec.kind === 'graph' && !rec.layout?.done) {
          setBusy('Laying out diagram…');
          rec = { ...(await layoutDiagram(rec)), fileId: rec.fileId, createdAt: rec.createdAt, updatedAt: rec.updatedAt, edited: rec.edited };
          await storage.putDiagram(rec);   // persist positions (not counted as a user edit)
        }
        if (cancelled) return;
        setRecord(rec); setName(rec.name); setBusy('');
        setShowRef(rec.source.format === 'ascii');
        document.title = `${rec.name} — Diagram Workbench`;
      } catch (e) { if (!cancelled) setError(`Could not open this diagram: ${e.message}`); setBusy(''); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /* ---------- save ---------- */
  const save = useCallback(async () => {
    if (!editor.current || !record) return;
    try {
      setSaving('Saving…');
      const model = editor.current.getDiagram();
      const next = { ...model, fileId: record.fileId, createdAt: record.createdAt, updatedAt: Date.now(), edited: true, name: name || model.name, kind: model.kind, status: record.status === 'reference' && model.nodes.length ? 'partial' : record.status };
      await storage.putDiagram(next);
      setRecord((r) => ({ ...r, ...next }));
      setDirty(false); setSaving('Saved'); setTimeout(() => setSaving(''), 1600);
      document.title = `${next.name} — Diagram Workbench`;
    } catch (e) { setSaving(''); say(`Save failed: ${e.message}`); }
  }, [record, name, say]);

  useEffect(() => { const h = () => save(); window.addEventListener('dw:save', h); return () => window.removeEventListener('dw:save', h); }, [save]);
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [save]);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => { if (!e.target.closest?.('.dw-menu-wrap')) setMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const markDirty = useCallback(() => setDirty(true), []);
  const leave = (e) => { if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault(); };

  const switchTab = (t) => {
    if (t === 'source' && editor.current) setCurrent(editor.current.getDiagram());
    setTab(t);
  };

  const doExport = async (fmt) => {
    setMenu(null);
    try {
      const model = editor.current ? editor.current.getDiagram() : record;
      if (fmt === 'mermaid') {
        const g = generateMermaid(model);
        if (!g.ok && record.source.format === 'mermaid') {
          if (!window.confirm(`The visual model cannot be turned into exact Mermaid:\n\n• ${g.issues.slice(0, 4).join('\n• ')}\n\nExport the ORIGINAL Mermaid source instead?`)) return;
        }
      }
      setBusy(`Exporting ${fmt.toUpperCase()}…`);
      await exportDiagram({ ...model, name: name || model.name }, fmt);
      say(`Exported ${fmt.toUpperCase()}`);
    } catch (e) { say(`Export failed: ${e.message}`); } finally { setBusy(''); }
  };

  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); } catch { say('Full screen is not available here'); }
  };

  const resetToOriginal = async () => {
    if (!window.confirm('Discard all edits and rebuild the visual diagram from the original source? This cannot be undone.')) return;
    const conv = convertSource(record.source.format, record.source.content, record.source.type);
    let fresh = createDiagram({
      ...record, kind: conv.kind, status: conv.status, confidence: conv.confidence, warnings: conv.warnings ?? [],
      nodes: conv.nodes, edges: conv.edges, groups: conv.groups, sequence: conv.sequence, layout: conv.layout,
      source: record.source, metadata: record.metadata,
    });
    if (fresh.kind === 'graph') fresh = await layoutDiagram(fresh);
    const next = { ...fresh, fileId: record.fileId, createdAt: record.createdAt, updatedAt: Date.now(), edited: false };
    await storage.putDiagram(next);
    setRecord(next); setDirty(false); setEditorKey((k) => k + 1); setTab('visual'); say('Rebuilt from original source');
  };

  const convertManually = async () => {
    const next = { ...record, kind: 'graph', nodes: [], edges: [], groups: [], layout: { done: true, direction: 'TB' }, status: 'partial' };
    await storage.putDiagram({ ...next, updatedAt: Date.now(), edited: true });
    setRecord(next); setShowRef(true); setEditorKey((k) => k + 1); say('Blank canvas ready — rebuild the diagram next to the reference.');
  };

  /* ---------- render ---------- */
  if (error) return <Message title="Cannot open diagram" text={error} />;
  if (!record) return <div className="dw-loading" role="status">{busy || 'Opening…'}</div>;

  const isSeq = record.kind === 'sequence';
  const isRef = record.kind === 'reference';
  const ed = { align: (k) => editor.current?.align(k), autoLayout: () => editor.current?.autoLayout(), group: () => editor.current?.group() };
  const e = (fn) => () => editor.current?.[fn]?.();
  const sel = state.selectedNodes + state.selectedEdges;

  return (
    <div className="dw-editor" ref={root}>
      <header className="dw-topbar" role="banner">
        <Link href="/" className="dw-back" onClick={leave} aria-label="Back to diagram library">← Library</Link>
        <div className="dw-titleblock">
          <input className="dw-title" value={name} aria-label="Diagram name" onChange={(ev) => { setName(ev.target.value); markDirty(); }} />
          <span className="dw-sub">{record.sourceFile} · {record.source.format === 'mermaid' ? 'Mermaid' : 'ASCII'} {typeLabel(record.source.type)}
            <span className={`dw-status dw-status-${record.status}`}>{STATUS_TEXT[record.status]}</span>
            {dirty ? <span className="dw-dirty" title="Unsaved changes">● unsaved</span> : saving ? <span className="dw-saved">{saving}</span> : null}
          </span>
        </div>
        <nav className="dw-tabs" aria-label="View">
          <button type="button" role="tab" aria-selected={tab === 'visual'} className={tab === 'visual' ? 'is-active' : ''} onClick={() => switchTab('visual')}>Visual</button>
          <button type="button" role="tab" aria-selected={tab === 'source'} className={tab === 'source' ? 'is-active' : ''} onClick={() => switchTab('source')}>Source</button>
        </nav>
      </header>

      {tab === 'visual' && !isRef && (
        <div className="dw-toolbar" role="toolbar" aria-label="Editor toolbar">
          <Btn onClick={save} title="Save (Ctrl+S)">💾 Save</Btn>
          <span className="dw-sep" />
          <Btn onClick={e('undo')} disabled={!state.canUndo} title="Undo (Ctrl+Z)">↶ Undo</Btn>
          <Btn onClick={e('redo')} disabled={!state.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</Btn>
          <span className="dw-sep" />
          <Btn onClick={e('copy')} disabled={isSeq || !sel} title="Copy (Ctrl+C)">⧉ Copy</Btn>
          <Btn onClick={e('paste')} disabled={isSeq} title="Paste (Ctrl+V)">📋 Paste</Btn>
          <Btn onClick={e('duplicate')} disabled={!sel} title="Duplicate (Ctrl+D)">⎘ Duplicate</Btn>
          <Btn onClick={e('remove')} disabled={!sel} title="Delete (Del)" danger>🗑 Delete</Btn>
          <span className="dw-sep" />
          <Btn onClick={e('zoomIn')} title="Zoom in">＋</Btn>
          <Btn onClick={e('zoomOut')} title="Zoom out">－</Btn>
          <Btn onClick={e('fit')} title="Fit to screen">⤢ Fit</Btn>
          {!isSeq && (
            <>
              <span className="dw-sep" />
              <div className="dw-menu-wrap">
                <Btn onClick={() => setMenu(menu === 'align' ? null : 'align')} disabled={state.selectedNodes < 2} title="Align and distribute">Align ▾</Btn>
                {menu === 'align' && (
                  <div className="dw-menu" role="menu">
                    {[['left', 'Align left'], ['centerH', 'Align centre'], ['right', 'Align right'], ['top', 'Align top'], ['centerV', 'Align middle'], ['bottom', 'Align bottom'], ['distH', 'Distribute horizontally'], ['distV', 'Distribute vertically']].map(([k, l]) => (
                      <button key={k} role="menuitem" type="button" onClick={() => { ed?.align(k); setMenu(null); }} disabled={k.startsWith('dist') && state.selectedNodes < 3}>{l}</button>
                    ))}
                  </div>
                )}
              </div>
              <Btn onClick={e('group')} disabled={state.selectedNodes < 2} title="Group selection into a container (Ctrl+G)">Group</Btn>
              <Btn onClick={e('ungroup')} disabled={!state.selectedGroups} title="Ungroup (Ctrl+Shift+G)">Ungroup</Btn>
              <Btn onClick={() => { if (window.confirm('Re-run automatic layout? Your manual positions will be replaced (undo is available).')) ed?.autoLayout(); }} title="Automatic layout">Auto-layout</Btn>
              <span className="dw-sep" />
              <Btn onClick={() => setGrid((v) => !v)} pressed={grid} title="Show grid">▦ Grid</Btn>
              <Btn onClick={() => setSnap((v) => !v)} pressed={snap} title="Snap to grid">⌖ Snap</Btn>
            </>
          )}
          {record.source.format === 'ascii' && <Btn onClick={() => setShowRef((v) => !v)} pressed={showRef} title="Show original ASCII text">Reference</Btn>}
          <span className="dw-grow" />
          <div className="dw-menu-wrap">
            <Btn onClick={() => setMenu(menu === 'export' ? null : 'export')} title="Export">⭳ Export ▾</Btn>
            {menu === 'export' && (
              <div className="dw-menu dw-menu-right" role="menu">
                {[['svg', 'SVG image'], ['png', 'PNG image'], ['pdf', 'PDF'], ['json', 'JSON (editable model)'], ['mermaid', 'Mermaid source']].map(([k, l]) => <button key={k} role="menuitem" type="button" onClick={() => doExport(k)}>{l}</button>)}
              </div>
            )}
          </div>
          <Btn onClick={toggleFullscreen} pressed={fullscreen} title="Full screen">⛶ Full screen</Btn>
        </div>
      )}

      <main className="dw-main">
        {tab === 'visual' && isRef && (
          <ConversionWarning record={record} onConvert={convertManually} onSource={() => switchTab('source')} onSave={null} />
        )}
        {tab === 'visual' && !isRef && isSeq && (
          <SequenceEditor key={editorKey} ref={editor} diagram={record} onDirty={markDirty} onState={setState} onNameChange={setName} />
        )}
        {tab === 'visual' && !isRef && !isSeq && (
          <GraphEditor
            key={editorKey} ref={editor} diagram={record} onDirty={markDirty} onState={setState} onNameChange={setName}
            showGrid={grid} snap={snap}
            referencePanel={showRef && record.source.format === 'ascii' ? (
              <div className="dw-ref-dock" role="complementary" aria-label="Original ASCII diagram">
                <div className="dw-ref-head"><strong>Original (reference)</strong><button type="button" className="dw-mini" onClick={() => setShowRef(false)} aria-label="Close reference">✕</button></div>
                {record.confidence !== 'high' && <p className="dw-ref-note">Automatic ASCII conversion has <b>{record.confidence}</b> confidence. Compare with the original and fix anything that is wrong.</p>}
                <pre>{record.source.content}</pre>
              </div>
            ) : null}
          />
        )}
        {tab === 'source' && <SourcePanel diagram={record} current={current} onResetToOriginal={resetToOriginal} />}
      </main>

      {record.warnings?.length > 0 && tab === 'visual' && !isRef && <WarningStrip warnings={record.warnings} status={record.status} />}
      {(toast || busy) && <div className="dw-toast" role="status">{busy || toast}</div>}
    </div>
  );
}

function WarningStrip({ warnings, status }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dw-warnstrip">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>⚠ {status === 'partial' ? 'Conversion warning' : 'Notes'} — {warnings.length} item{warnings.length === 1 ? '' : 's'}{open ? ' ▾' : ' ▸'}</button>
      {open && <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </div>
  );
}

function ConversionWarning({ record, onConvert, onSource }) {
  const [showRef, setShowRef] = useState(false);
  return (
    <div className="dw-convwarn">
      <h2>Conversion Warning</h2>
      <p>{record.status === 'failed' ? 'This diagram could not be converted.' : 'This diagram could not be converted completely.'}</p>
      {record.metadata?.conversionError && <p className="dw-banner dw-banner-warn">{record.metadata.conversionError}</p>}
      {record.warnings?.length > 0 && <ul>{record.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      <p>The original source is preserved exactly. Your other diagrams are unaffected.</p>
      <div className="dw-btn-row">
        <button type="button" className="dw-btn" onClick={onSource}>View Original Source</button>
        <button type="button" className="dw-btn" onClick={() => setShowRef((v) => !v)}>{showRef ? 'Hide' : 'Open'} Reference</button>
        <button type="button" className="dw-btn dw-primary" onClick={onConvert}>Convert Manually</button>
      </div>
      {showRef && (record.source.format === 'mermaid' ? <MermaidReference source={record.source.content} /> : <pre className="dw-code dw-ref-pre">{record.source.content}</pre>)}
    </div>
  );
}

function Message({ title, text }) {
  return <div className="dw-convwarn"><h2>{title}</h2><p>{text}</p><Link className="dw-btn" href="/">Back to the library</Link></div>;
}

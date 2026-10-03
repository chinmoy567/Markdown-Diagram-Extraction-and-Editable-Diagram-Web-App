'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { storage } from '@/lib/storage/db';
import { analyseFiles, commitImports, promoteSkipped } from '@/lib/storage/library';
import { exportDiagram, exportAllZip, download } from '@/lib/export';
import { typeLabel } from '@/lib/diagrams/model';
import ImportDialog from '../markdown-import/ImportDialog';
import Modal from './Modal';

const STATUS = { converted: ['Editable', 'ok'], partial: ['Partly converted', 'warn'], reference: ['Reference only', 'muted'], failed: ['Conversion failed', 'bad'] };
const PAGE = 120;

export default function Library() {
  const [files, setFiles] = useState([]);
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [fileF, setFileF] = useState('');
  const [fmtF, setFmtF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [sort, setSort] = useState('source');
  const [limit, setLimit] = useState(PAGE);
  const [analysed, setAnalysed] = useState(null);
  const [busy, setBusy] = useState('');
  const [sourceOf, setSourceOf] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [exportMenu, setExportMenu] = useState(null);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState('');
  const inputRef = useRef(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 3500); }, []);

  const refresh = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([storage.listFiles(), storage.listDiagrams()]);
      setFiles(f); setDiagrams(d); setErr('');
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { document.title = 'Diagram Library — Diagram Workbench'; }, []);
  useEffect(() => {
    if (!exportMenu) return;
    const h = (e) => { if (!e.target.closest?.('.dw-menu-wrap')) setExportMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [exportMenu]);

  /* ---------- import ---------- */
  const startImport = useCallback(async (items) => {
    const mdItems = items.filter((i) => /\.(md|markdown|mdx|txt)$/i.test(i.name));
    if (!mdItems.length) { say('No Markdown files selected (.md, .markdown, .txt).'); return; }
    setBusy(`Scanning ${mdItems.length} file${mdItems.length === 1 ? '' : 's'}…`);
    try {
      const a = await analyseFiles(mdItems, (i, n) => setBusy(`Scanning ${i}/${n}…`));
      setAnalysed(a);
    } catch (e) { say(`Import failed: ${e.message}`); } finally { setBusy(''); }
  }, [say]);

  const onPick = (e) => { const list = [...e.target.files].map((file) => ({ name: file.name, file })); e.target.value = ''; startImport(list); };
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const list = [...e.dataTransfer.files].map((file) => ({ name: file.name, file }));
    startImport(list);
  };

  const loadSamples = async () => {
    const names = ['ARCHITECTURE.md', 'SOFTWARE_ARCHITECTURE.md', 'CAPSTONE_METHODOLOGY_FINAL.md', 'high level software architure diagram.md', 'OPERATOR_MANUAL.md'];
    setBusy('Loading bundled sample documents…');
    try {
      const items = [];
      for (const n of names) {
        const r = await fetch(`/samples/${encodeURIComponent(n)}`);
        if (r.ok) items.push({ name: n, text: await r.text() });
      }
      if (!items.length) { say('The bundled sample documents are not available.'); setBusy(''); return; }
      await startImport(items);
    } catch (e) { say(`Could not load samples: ${e.message}`); setBusy(''); }
  };

  const confirmImport = async () => {
    setBusy('Importing…');
    try {
      const report = await commitImports(analysed);
      await refresh();
      setAnalysed(null);
      const n = report.reduce((s, r) => s + r.diagrams, 0);
      say(`Imported ${n} diagram${n === 1 ? '' : 's'} from ${report.filter((r) => r.action !== 'ignored').length} file(s).`);
    } catch (e) { say(`Import failed: ${e.message}`); } finally { setBusy(''); }
  };

  /* ---------- derived ---------- */
  const stats = useMemo(() => {
    const t = {}; const ty = {};
    for (const d of diagrams) { t[d.fileId] = (t[d.fileId] ?? 0) + 1; const k = d.source.type; ty[k] = (ty[k] ?? 0) + 1; }
    return { byFile: t, byType: ty };
  }, [diagrams]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = diagrams.filter((d) => {
      if (fileF && d.fileId !== fileF) return false;
      if (fmtF && d.source.format !== fmtF) return false;
      if (typeF && d.source.type !== typeF) return false;
      if (statusF === 'attention' && d.status === 'converted') return false;
      if (statusF === 'edited' && !d.edited) return false;
      if (needle) {
        const hay = `${d.name}\n${d.sourceFile}\n${d.metadata?.sourceHeading ?? ''}\n${typeLabel(d.source.type)}\n${d.source.type}\n${d.source.format}\n${d.source.content}`.toLowerCase();
        return needle.split(/\s+/).every((w) => hay.includes(w));
      }
      return true;
    });
    const fileOrder = new Map(files.map((f, i) => [f.id, i]));
    if (sort === 'recent') list = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else list = [...list].sort((a, b) => (fileOrder.get(a.fileId) ?? 0) - (fileOrder.get(b.fileId) ?? 0) || (a.metadata?.sourceLine ?? 0) - (b.metadata?.sourceLine ?? 0));
    return list;
  }, [diagrams, files, q, fileF, fmtF, typeF, statusF, sort]);

  useEffect(() => setLimit(PAGE), [q, fileF, fmtF, typeF, statusF, sort]);

  const grouped = useMemo(() => {
    if (sort !== 'source') return [{ file: null, items: filtered.slice(0, limit) }];
    const out = []; const map = new Map();
    for (const d of filtered.slice(0, limit)) {
      let g = map.get(d.fileId);
      if (!g) { g = { file: files.find((f) => f.id === d.fileId), items: [] }; map.set(d.fileId, g); out.push(g); }
      g.items.push(d);
    }
    return out;
  }, [filtered, files, limit, sort]);

  /* ---------- actions ---------- */
  const del = async (d) => {
    if (!window.confirm(`Remove “${d.name}” from the library? The Markdown source file is not affected.`)) return;
    await storage.deleteDiagram(d.id); refresh();
  };
  const delFile = async (f) => {
    if (!window.confirm(`Remove “${f.name}” and its ${stats.byFile[f.id] ?? 0} diagram(s) from the library?\nThe original Markdown file on your disk is not touched.`)) return;
    await storage.deleteDiagramsByFile(f.id); await storage.deleteFile(f.id);
    if (fileF === f.id) setFileF('');
    refresh();
  };
  const exportOne = async (d, fmt) => {
    setExportMenu(null);
    try { setBusy(`Exporting ${fmt.toUpperCase()}…`); await exportDiagram(d, fmt); }
    catch (e) { say(`Export failed: ${e.message}`); } finally { setBusy(''); }
  };
  const exportAll = async (formats) => {
    setExportMenu(null);
    const list = filtered.length ? filtered : diagrams;
    if (!list.length) return;
    setBusy(`Exporting ${list.length} diagrams…`);
    try {
      const blob = await exportAllZip(list, formats, (i, n) => setBusy(`Exporting ${i}/${n}…`));
      download(blob, 'diagrams.zip');
      say(`Exported ${list.length} diagrams (${formats.join(' + ').toUpperCase()}).`);
    } catch (e) { say(`Export failed: ${e.message}`); } finally { setBusy(''); }
  };
  const clearAll = async () => {
    if (!window.confirm('Remove ALL imported files and diagrams, including your edits, from this browser?')) return;
    await storage.clearAll(); setFileF(''); refresh();
  };
  const promote = async (file, idx) => {
    try { const d = await promoteSkipped(file, idx); say(`Added “${d.name}” to the library (${d.status === 'converted' ? 'converted' : d.status}).`); await refresh(); setReportFor((r) => files.find((f) => f.id === r?.id) ?? r); const fresh = await storage.getFile(file.id); setReportFor(fresh); }
    catch (e) { say(`Could not convert: ${e.message}`); }
  };

  const totalAttention = diagrams.filter((d) => d.status !== 'converted').length;
  const typeOptions = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="dw-lib" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }} onDrop={onDrop}>
      <header className="dw-lib-top">
        <div className="dw-brand"><span className="dw-logo" aria-hidden="true">◧</span> Diagram Workbench</div>
        <div className="dw-lib-actions">
          <input ref={inputRef} type="file" accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain" multiple hidden onChange={onPick} />
          <button type="button" className="dw-btn dw-primary" onClick={() => inputRef.current?.click()}>Import Markdown files…</button>
          <button type="button" className="dw-btn" onClick={loadSamples}>Load bundled sample docs</button>
          <div className="dw-menu-wrap">
            <button type="button" className="dw-btn" disabled={!diagrams.length} onClick={() => setExportMenu(exportMenu === 'all' ? null : 'all')}>Export all ▾</button>
            {exportMenu === 'all' && (
              <div className="dw-menu dw-menu-right" role="menu">
                <div className="dw-menu-note">{(filtered.length || diagrams.length)} diagram(s){filtered.length !== diagrams.length ? ' (current filter)' : ''} → ZIP</div>
                <button role="menuitem" type="button" onClick={() => exportAll(['svg'])}>SVG files</button>
                <button role="menuitem" type="button" onClick={() => exportAll(['svg', 'json'])}>SVG + JSON</button>
                <button role="menuitem" type="button" onClick={() => exportAll(['png'])}>PNG files</button>
                <button role="menuitem" type="button" onClick={() => exportAll(['json'])}>JSON models</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {err && <div className="dw-banner dw-banner-warn" role="alert">Storage problem: {err}. Diagrams can still be imported and viewed but may not persist.</div>}

      {loading ? <div className="dw-loading" role="status">Loading library…</div> : !diagrams.length && !files.length ? (
        <div className="dw-empty">
          <h1>Turn the diagrams in your Markdown into editable diagrams</h1>
          <p>Import one or more Markdown files. Every Mermaid and ASCII diagram is found, separated, and converted into real nodes, connectors and containers you can edit — not pictures.</p>
          <div className="dw-btn-row">
            <button type="button" className="dw-btn dw-primary" onClick={() => inputRef.current?.click()}>Import Markdown files…</button>
            <button type="button" className="dw-btn" onClick={loadSamples}>Load bundled sample docs</button>
          </div>
          <p className="dw-hint">or drop .md files anywhere on this page. Nothing leaves your browser; your Markdown files are never modified.</p>
        </div>
      ) : (
        <div className="dw-lib-body">
          <aside className="dw-lib-side" aria-label="Filters">
            <label className="dw-search"><span className="dw-sr">Search diagrams</span>
              <input type="search" placeholder="Search diagrams…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>

            <div className="dw-side-title">File</div>
            <button type="button" className={`dw-side-item${!fileF ? ' is-active' : ''}`} onClick={() => setFileF('')}><span>All files</span><b>{diagrams.length}</b></button>
            {files.map((f) => (
              <button key={f.id} type="button" className={`dw-side-item${fileF === f.id ? ' is-active' : ''}`} onClick={() => setFileF(fileF === f.id ? '' : f.id)} title={f.name}><span>{f.name}</span><b>{stats.byFile[f.id] ?? 0}</b></button>
            ))}

            <div className="dw-side-title">Format</div>
            {[['', 'Any'], ['mermaid', 'Mermaid'], ['ascii', 'ASCII / text']].map(([v, l]) => (
              <button key={v} type="button" className={`dw-side-item${fmtF === v ? ' is-active' : ''}`} onClick={() => setFmtF(v)}><span>{l}</span></button>
            ))}

            <div className="dw-side-title">Diagram type</div>
            <button type="button" className={`dw-side-item${!typeF ? ' is-active' : ''}`} onClick={() => setTypeF('')}><span>Any</span></button>
            {typeOptions.map(([t, n]) => (
              <button key={t} type="button" className={`dw-side-item${typeF === t ? ' is-active' : ''}`} onClick={() => setTypeF(typeF === t ? '' : t)}><span>{typeLabel(t)}</span><b>{n}</b></button>
            ))}

            <div className="dw-side-title">Status</div>
            {[['', 'All'], ['attention', `Needs attention (${totalAttention})`], ['edited', 'Edited by me']].map(([v, l]) => (
              <button key={v} type="button" className={`dw-side-item${statusF === v ? ' is-active' : ''}`} onClick={() => setStatusF(v)}><span>{l}</span></button>
            ))}

            <div className="dw-side-title">Sort</div>
            <select className="dw-input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort diagrams">
              <option value="source">Document order</option><option value="recent">Recently modified</option><option value="name">Name</option>
            </select>
            <button type="button" className="dw-link dw-danger-link" onClick={clearAll}>Clear library…</button>
          </aside>

          <main className="dw-lib-main">
            <div className="dw-lib-summary" role="status">
              <strong>Total files: {files.length}</strong> · <strong>Total diagrams: {diagrams.length}</strong>
              {filtered.length !== diagrams.length && <> · showing {filtered.length}</>}
              {totalAttention > 0 && <> · <button type="button" className="dw-link" onClick={() => setStatusF('attention')}>{totalAttention} need attention</button></>}
            </div>

            {!filtered.length && <p className="dw-muted dw-pad">No diagrams match the current search/filters.</p>}

            {grouped.map((g, gi) => (
              <section key={g.file?.id ?? gi} className="dw-file-group" aria-label={g.file?.name ?? 'Diagrams'}>
                {g.file && (
                  <header className="dw-file-head">
                    <h2>{g.file.name}</h2>
                    <span className="dw-muted">{stats.byFile[g.file.id] ?? 0} diagrams</span>
                    <span className="dw-grow" />
                    {(g.file.skipped?.length ?? 0) > 0 && <button type="button" className="dw-link" onClick={() => setReportFor(g.file)}>{g.file.skipped.length} other block{g.file.skipped.length === 1 ? '' : 's'} (code / text) — review</button>}
                    <button type="button" className="dw-link dw-danger-link" onClick={() => delFile(g.file)}>Remove file</button>
                  </header>
                )}
                <ul className="dw-cards">
                  {g.items.map((d) => {
                    const [stText, stCls] = STATUS[d.status] ?? ['', ''];
                    return (
                      <li key={d.id} className="dw-card">
                        <div className="dw-card-main">
                          <Link href={`/editor?id=${encodeURIComponent(d.id)}`} className="dw-card-title">{d.name}</Link>
                          <div className="dw-card-meta">
                            <span className="dw-chip">{d.source.format === 'mermaid' ? 'Mermaid' : 'ASCII'} • {typeLabel(d.source.type)}</span>
                            <span className={`dw-status dw-status-${stCls}`}>{stText}</span>
                            {d.edited && <span className="dw-chip dw-chip-edit">edited</span>}
                            <span className="dw-muted">
                              {d.kind === 'sequence' ? `${d.sequence?.participants?.length ?? 0} participants · ${countItems(d.sequence?.items ?? [])} items` : d.kind === 'graph' ? `${d.nodes.length} nodes · ${d.edges.length} connectors${d.groups.length ? ` · ${d.groups.length} groups` : ''}` : 'no editable model'}
                              {d.sourceFile && d.metadata?.sourceLine ? ` · lines ${d.metadata.sourceLine}–${d.metadata.sourceEndLine}` : ''}
                            </span>
                          </div>
                          {d.status !== 'converted' && (d.metadata?.conversionError || d.warnings?.[0]) && <div className="dw-card-warn">{d.metadata?.conversionError || d.warnings[0]}</div>}
                        </div>
                        <div className="dw-card-actions">
                          <Link href={`/editor?id=${encodeURIComponent(d.id)}`} className="dw-btn dw-primary">Open</Link>
                          <button type="button" className="dw-btn" onClick={() => setSourceOf(d)}>Source</button>
                          <div className="dw-menu-wrap">
                            <button type="button" className="dw-btn" aria-haspopup="menu" aria-expanded={exportMenu === d.id} onClick={() => setExportMenu(exportMenu === d.id ? null : d.id)}>Export ▾</button>
                            {exportMenu === d.id && (
                              <div className="dw-menu dw-menu-right" role="menu">
                                {[['svg', 'SVG'], ['png', 'PNG'], ['pdf', 'PDF'], ['json', 'JSON'], ['mermaid', 'Mermaid source']].map(([k, l]) => <button key={k} role="menuitem" type="button" onClick={() => exportOne(d, k)} disabled={k === 'mermaid' && d.kind === 'reference' && d.source.format !== 'mermaid'}>{l}</button>)}
                              </div>
                            )}
                          </div>
                          <button type="button" className="dw-btn dw-quiet" onClick={() => del(d)} aria-label={`Remove ${d.name}`} title="Remove from library">✕</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {filtered.length > limit && <div className="dw-pad"><button type="button" className="dw-btn" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} remaining)</button></div>}
          </main>
        </div>
      )}

      {drag && <div className="dw-dropzone" aria-hidden="true">Drop Markdown files to import</div>}
      {analysed && <ImportDialog analysed={analysed} onChange={setAnalysed} onConfirm={confirmImport} onCancel={() => setAnalysed(null)} busy={!!busy} />}
      {sourceOf && (
        <Modal title={`Source — ${sourceOf.name}`} onClose={() => setSourceOf(null)} wide
          footer={<button type="button" className="dw-btn" onClick={() => navigator.clipboard?.writeText(sourceOf.source.content).then(() => say('Source copied'))}>Copy source</button>}>
          <p className="dw-muted">{sourceOf.sourceFile} · lines {sourceOf.metadata?.sourceLine}–{sourceOf.metadata?.sourceEndLine} · {sourceOf.source.format} / {sourceOf.source.type}</p>
          <pre className="dw-code dw-code-plain" tabIndex={0}>{sourceOf.source.content}</pre>
        </Modal>
      )}
      {reportFor && <SkippedReport file={reportFor} onClose={() => setReportFor(null)} onPromote={promote} />}
      {(busy || toast) && <div className="dw-toast" role="status">{busy || toast}</div>}
    </div>
  );
}

function countItems(items) { return items.reduce((n, it) => n + 1 + (it.type === 'block' ? it.branches.reduce((m, b) => m + countItems(b.items), 0) : 0), 0); }

function SkippedReport({ file, onClose, onPromote }) {
  const groups = [['candidate', 'Possible diagrams — outlines and loose arrow text', 'These were not auto-extracted because they look like outlines or prose. Convert any you want as a diagram.'], ['text', 'Other text blocks', 'Checklists, logs, formats and listings. Not diagrams; convert only if one is.'], ['code', 'Code blocks', 'Source code and configuration (C/C++, Python, JSON, shell…). Never treated as diagrams.']];
  return (
    <Modal title={`Other blocks in ${file.name}`} onClose={onClose} wide>
      <p className="dw-hint">Nothing is silently dropped: every fenced block that was not turned into a diagram is listed here with the reason.</p>
      {groups.map(([kind, title, note]) => {
        const items = (file.skipped ?? []).filter((s) => s.kind === kind);
        if (!items.length) return null;
        return (
          <details key={kind} open={kind === 'candidate'} className="dw-skip-group">
            <summary><strong>{title}</strong> ({items.length})</summary>
            <p className="dw-hint">{note}</p>
            <ul className="dw-skip-list">
              {items.map((s) => (
                <li key={s.blockIndex}>
                  <div className="dw-skip-head">
                    <span><b>{s.heading || '(no heading)'}</b> <span className="dw-muted">· lines {s.startLine}–{s.endLine}{s.lang ? ` · ${s.lang}` : ''}</span></span>
                    {kind !== 'code' && <button type="button" className="dw-btn" onClick={() => onPromote(file, s.blockIndex)}>Convert to diagram</button>}
                  </div>
                  <div className="dw-muted dw-small">{s.reason}</div>
                  <pre className="dw-code dw-code-plain dw-code-mini">{s.preview}{s.lineCount > 6 ? '\n…' : ''}</pre>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {!(file.skipped?.length) && <p className="dw-muted">No other blocks.</p>}
    </Modal>
  );
}

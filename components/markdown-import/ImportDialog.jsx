'use client';
import Modal from '../diagram-library/Modal';

/** Shows what each file contains and lets the user resolve duplicates: Replace / Create copy / Ignore. */
export default function ImportDialog({ analysed, onChange, onConfirm, onCancel, busy }) {
  const totalDiagrams = analysed.reduce((n, a) => n + (a.action === 'ignore' ? 0 : a.result.diagrams.length), 0);
  const conflicts = analysed.filter((a) => a.conflict);
  const setAction = (i, action) => onChange(analysed.map((a, k) => (k === i ? { ...a, action } : a)));
  const setAll = (action) => onChange(analysed.map((a) => (a.conflict ? { ...a, action } : a)));

  return (
    <Modal title="Import Markdown files" onClose={onCancel} wide
      footer={<>
        <button type="button" className="dw-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="dw-btn dw-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Importing…' : `Import ${totalDiagrams} diagram${totalDiagrams === 1 ? '' : 's'}`}</button>
      </>}>
      <p className="dw-hint">Files are read-only: your Markdown is never modified. An unmodified copy is kept in the library so each diagram stays linked to its source.</p>
      <p><strong>Total files: {analysed.length}</strong> · <strong>Total diagrams found: {analysed.reduce((n, a) => n + a.result.diagrams.length, 0)}</strong></p>
      {conflicts.length > 0 && (
        <div className="dw-banner dw-banner-warn">
          {conflicts.length} file{conflicts.length === 1 ? ' is' : 's are'} already in the library.
          <span className="dw-inline-actions">Apply to all: <button type="button" className="dw-link" onClick={() => setAll('replace')}>Replace</button> · <button type="button" className="dw-link" onClick={() => setAll('copy')}>Create copy</button> · <button type="button" className="dw-link" onClick={() => setAll('ignore')}>Ignore</button></span>
        </div>
      )}
      <ul className="dw-import-list">
        {analysed.map((a, i) => {
          const s = a.result.summary;
          return (
            <li key={a.name + i}>
              <div className="dw-import-head">
                <strong>{a.name}</strong>
                <span className="dw-muted">{s.diagrams} diagram{s.diagrams === 1 ? '' : 's'} · {s.fences} code fence{s.fences === 1 ? '' : 's'} scanned</span>
              </div>
              <div className="dw-import-types">{Object.entries(s.byType).map(([t, n]) => <span className="dw-chip" key={t}>{n} × {t}</span>)}{s.diagrams === 0 && <span className="dw-muted">No diagrams detected</span>}</div>
              <div className="dw-muted dw-small">
                {s.converted} converted{s.partial ? ` · ${s.partial} partly converted` : ''}{s.reference ? ` · ${s.reference} reference-only` : ''}{s.failed ? ` · ${s.failed} failed` : ''}
                {' · '}{s.skippedCode} code block{s.skippedCode === 1 ? '' : 's'} ignored (not diagrams)
                {s.candidates + s.skippedText > 0 ? ` · ${s.candidates + s.skippedText} other text block${s.candidates + s.skippedText === 1 ? '' : 's'} not treated as diagrams (reviewable after import)` : ''}
              </div>
              {a.conflict && (
                <fieldset className="dw-conflict">
                  <legend>Already imported{a.conflict.identical ? ' (identical content)' : ' (content changed)'}{a.conflict.editedCount ? ` — ${a.conflict.editedCount} edited diagram${a.conflict.editedCount === 1 ? '' : 's'}` : ''}</legend>
                  {[['replace', 'Replace existing', a.conflict.editedCount ? 'edited diagrams from this file will be overwritten' : ''], ['copy', 'Create copy', ''], ['ignore', 'Ignore', '']].map(([v, l, note]) => (
                    <label key={v}><input type="radio" name={`act-${i}`} checked={a.action === v} onChange={() => setAction(i, v)} /> {l}{note && <span className="dw-warn-text"> — {note}</span>}</label>
                  ))}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

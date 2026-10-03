'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { sequenceMarkup } from '@/lib/render/sequence';
import { uid } from '@/lib/diagrams/model';

const clone = (v) => JSON.parse(JSON.stringify(v));
const ARROWS = [['solid', 'arrow', '->> solid, filled'], ['dashed', 'arrow', '-->> dashed, filled'], ['solid', 'open', '-> solid, open'], ['dashed', 'open', '--> dashed, open'], ['solid', 'cross', '-x lost message'], ['solid', 'async', '-) async']];
const BLOCKS = ['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect'];

/** Find an item (and its containing list) anywhere in the tree. */
function locate(items, id) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { list: items, index: i, item: items[i] };
    if (items[i].type === 'block') for (const br of items[i].branches) { const r = locate(br.items, id); if (r) return r; }
  }
  return null;
}

const SequenceEditor = forwardRef(function SequenceEditor({ diagram, onDirty, onState, onNameChange }, ref) {
  const [seq, setSeq] = useState(() => clone(diagram.sequence));
  const [name, setName] = useState(diagram.name);
  const [selected, setSelected] = useState(null);       // item id or `p:<participantId>`
  const [zoom, setZoom] = useState(1);
  const past = useRef([]), future = useRef([]);
  const seqRef = useRef(seq); seqRef.current = seq;
  const box = useRef(null);

  const emit = useCallback(() => onState?.({ canUndo: past.current.length > 0, canRedo: future.current.length > 0, selectedNodes: selected ? 1 : 0, selectedEdges: 0, selectedGroups: 0, zoom, sequence: true }), [onState, selected, zoom]);
  useEffect(emit, [emit]);

  const commit = useCallback((next) => {
    past.current.push(clone(seqRef.current)); if (past.current.length > 150) past.current.shift();
    future.current = [];
    setSeq(next); onDirty?.();
  }, [onDirty]);
  const mutate = (fn) => { const next = clone(seqRef.current); fn(next); commit(next); };

  const svg = useMemo(() => sequenceMarkup(seq, { selectedId: selected }), [seq, selected]);
  const fit = useCallback(() => {
    const el = box.current; if (!el) return;
    setZoom(Math.min(1.5, Math.max(0.2, Math.min((el.clientWidth - 24) / svg.width, (el.clientHeight - 24) / svg.height))));
  }, [svg.width, svg.height]);
  useEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selItem = selected && !selected.startsWith('p:') ? locate(seq.items, selected) : null;
  const selPart = selected?.startsWith('p:') ? seq.participants.find((p) => `p:${p.id}` === selected) : null;

  const addAfter = (item) => mutate((s) => {
    item.id = uid('s');
    const loc = selItem ? locate(s.items, selected) : null;
    if (loc) loc.list.splice(loc.index + 1, 0, item); else s.items.push(item);
    setTimeout(() => setSelected(item.id), 0);
  });
  const addMessage = () => addAfter({ type: 'message', from: seq.participants[0]?.id, to: seq.participants[1]?.id ?? seq.participants[0]?.id, text: 'message', line: 'solid', head: 'arrow' });
  const addNote = () => addAfter({ type: 'note', placement: 'over', actors: [seq.participants[0]?.id], text: 'note' });
  const addBlock = (kind) => addAfter({ type: 'block', kind, branches: [{ label: 'condition', items: [] }, ...(kind === 'alt' ? [{ label: 'otherwise', items: [], word: 'else' }] : [])] });
  const addParticipant = (kind = 'participant') => mutate((s) => {
    let n = s.participants.length + 1; let id = `P${n}`;
    while (s.participants.some((p) => p.id === id)) id = `P${++n}`;
    s.participants.push({ id, label: kind === 'actor' ? 'Actor' : 'Participant', kind });
    setTimeout(() => setSelected(`p:${id}`), 0);
  });
  const removeSelected = useCallback(() => {
    if (selItem) mutate((s) => { const l = locate(s.items, selected); l.list.splice(l.index, 1); setSelected(null); });
    else if (selPart) {
      const used = JSON.stringify(seq.items).includes(`"${selPart.id}"`);
      if (used && !window.confirm(`"${selPart.label}" is used by messages. Delete it together with those messages/notes?`)) return;
      mutate((s) => {
        s.participants = s.participants.filter((p) => p.id !== selPart.id);
        const clean = (items) => items.filter((it) => !(it.type === 'message' && (it.from === selPart.id || it.to === selPart.id)) && !(it.type === 'note' && it.actors.includes(selPart.id)) && !((it.type === 'activate' || it.type === 'deactivate') && it.actor === selPart.id))
          .map((it) => (it.type === 'block' ? { ...it, branches: it.branches.map((b) => ({ ...b, items: clean(b.items) })) } : it));
        s.items = clean(s.items);
        setSelected(null);
      });
    }
  }, [selItem, selPart, selected, seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (dir) => mutate((s) => {
    if (selPart) { const i = s.participants.findIndex((p) => `p:${p.id}` === selected); const j = i + dir; if (j < 0 || j >= s.participants.length) return; [s.participants[i], s.participants[j]] = [s.participants[j], s.participants[i]]; return; }
    const l = locate(s.items, selected); if (!l) return; const j = l.index + dir; if (j < 0 || j >= l.list.length) return;
    [l.list[l.index], l.list[j]] = [l.list[j], l.list[l.index]];
  });
  const duplicate = () => { if (!selItem) return; mutate((s) => { const l = locate(s.items, selected); const c = clone(l.item); const reid = (it) => { it.id = uid('s'); if (it.type === 'block') it.branches.forEach((b) => b.items.forEach(reid)); }; reid(c); l.list.splice(l.index + 1, 0, c); }); };
  const patchItem = (patch) => mutate((s) => { Object.assign(locate(s.items, selected).item, patch); });
  const patchPart = (patch) => mutate((s) => { Object.assign(s.participants.find((p) => `p:${p.id}` === selected), patch); });

  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(clone(seqRef.current)); setSeq(p); onDirty?.(); }, [onDirty]);
  const redo = useCallback(() => { const n = future.current.pop(); if (!n) return; past.current.push(clone(seqRef.current)); setSeq(n); onDirty?.(); }, [onDirty]);

  useImperativeHandle(ref, () => ({
    getDiagram: () => ({ ...diagram, name, sequence: seqRef.current }),
    undo, redo, remove: removeSelected, duplicate,
    zoomIn: () => setZoom((z) => Math.min(3, z * 1.2)), zoomOut: () => setZoom((z) => Math.max(0.2, z / 1.2)), fit,
    copy: () => false, paste: () => {}, cut: () => {}, selectAll: () => {}, align: () => {}, group: () => {}, ungroup: () => {}, autoLayout: () => {}, addShape: () => {},
    reset: (d) => { past.current = []; future.current = []; setSeq(clone(d.sequence)); setSelected(null); },
    focus: () => box.current?.focus(),
  }), [diagram, name, undo, redo, removeSelected, duplicate, fit]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const onKey = (e) => {
      const tag = e.target?.tagName; const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('dw:save')); return; }
      if (typing) return;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
      else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
      else if (e.key === 'Escape') setSelected(null);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicate, removeSelected]);

  const onSvgClick = (e) => {
    const g = e.target.closest?.('[data-item-id],[data-participant-id]');
    if (!g) { setSelected(null); return; }
    setSelected(g.dataset.itemId ?? `p:${g.dataset.participantId}`);
  };

  const pOpts = seq.participants.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.id})</option>);

  return (
    <div className="dw-seq-layout">
      <aside className="dw-shape-panel" aria-label="Sequence tools">
        <div className="dw-panel-title">Add</div>
        <div className="dw-seq-add">
          <button type="button" className="dw-btn" onClick={() => addParticipant()}>Participant</button>
          <button type="button" className="dw-btn" onClick={() => addParticipant('actor')}>Actor</button>
          <button type="button" className="dw-btn" onClick={addMessage} disabled={!seq.participants.length}>Message</button>
          <button type="button" className="dw-btn" onClick={addNote} disabled={!seq.participants.length}>Note</button>
          {BLOCKS.map((b) => <button key={b} type="button" className="dw-btn" onClick={() => addBlock(b)}>{b}</button>)}
        </div>
        <div className="dw-panel-title" style={{ marginTop: 14 }}>Outline</div>
        <OutlineTree seq={seq} selected={selected} onSelect={setSelected} />
        <p className="dw-hint">Items are inserted after the selected one. Click anything in the diagram to edit it.</p>
      </aside>

      <div className="dw-canvas dw-seq-canvas" ref={box} tabIndex={0} aria-label="Sequence diagram">
        <div className="dw-seq-scroll" onClick={onSvgClick}>
          <svg width={svg.width * zoom} height={svg.height * zoom} viewBox={`0 0 ${svg.width} ${svg.height}`} role="img" aria-label={`Sequence diagram ${name}`} dangerouslySetInnerHTML={{ __html: svg.markup }} />
        </div>
        <div className="dw-zoom-badge">{Math.round(zoom * 100)}%</div>
      </div>

      <aside className="dw-inspector" aria-label="Properties">
        {!selected && (
          <>
            <div className="dw-panel-title">Sequence diagram</div>
            <label className="dw-row"><span>Name</span><div><input className="dw-input" value={name} onChange={(e) => { setName(e.target.value); onNameChange?.(e.target.value); onDirty?.(); }} /></div></label>
            <label className="dw-row"><span>Title</span><div><input className="dw-input" value={seq.title ?? ''} onChange={(e) => mutate((s) => { s.title = e.target.value; })} /></div></label>
            <label className="dw-row"><span>Numbering</span><div><input type="checkbox" checked={!!seq.autonumber} onChange={(e) => mutate((s) => { s.autonumber = e.target.checked; })} /></div></label>
            <dl className="dw-facts"><dt>Participants</dt><dd>{seq.participants.length}</dd><dt>Source file</dt><dd>{diagram.sourceFile}</dd></dl>
          </>
        )}
        {selPart && (
          <>
            <div className="dw-panel-title">Participant</div>
            <label className="dw-row"><span>Label</span><div><input className="dw-input" value={selPart.label} onChange={(e) => patchPart({ label: e.target.value })} /></div></label>
            <label className="dw-row"><span>Kind</span><div><select className="dw-input" value={selPart.kind} onChange={(e) => patchPart({ kind: e.target.value })}><option value="participant">Participant</option><option value="actor">Actor</option></select></div></label>
            <div className="dw-btn-row"><button type="button" className="dw-btn" onClick={() => move(-1)}>← Move left</button><button type="button" className="dw-btn" onClick={() => move(1)}>Move right →</button></div>
            <button type="button" className="dw-btn dw-danger" onClick={removeSelected}>Delete participant</button>
          </>
        )}
        {selItem?.item.type === 'message' && (
          <>
            <div className="dw-panel-title">Message</div>
            <label className="dw-row"><span>From</span><div><select className="dw-input" value={selItem.item.from} onChange={(e) => patchItem({ from: e.target.value })}>{pOpts}</select></div></label>
            <label className="dw-row"><span>To</span><div><select className="dw-input" value={selItem.item.to} onChange={(e) => patchItem({ to: e.target.value })}>{pOpts}</select></div></label>
            <label className="dw-row"><span>Text</span><div><textarea className="dw-input" rows={2} value={selItem.item.text} onChange={(e) => patchItem({ text: e.target.value })} /></div></label>
            <label className="dw-row"><span>Arrow</span><div><select className="dw-input" value={`${selItem.item.line}:${selItem.item.head}`} onChange={(e) => { const [line, head] = e.target.value.split(':'); patchItem({ line, head }); }}>{ARROWS.map(([l, h, t]) => <option key={t} value={`${l}:${h}`}>{t}</option>)}</select></div></label>
            <ItemButtons move={move} duplicate={duplicate} remove={removeSelected} />
          </>
        )}
        {selItem?.item.type === 'note' && (
          <>
            <div className="dw-panel-title">Note</div>
            <label className="dw-row"><span>Placement</span><div><select className="dw-input" value={selItem.item.placement} onChange={(e) => patchItem({ placement: e.target.value })}><option value="over">over</option><option value="left of">left of</option><option value="right of">right of</option></select></div></label>
            <label className="dw-row"><span>Participant</span><div><select className="dw-input" value={selItem.item.actors[0]} onChange={(e) => patchItem({ actors: [e.target.value, ...selItem.item.actors.slice(1)] })}>{pOpts}</select></div></label>
            {selItem.item.placement === 'over' && (
              <label className="dw-row"><span>…and</span><div><select className="dw-input" value={selItem.item.actors[1] ?? ''} onChange={(e) => patchItem({ actors: e.target.value ? [selItem.item.actors[0], e.target.value] : [selItem.item.actors[0]] })}><option value="">(none)</option>{pOpts}</select></div></label>
            )}
            <label className="dw-row"><span>Text</span><div><textarea className="dw-input" rows={3} value={selItem.item.text} onChange={(e) => patchItem({ text: e.target.value })} /></div></label>
            <ItemButtons move={move} duplicate={duplicate} remove={removeSelected} />
          </>
        )}
        {selItem?.item.type === 'block' && (
          <>
            <div className="dw-panel-title">Block: {selItem.item.kind}</div>
            <label className="dw-row"><span>Kind</span><div><select className="dw-input" value={selItem.item.kind} onChange={(e) => patchItem({ kind: e.target.value })}>{BLOCKS.map((b) => <option key={b}>{b}</option>)}</select></div></label>
            {selItem.item.branches.map((b, i) => (
              <label className="dw-row" key={i}><span>{i === 0 ? 'Condition' : b.word ?? 'else'}</span><div><input className="dw-input" value={b.label} onChange={(e) => mutate((s) => { locate(s.items, selected).item.branches[i].label = e.target.value; })} /></div></label>
            ))}
            {['alt', 'par', 'critical'].includes(selItem.item.kind) && (
              <button type="button" className="dw-btn" onClick={() => mutate((s) => { locate(s.items, selected).item.branches.push({ label: '', items: [], word: selItem.item.kind === 'par' ? 'and' : selItem.item.kind === 'critical' ? 'option' : 'else' }); })}>Add branch</button>
            )}
            <p className="dw-hint">Select a message or note, then use Add — new items go after it. To move an item into this block, duplicate it here (nesting is edited via the outline).</p>
            <ItemButtons move={move} duplicate={duplicate} remove={removeSelected} />
          </>
        )}
      </aside>
    </div>
  );
});

function ItemButtons({ move, duplicate, remove }) {
  return (
    <div className="dw-btn-row">
      <button type="button" className="dw-btn" onClick={() => move(-1)}>↑ Up</button>
      <button type="button" className="dw-btn" onClick={() => move(1)}>↓ Down</button>
      <button type="button" className="dw-btn" onClick={duplicate}>Duplicate</button>
      <button type="button" className="dw-btn dw-danger" onClick={remove}>Delete</button>
    </div>
  );
}

function OutlineTree({ seq, selected, onSelect }) {
  const pLabel = (id) => seq.participants.find((p) => p.id === id)?.label ?? id;
  const render = (items, depth) => items.map((it) => {
    const common = { type: 'button', className: `dw-outline-item${selected === it.id ? ' is-selected' : ''}`, style: { paddingLeft: 8 + depth * 12 }, onClick: () => onSelect(it.id) };
    if (it.type === 'message') return <button key={it.id} {...common}>{pLabel(it.from)} {it.line === 'dashed' ? '⇢' : '→'} {pLabel(it.to)}: {it.text}</button>;
    if (it.type === 'note') return <button key={it.id} {...common}>📝 {it.text.split('\n')[0]}</button>;
    if (it.type === 'block') return (
      <div key={it.id}>
        <button {...common}><b>{it.kind}</b> {it.branches[0].label}</button>
        {it.branches.map((b, i) => (
          <div key={i}>
            {i > 0 && <div className="dw-outline-branch" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>{b.word ?? 'else'} {b.label}</div>}
            {render(b.items, depth + 1)}
          </div>
        ))}
      </div>
    );
    return null;
  });
  return (
    <div className="dw-outline" role="tree" aria-label="Diagram outline">
      {seq.participants.map((p) => <button key={p.id} type="button" className={`dw-outline-item${selected === `p:${p.id}` ? ' is-selected' : ''}`} onClick={() => onSelect(`p:${p.id}`)}>{p.kind === 'actor' ? '🧍' : '▭'} {p.label}</button>)}
      <hr />
      {render(seq.items, 0)}
    </div>
  );
}

export default SequenceEditor;

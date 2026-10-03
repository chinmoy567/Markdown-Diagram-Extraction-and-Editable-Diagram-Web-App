'use client';
import { useEffect, useRef, useState } from 'react';
import { toHex, withLabel } from './util';
import { resolveStyle } from '@/lib/render/shapes';
import { resolveEdgeStyle } from '@/lib/render/edges';
import { typeLabel } from '@/lib/diagrams/model';

const SHAPE_OPTIONS = ['rectangle', 'rounded', 'stadium', 'circle', 'ellipse', 'diamond', 'hexagon', 'triangle', 'cylinder', 'subroutine', 'parallelogram', 'trapezoid', 'document', 'folder', 'cloud', 'user', 'server', 'computer', 'laptop', 'mobile', 'component', 'note', 'text'];
const ARROW_OPTIONS = [['none', 'None'], ['arrow', 'Arrow'], ['open', 'Open arrow'], ['triangle', 'Hollow triangle'], ['diamond', 'Hollow diamond'], ['diamond-filled', 'Filled diamond'], ['circle', 'Circle'], ['cross', 'Cross']];

function Row({ label, children, htmlFor }) {
  return <label className="dw-row" htmlFor={htmlFor}><span>{label}</span><div>{children}</div></label>;
}

function Num({ id, value, onChange, min, max, step = 1 }) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  return <input id={id} className="dw-input" type="number" value={v} min={min} max={max} step={step}
    onChange={(e) => { setV(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n); }} />;
}

function ColorInput({ id, value, onChange, allowNone }) {
  const transparent = value === 'transparent' || value === 'none';
  return (
    <span className="dw-color">
      <input id={id} type="color" value={toHex(value, '#ffffff')} onChange={(e) => onChange(e.target.value)} aria-label={id} />
      {allowNone && <button type="button" className="dw-mini" aria-pressed={transparent} onClick={() => onChange(transparent ? '#ffffff' : 'transparent')}>{transparent ? 'No fill ✓' : 'No fill'}</button>}
    </span>
  );
}

export default function Inspector({ diagram, nodes, edges, onNodes, onEdges, onDiagramName, labelRef, onBeginEdit }) {
  const selNodes = nodes.filter((n) => n.selected);
  const selEdges = edges.filter((e) => e.selected);
  const first = selNodes[0];
  const kind = selNodes.length ? (selNodes.every((n) => n.type === 'group') ? 'group' : selNodes.every((n) => n.type === 'class') ? 'class' : 'node') : selEdges.length ? 'edge' : 'none';
  const setStyle = (patch) => { onBeginEdit(); onNodes(selNodes.map((n) => n.id), (n) => ({ ...n, data: { ...n.data, style: { ...n.data.style, ...patch } } })); };
  const setEdgeStyle = (patch) => { onBeginEdit(); onEdges(selEdges.map((e) => e.id), (e) => ({ ...e, data: { ...e.data, style: { ...e.data.style, ...patch } } })); };
  const ref = useRef(null);

  if (kind === 'none') {
    return (
      <aside className="dw-inspector" aria-label="Properties">
        <div className="dw-panel-title">Diagram</div>
        <Row label="Name" htmlFor="dw-name"><input id="dw-name" className="dw-input" value={diagram.name} onChange={(e) => onDiagramName(e.target.value)} /></Row>
        <dl className="dw-facts">
          <dt>Source file</dt><dd>{diagram.sourceFile}</dd>
          <dt>Type</dt><dd>{diagram.source.format === 'mermaid' ? 'Mermaid' : 'ASCII'} · {typeLabel(diagram.source.type)}</dd>
          {diagram.metadata?.sourceHeading && (<><dt>Heading</dt><dd>{diagram.metadata.sourceHeading}</dd></>)}
          {diagram.metadata?.sourceLine && (<><dt>Location</dt><dd>lines {diagram.metadata.sourceLine}–{diagram.metadata.sourceEndLine}</dd></>)}
          <dt>Objects</dt><dd>{nodes.filter((n) => n.type !== 'group').length} nodes · {edges.length} connectors · {nodes.filter((n) => n.type === 'group').length} containers</dd>
        </dl>
        <p className="dw-hint">Click an object to edit it. Double-click text to rename. Drag from a shape's edge handle to another shape to connect.</p>
      </aside>
    );
  }

  if (kind === 'edge') {
    const e = selEdges[0];
    const st = resolveEdgeStyle(e.data?.style);
    return (
      <aside className="dw-inspector" aria-label="Connector properties">
        <div className="dw-panel-title">Connector{selEdges.length > 1 ? `s (${selEdges.length})` : ''}</div>
        {selEdges.length === 1 && (
          <Row label="Label" htmlFor="dw-elabel">
            <textarea id="dw-elabel" className="dw-input" rows={2} value={e.data?.label ?? ''} ref={labelRef}
              onFocus={onBeginEdit}
              onChange={(ev) => onEdges([e.id], (x) => ({ ...x, data: { ...x.data, label: ev.target.value } }))} />
          </Row>
        )}
        <Row label="Line" htmlFor="dw-line"><select id="dw-line" className="dw-input" value={st.lineType} onChange={(ev) => setEdgeStyle({ lineType: ev.target.value })}>
          <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="thick">Thick</option><option value="invisible">Invisible</option></select></Row>
        <Row label="Start" htmlFor="dw-as"><select id="dw-as" className="dw-input" value={st.arrowStart} onChange={(ev) => setEdgeStyle({ arrowStart: ev.target.value })}>{ARROW_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row label="End" htmlFor="dw-ae"><select id="dw-ae" className="dw-input" value={st.arrowEnd} onChange={(ev) => setEdgeStyle({ arrowEnd: ev.target.value })}>{ARROW_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row label="Route" htmlFor="dw-route"><select id="dw-route" className="dw-input" value={st.routing} onChange={(ev) => setEdgeStyle({ routing: ev.target.value })}>
          <option value="smoothstep">Orthogonal</option><option value="bezier">Curved</option><option value="straight">Straight</option></select></Row>
        <Row label="Width" htmlFor="dw-ew"><Num id="dw-ew" value={st.width} min={0.5} max={12} step={0.5} onChange={(n) => setEdgeStyle({ width: n })} /></Row>
        <Row label="Colour" htmlFor="dw-ec"><ColorInput id="dw-ec" value={st.color} onChange={(c) => setEdgeStyle({ color: c })} /></Row>
        {selEdges.length === 1 && (
          <button type="button" className="dw-btn" onClick={() => { onBeginEdit(); onEdges([e.id], (x) => ({ ...x, source: x.target, target: x.source, sourceHandle: x.targetHandle, targetHandle: x.sourceHandle })); }}>Reverse direction</button>
        )}
      </aside>
    );
  }

  const st = resolveStyle(first.data.style);
  const isGroup = kind === 'group';
  return (
    <aside className="dw-inspector" aria-label="Shape properties">
      <div className="dw-panel-title">{isGroup ? 'Container' : kind === 'class' ? 'Class' : 'Shape'}{selNodes.length > 1 ? `s (${selNodes.length})` : ''}</div>
      {selNodes.length === 1 && kind !== 'class' && (
        <Row label="Label" htmlFor="dw-label">
          <textarea id="dw-label" className="dw-input" rows={3} value={first.data.label ?? ''} ref={labelRef} onFocus={onBeginEdit}
            onChange={(ev) => onNodes([first.id], (n) => (n.type === 'group' ? { ...n, data: { ...n.data, label: ev.target.value } } : withLabel(n, ev.target.value)))} />
        </Row>
      )}
      {kind === 'class' && selNodes.length === 1 && (
        <>
          <Row label="Name" htmlFor="dw-cname"><input id="dw-cname" className="dw-input" ref={labelRef} value={first.data.label} onFocus={onBeginEdit} onChange={(ev) => onNodes([first.id], (n) => ({ ...n, data: { ...n.data, label: ev.target.value } }))} /></Row>
          <Row label="Stereotype" htmlFor="dw-cst"><input id="dw-cst" className="dw-input" value={first.data.stereotype ?? ''} onFocus={onBeginEdit} onChange={(ev) => onNodes([first.id], (n) => ({ ...n, data: { ...n.data, stereotype: ev.target.value } }))} /></Row>
          <Row label="Attributes" htmlFor="dw-cat"><textarea id="dw-cat" className="dw-input dw-mono" rows={5} value={(first.data.attributes ?? []).join('\n')} onFocus={onBeginEdit} onChange={(ev) => onNodes([first.id], (n) => grow({ ...n, data: { ...n.data, attributes: ev.target.value.split('\n') } }))} /></Row>
          <Row label="Methods" htmlFor="dw-cme"><textarea id="dw-cme" className="dw-input dw-mono" rows={4} value={(first.data.methods ?? []).join('\n')} onFocus={onBeginEdit} onChange={(ev) => onNodes([first.id], (n) => grow({ ...n, data: { ...n.data, methods: ev.target.value.split('\n') } }))} /></Row>
        </>
      )}
      {kind === 'node' && (
        <Row label="Shape" htmlFor="dw-shape"><select id="dw-shape" className="dw-input" value={first.data.shape} onChange={(ev) => { onBeginEdit(); onNodes(selNodes.map((n) => n.id), (n) => ({ ...n, data: { ...n.data, shape: ev.target.value } })); }}>
          {SHAPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Row>
      )}
      <div className="dw-panel-sub">Appearance</div>
      <Row label="Fill" htmlFor="dw-fill"><ColorInput id="dw-fill" value={st.fill} allowNone onChange={(c) => setStyle({ fill: c })} /></Row>
      <Row label="Border" htmlFor="dw-stroke"><ColorInput id="dw-stroke" value={st.stroke} allowNone onChange={(c) => setStyle({ stroke: c })} /></Row>
      <Row label="Border width" htmlFor="dw-sw"><Num id="dw-sw" value={st.strokeWidth} min={0} max={12} step={0.5} onChange={(n) => setStyle({ strokeWidth: n })} /></Row>
      <Row label="Border style" htmlFor="dw-dash"><select id="dw-dash" className="dw-input" value={st.dash ? 'dashed' : 'solid'} onChange={(ev) => setStyle({ dash: ev.target.value === 'dashed' ? '5 4' : '' })}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></Row>
      <div className="dw-panel-sub">Text</div>
      <Row label="Colour" htmlFor="dw-tc"><ColorInput id="dw-tc" value={st.color} onChange={(c) => setStyle({ color: c })} /></Row>
      <Row label="Size" htmlFor="dw-fs"><Num id="dw-fs" value={st.fontSize} min={7} max={64} onChange={(n) => setStyle({ fontSize: n })} /></Row>
      <Row label="Style">
        <span className="dw-seg">
          <button type="button" aria-pressed={st.fontWeight === 'bold'} onClick={() => setStyle({ fontWeight: st.fontWeight === 'bold' ? 'normal' : 'bold' })}><b>B</b></button>
          <button type="button" aria-pressed={st.fontStyle === 'italic'} onClick={() => setStyle({ fontStyle: st.fontStyle === 'italic' ? 'normal' : 'italic' })}><i>I</i></button>
          {['left', 'center', 'right'].map((a) => <button key={a} type="button" aria-pressed={st.textAlign === a} onClick={() => setStyle({ textAlign: a })} aria-label={`Align ${a}`}>{a === 'left' ? '⇤' : a === 'right' ? '⇥' : '↔'}</button>)}
        </span>
      </Row>
      {selNodes.length === 1 && (
        <>
          <div className="dw-panel-sub">Geometry</div>
          <div className="dw-geo">
            <label>W<Num id="dw-w" value={Math.round(first.width ?? 0)} min={10} onChange={(n) => { onBeginEdit(); onNodes([first.id], (x) => ({ ...x, width: n })); }} /></label>
            <label>H<Num id="dw-h" value={Math.round(first.height ?? 0)} min={4} onChange={(n) => { onBeginEdit(); onNodes([first.id], (x) => ({ ...x, height: n })); }} /></label>
          </div>
        </>
      )}
      <div ref={ref} />
    </aside>
  );
}

function grow(n) {
  // class boxes: keep height large enough for the members
  const lines = 2 + (n.data.attributes?.length ?? 0) + (n.data.methods?.length ?? 0) + (n.data.stereotype ? 1 : 0);
  return { ...n, height: Math.max(n.height ?? 0, Math.round(lines * 16.2 + 24)) };
}

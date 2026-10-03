'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { shapeMarkup, classMarkup, labelBox, resolveStyle, groupMarkup } from '@/lib/render/shapes';
import { FONT_FAMILY, LINE_HEIGHT } from '@/lib/diagrams/measure';
import { withLabel } from './util';

const SIDES = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];

function Handles() {
  return SIDES.map(([id, pos]) => (
    <span key={id}>
      <Handle id={id} type="source" position={pos} className="dw-handle" />
      <Handle id={id} type="target" position={pos} className="dw-handle dw-handle-t" />
    </span>
  ));
}

/** Inline label editor shared by all node types. Commits on blur / Ctrl+Enter, cancels on Escape. */
function useLabelEdit(id, field = 'label') {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const commit = useCallback((value, changed) => {
    setEditing(false);
    if (!changed) return;
    window.dispatchEvent(new CustomEvent('dw:before-edit'));
    setNodes((ns) => ns.map((n) => (n.id === id ? (field === 'label' && n.type !== 'group' ? withLabel(n, value) : { ...n, data: { ...n.data, [field]: value } }) : n)));
  }, [id, field, setNodes]);
  return { editing, setEditing, commit };
}

function LabelEditor({ value, style, onCommit, box }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const s = resolveStyle(style);
  return (
    <textarea
      ref={ref}
      defaultValue={value}
      aria-label="Edit label"
      className="nodrag nopan dw-label-editor"
      style={{ left: box.x, top: box.y, width: Math.max(box.w, 60), height: Math.max(box.h, 28), fontSize: s.fontSize, color: s.color, textAlign: s.textAlign }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onCommit(value, false);
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onCommit(e.currentTarget.value, e.currentTarget.value !== value);
      }}
      onBlur={(e) => onCommit(e.currentTarget.value, e.currentTarget.value !== value)}
    />
  );
}

export const ShapeNode = memo(function ShapeNode({ id, data, selected, width, height }) {
  const w = width ?? 140, h = height ?? 56;
  const { editing, setEditing, commit } = useLabelEdit(id);
  const s = resolveStyle(data.style);
  const box = labelBox(data.shape, w, h);
  const lines = String(data.label ?? '').split('\n');
  const isBar = data.bar;
  return (
    <div style={{ width: w, height: h }} onDoubleClick={(e) => { e.stopPropagation(); if (data.shape !== 'start' && data.shape !== 'end') setEditing(true); }}>
      <NodeResizer isVisible={selected} minWidth={isBar ? 20 : 30} minHeight={isBar ? 4 : 18} lineClassName="dw-resize-line" handleClassName="dw-resize-handle" onResizeStart={() => window.dispatchEvent(new CustomEvent('dw:before-edit'))} />
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: isBar ? `<rect width="${w}" height="${h}" rx="2" fill="${s.stroke}"/>` : shapeMarkup(data.shape, w, h, data.style) }} />
      {!editing && !isBar && (
        <div className="dw-label" style={{ left: box.x, top: box.y, width: box.w, height: box.h, fontSize: s.fontSize, color: s.color, fontWeight: s.fontWeight, fontStyle: s.fontStyle, textAlign: s.textAlign, fontFamily: FONT_FAMILY, lineHeight: LINE_HEIGHT }}>
          <div>
            {lines.map((l, i) => <div key={i}>{l || ' '}</div>)}
            {data.members?.length ? <div className="dw-members" style={{ fontSize: s.fontSize - 1 }}>{data.members.map((m, i) => <div key={i}>{m}</div>)}</div> : null}
          </div>
        </div>
      )}
      {editing && <LabelEditor value={data.label ?? ''} style={data.style} onCommit={commit} box={box} />}
      <Handles />
    </div>
  );
});

export const ClassNode = memo(function ClassNode({ id, data, selected, width, height }) {
  const w = width ?? 160, h = height ?? 100;
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const node = { width: w, height: h, label: data.label, stereotype: data.stereotype, attributes: data.attributes, methods: data.methods, style: data.style };
  const text = [data.label, '', ...(data.attributes ?? []), '--', ...(data.methods ?? [])].join('\n');
  const commit = (value, changed) => {
    setEditing(false);
    if (!changed) return;
    const [name, , ...rest] = value.split('\n');
    const sep = rest.indexOf('--');
    const attributes = (sep < 0 ? rest : rest.slice(0, sep)).filter((l) => l.trim());
    const methods = sep < 0 ? [] : rest.slice(sep + 1).filter((l) => l.trim());
    window.dispatchEvent(new CustomEvent('dw:before-edit'));
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: name, attributes, methods } } : n)));
  };
  return (
    <div style={{ width: w, height: h }} onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <NodeResizer isVisible={selected} minWidth={80} minHeight={50} lineClassName="dw-resize-line" handleClassName="dw-resize-handle" onResizeStart={() => window.dispatchEvent(new CustomEvent('dw:before-edit'))} />
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: classMarkup(node) }} />
      {editing && (
        <textarea autoFocus defaultValue={text} className="nodrag nopan dw-label-editor dw-mono" aria-label="Edit class: name, blank line, attributes, a line with -- then methods"
          style={{ left: 0, top: 0, width: Math.max(w, 220), height: Math.max(h, 120), zIndex: 10 }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') commit(text, false); }}
          onBlur={(e) => commit(e.currentTarget.value, e.currentTarget.value !== text)} />
      )}
      <Handles />
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ id, data, selected, width, height }) {
  const w = width ?? 300, h = height ?? 200;
  const { editing, setEditing, commit } = useLabelEdit(id);
  const s = resolveStyle(data.style);
  return (
    <div style={{ width: w, height: h }}>
      <NodeResizer isVisible={selected} minWidth={80} minHeight={60} lineClassName="dw-resize-line" handleClassName="dw-resize-handle" onResizeStart={() => window.dispatchEvent(new CustomEvent('dw:before-edit'))} />
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: groupMarkup({ label: editing ? '' : data.label, style: data.style, width: w, height: h }) }} />
      <div className="dw-group-title-hit" style={{ height: s.fontSize * LINE_HEIGHT * Math.max(1, String(data.label ?? '').split('\n').length) + 14 }} onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }} />
      {editing && <LabelEditor value={data.label ?? ''} style={data.style} onCommit={commit} box={{ x: 6, y: 4, w: Math.min(w - 12, 420), h: s.fontSize * LINE_HEIGHT * 2 + 8 }} />}
      <Handles />
    </div>
  );
});

export const nodeTypes = { shape: ShapeNode, class: ClassNode, group: GroupNode };

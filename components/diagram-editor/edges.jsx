'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { edgeGeometry, resolveEdgeStyle, markerDef, dashFor } from '@/lib/render/edges';

export const StyledEdge = memo(function StyledEdge(props) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const { setEdges } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const st = resolveEdgeStyle(data?.style);
  const sx = sourceX, sy = sourceY;
  const g = edgeGeometry({ sx, sy, tx: targetX, ty: targetY, sourceSide: sourcePosition, targetSide: targetPosition, routing: st.routing });
  const width = st.lineType === 'thick' ? Math.max(st.width * 2, 3) : st.width;
  const mid = `dw-mk-${id}`;
  const inkColor = selected ? '#2563eb' : st.color;
  const dash = dashFor(st.lineType, width);
  if (st.lineType === 'invisible' && !selected) return null;

  const setLabel = (value) => {
    setEditing(false);
    if ((data?.label ?? '') === value) return;
    window.dispatchEvent(new CustomEvent('dw:before-edit'));
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data, label: value } } : e)));
  };
  const meta = data?.meta ?? {};
  return (
    <>
      <defs dangerouslySetInnerHTML={{ __html:
        (st.arrowStart !== 'none' ? markerDef(`${mid}-s`, st.arrowStart, inkColor, width) : '') +
        (st.arrowEnd !== 'none' ? markerDef(`${mid}-e`, st.arrowEnd, inkColor, width) : '') }} />
      <BaseEdge id={id} path={g.d}
        markerStart={st.arrowStart !== 'none' ? `url(#${mid}-s)` : undefined}
        markerEnd={st.arrowEnd !== 'none' ? `url(#${mid}-e)` : undefined}
        interactionWidth={18}
        style={{ stroke: inkColor, strokeWidth: width + (selected ? 0.8 : 0), strokeDasharray: dash || undefined, opacity: st.lineType === 'invisible' ? 0.35 : 1 }} />
      <EdgeLabelRenderer>
        {(data?.label || editing) && (
          <div className="dw-edge-label nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${g.lx}px,${g.ly}px)` }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
            {editing
              ? <EdgeLabelInput value={data?.label ?? ''} onDone={setLabel} />
              : <span>{String(data.label).split('\n').map((l, i) => <span key={i} className="block">{l}</span>)}</span>}
          </div>
        )}
        {!data?.label && !editing && selected && (
          <button type="button" className="dw-edge-add-label nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${g.lx}px,${g.ly}px)` }}
            onClick={() => setEditing(true)} aria-label="Add connector label">+ label</button>
        )}
        {meta.startLabel && <div className="dw-edge-end-label nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${sx + 14}px,${sy - 12}px)` }}>{meta.startLabel}</div>}
        {meta.endLabel && <div className="dw-edge-end-label nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${targetX + 14}px,${targetY - 12}px)` }}>{meta.endLabel}</div>}
      </EdgeLabelRenderer>
    </>
  );
});

function EdgeLabelInput({ value, onDone }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <textarea ref={ref} defaultValue={value} rows={Math.max(1, value.split('\n').length)} aria-label="Edit connector label"
      className="dw-edge-input"
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onDone(value); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onDone(e.currentTarget.value); } }}
      onBlur={(e) => onDone(e.currentTarget.value)} />
  );
}

export const edgeTypes = { styled: StyledEdge };

'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, ConnectionMode, SelectionMode,
  applyNodeChanges, applyEdgeChanges, useReactFlow, reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import Inspector from './Inspector';
import ShapePanel from '../shape-panel/ShapePanel';
import { diagramToFlow, flowToDiagram, absolutePosition, sizeOf } from '@/lib/diagrams/serializer';
import { layoutDiagram } from '@/lib/diagrams/layout';
import { uid, DEFAULT_EDGE_STYLE } from '@/lib/diagrams/model';
import { buildPaletteItem, sortNodes, SHAPE_PALETTE } from './util';

const CLIP_KEY = 'dw-clipboard';
let memoryClipboard = null;
const strip = (list) => list.map(({ selected, dragging, measured, ...rest }) => rest);
const clone = (v) => JSON.parse(JSON.stringify(v));

const GraphCanvas = forwardRef(function GraphCanvas({ diagram, onDirty, onState, onNameChange, showGrid, snap, referencePanel }, ref) {
  const initial = useMemo(() => diagramToFlow(diagram), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const nodesRef = useRef(nodes), edgesRef = useRef(edges);
  nodesRef.current = nodes; edgesRef.current = edges;
  const past = useRef([]), future = useRef([]);
  const lastNudge = useRef(0);
  const wrapRef = useRef(null);
  const labelRef = useRef(null);
  const rf = useReactFlow();
  const [zoom, setZoom] = useState(1);
  const [name, setName] = useState(diagram.name);

  /* ---------- history ---------- */
  const snapshot = () => ({ nodes: clone(strip(nodesRef.current)), edges: clone(strip(edgesRef.current)) });
  const emitState = useCallback(() => {
    const sel = nodesRef.current.filter((n) => n.selected);
    onState?.({ canUndo: past.current.length > 0, canRedo: future.current.length > 0, selectedNodes: sel.length, selectedEdges: edgesRef.current.filter((e) => e.selected).length, selectedGroups: sel.filter((n) => n.type === 'group').length, zoom: rf.getZoom?.() ?? 1 });
  }, [onState, rf]);
  const pushHistory = useCallback(() => {
    past.current.push(snapshot());
    if (past.current.length > 150) past.current.shift();
    future.current = [];
    onDirty?.();
    emitState();
  }, [onDirty, emitState]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapshot());
    setNodes(prev.nodes); setEdges(prev.edges); onDirty?.();
    setTimeout(emitState, 0);
  }, [emitState, onDirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapshot());
    setNodes(next.nodes); setEdges(next.edges); onDirty?.();
    setTimeout(emitState, 0);
  }, [emitState, onDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Node/edge components request a snapshot before they change data.
  useEffect(() => {
    const h = () => pushHistory();
    window.addEventListener('dw:before-edit', h);
    return () => window.removeEventListener('dw:before-edit', h);
  }, [pushHistory]);

  /* ---------- React Flow handlers ---------- */
  const onNodesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) pushHistory();
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === 'select')) setTimeout(emitState, 0);
  }, [pushHistory, emitState]);
  const onEdgesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) pushHistory();
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type === 'select')) setTimeout(emitState, 0);
  }, [pushHistory, emitState]);
  const onConnect = useCallback((c) => {
    pushHistory();
    setEdges((es) => [...es, { id: uid('e'), source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, type: 'styled', data: { label: '', style: { ...DEFAULT_EDGE_STYLE } }, zIndex: 10 }]);
  }, [pushHistory]);
  const onReconnect = useCallback((oldEdge, conn) => {
    pushHistory();
    setEdges((es) => reconnectEdge(oldEdge, conn, es));
  }, [pushHistory]);

  const groupAt = useCallback((x, y, excludeIds = new Set()) => {
    const all = nodesRef.current;
    const byId = new Map(all.map((n) => [n.id, n]));
    let best = null, bestDepth = -1;
    for (const g of all) {
      if (g.type !== 'group' || excludeIds.has(g.id)) continue;
      // skip descendants of excluded nodes
      let p = g.parentId, bad = false;
      while (p) { if (excludeIds.has(p)) { bad = true; break; } p = byId.get(p)?.parentId; }
      if (bad) continue;
      const a = absolutePosition(g, byId), s = sizeOf(g);
      if (x >= a.x && x <= a.x + s.width && y >= a.y && y <= a.y + s.height) {
        let d = 0, q = g.parentId; while (q) { d++; q = byId.get(q)?.parentId; }
        if (d > bestDepth) { best = g; bestDepth = d; }
      }
    }
    return best;
  }, []);

  const reparent = useCallback((ids) => {
    setNodes((ns) => {
      const byId = new Map(ns.map((n) => [n.id, n]));
      const moving = new Set(ids);
      let changed = false;
      const out = ns.map((n) => {
        if (!moving.has(n.id)) return n;
        // Only the top-most dragged nodes are re-parented; descendants keep their relative position.
        if (n.parentId && moving.has(n.parentId)) return n;
        const a = absolutePosition(n, byId), s = sizeOf(n);
        const g = groupAt(a.x + s.width / 2, a.y + s.height / 2, new Set([n.id]));
        const newParent = g?.id;
        if ((n.parentId ?? undefined) === newParent) return n;
        changed = true;
        const ga = g ? absolutePosition(g, byId) : { x: 0, y: 0 };
        const { parentId, ...rest } = n;
        return { ...rest, ...(newParent ? { parentId: newParent } : {}), position: { x: a.x - ga.x, y: a.y - ga.y } };
      });
      return changed ? sortNodes(out) : ns;
    });
  }, [groupAt]);

  const onNodeDragStart = useCallback(() => pushHistory(), [pushHistory]);
  const onNodeDragStop = useCallback((_, __, dragged) => { reparent((dragged ?? []).map((n) => n.id)); }, [reparent]);

  /* ---------- palette ---------- */
  const addItem = useCallback((item, at) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const center = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 100, y: 100 };
    const p = at ?? { x: center.x - 70, y: center.y - 28 };
    const { nodes: nn, edges: ee } = buildPaletteItem(item, p.x, p.y);
    pushHistory();
    // drop into a container if the point lies inside one
    const host = item.key === 'container' ? null : groupAt(p.x + 10, p.y + 10);
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const ga = host ? absolutePosition(host, byId) : null;
    const placed = nn.map((n) => (host ? { ...n, parentId: host.id, position: { x: n.position.x - ga.x, y: n.position.y - ga.y } } : n));
    setNodes((ns) => sortNodes([...ns.map((n) => ({ ...n, selected: false })), ...placed.map((n) => ({ ...n, selected: true }))]));
    setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...ee]);
    setTimeout(emitState, 0);
    wrapRef.current?.focus();
  }, [rf, pushHistory, groupAt, emitState]);

  const onDragOver = useCallback((e) => { if (e.dataTransfer.types.includes('application/dw-shape')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }, []);
  const onDrop = useCallback((e) => {
    const key = e.dataTransfer.getData('application/dw-shape');
    if (!key) return;
    e.preventDefault();
    const item = SHAPE_PALETTE.find((p) => p.key === key);
    if (!item) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addItem(item, { x: pos.x - 60, y: pos.y - 24 });
  }, [rf, addItem]);

  /* ---------- selection operations ---------- */
  const selectedNodes = () => nodesRef.current.filter((n) => n.selected);

  const copy = useCallback(() => {
    const sel = selectedNodes();
    if (!sel.length) return false;
    // include descendants of selected groups
    const ids = new Set(sel.map((n) => n.id));
    let grew = true;
    while (grew) { grew = false; for (const n of nodesRef.current) if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); grew = true; } }
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodesOut = nodesRef.current.filter((n) => ids.has(n.id)).map((n) => {
      const c = clone(strip([n])[0]);
      if (n.parentId && !ids.has(n.parentId)) { const a = absolutePosition(n, byId); c.position = a; delete c.parentId; }
      return c;
    });
    const edgesOut = edgesRef.current.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => clone(strip([e])[0]));
    memoryClipboard = { nodes: nodesOut, edges: edgesOut, n: 0 };
    try { sessionStorage.setItem(CLIP_KEY, JSON.stringify(memoryClipboard)); } catch { /* storage unavailable: memory clipboard still works */ }
    return true;
  }, []);

  const paste = useCallback((offsetStep = 24) => {
    let clip = memoryClipboard;
    if (!clip) { try { clip = JSON.parse(sessionStorage.getItem(CLIP_KEY) ?? 'null'); } catch { clip = null; } }
    if (!clip?.nodes?.length) return;
    clip.n = (clip.n ?? 0) + 1;
    const off = offsetStep * clip.n;
    const map = new Map(clip.nodes.map((n) => [n.id, uid(n.type === 'group' ? 'g' : 'n')]));
    pushHistory();
    const newNodes = clip.nodes.map((n) => ({
      ...clone(n), id: map.get(n.id), selected: true,
      ...(n.parentId && map.has(n.parentId) ? { parentId: map.get(n.parentId) } : {}),
      position: n.parentId && map.has(n.parentId) ? n.position : { x: n.position.x + off, y: n.position.y + off },
    }));
    const newEdges = clip.edges.map((e) => ({ ...clone(e), id: uid('e'), source: map.get(e.source), target: map.get(e.target), selected: false }));
    setNodes((ns) => sortNodes([...ns.map((n) => ({ ...n, selected: false })), ...newNodes]));
    setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...newEdges]);
    setTimeout(emitState, 0);
  }, [pushHistory, emitState]);

  const remove = useCallback(() => {
    const ids = new Set(selectedNodes().map((n) => n.id));
    const eids = new Set(edgesRef.current.filter((e) => e.selected).map((e) => e.id));
    if (!ids.size && !eids.size) return;
    pushHistory();
    // descendants of removed groups go too
    let grew = true;
    while (grew) { grew = false; for (const n of nodesRef.current) if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); grew = true; } }
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
    setEdges((es) => es.filter((e) => !eids.has(e.id) && !ids.has(e.source) && !ids.has(e.target)));
    setTimeout(emitState, 0);
  }, [pushHistory, emitState]);

  const duplicate = useCallback(() => { if (copy()) paste(); }, [copy, paste]);

  const align = useCallback((mode) => {
    const sel = selectedNodes();
    if (sel.length < 2) return;
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const rects = sel.map((n) => ({ n, a: absolutePosition(n, byId), s: sizeOf(n) }));
    const minX = Math.min(...rects.map((r) => r.a.x)), maxX = Math.max(...rects.map((r) => r.a.x + r.s.width));
    const minY = Math.min(...rects.map((r) => r.a.y)), maxY = Math.max(...rects.map((r) => r.a.y + r.s.height));
    pushHistory();
    const target = new Map();
    if (mode.startsWith('dist')) {
      const horiz = mode === 'distH';
      const sorted = [...rects].sort((p, q) => (horiz ? p.a.x - q.a.x : p.a.y - q.a.y));
      if (sorted.length < 3) return;
      const total = sorted.reduce((t, r) => t + (horiz ? r.s.width : r.s.height), 0);
      const span = horiz ? maxX - minX : maxY - minY;
      const gap = (span - total) / (sorted.length - 1);
      let cur = horiz ? minX : minY;
      for (const r of sorted) { target.set(r.n.id, horiz ? { x: cur, y: r.a.y } : { x: r.a.x, y: cur }); cur += (horiz ? r.s.width : r.s.height) + gap; }
    } else {
      for (const r of rects) {
        let { x, y } = r.a;
        if (mode === 'left') x = minX; if (mode === 'right') x = maxX - r.s.width; if (mode === 'centerH') x = (minX + maxX) / 2 - r.s.width / 2;
        if (mode === 'top') y = minY; if (mode === 'bottom') y = maxY - r.s.height; if (mode === 'centerV') y = (minY + maxY) / 2 - r.s.height / 2;
        target.set(r.n.id, { x, y });
      }
    }
    setNodes((ns) => ns.map((n) => {
      const t = target.get(n.id); if (!t) return n;
      const pa = n.parentId ? absolutePosition(byId.get(n.parentId), byId) : { x: 0, y: 0 };
      return { ...n, position: { x: Math.round(t.x - pa.x), y: Math.round(t.y - pa.y) } };
    }));
  }, [pushHistory]);

  const group = useCallback(() => {
    const sel = selectedNodes().filter((n) => !selectedNodes().some((o) => o.id === n.parentId));
    if (sel.length < 2) return;
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const rects = sel.map((n) => ({ n, a: absolutePosition(n, byId), s: sizeOf(n) }));
    const pad = 24, head = 34;
    const minX = Math.min(...rects.map((r) => r.a.x)) - pad, minY = Math.min(...rects.map((r) => r.a.y)) - head;
    const maxX = Math.max(...rects.map((r) => r.a.x + r.s.width)) + pad, maxY = Math.max(...rects.map((r) => r.a.y + r.s.height)) + pad;
    const sharedParent = sel.every((n) => n.parentId === sel[0].parentId) ? sel[0].parentId : undefined;
    const pa = sharedParent ? absolutePosition(byId.get(sharedParent), byId) : { x: 0, y: 0 };
    const gid = uid('g');
    pushHistory();
    const g = { id: gid, type: 'group', position: { x: minX - pa.x, y: minY - pa.y }, width: maxX - minX, height: maxY - minY, ...(sharedParent ? { parentId: sharedParent } : {}), data: { label: 'Group', style: { fill: '#f8fafc', stroke: '#94a3b8', strokeWidth: 1.5, color: '#334155', fontSize: 13, dash: '5 4' } }, zIndex: 0, selected: true };
    const ids = new Set(sel.map((n) => n.id));
    setNodes((ns) => sortNodes([g, ...ns.map((n) => (ids.has(n.id) ? { ...n, selected: false, parentId: gid, position: { x: absolutePosition(n, byId).x - minX, y: absolutePosition(n, byId).y - minY } } : { ...n, selected: false }))]));
    setTimeout(emitState, 0);
  }, [pushHistory, emitState]);

  const ungroup = useCallback(() => {
    const groups = selectedNodes().filter((n) => n.type === 'group');
    if (!groups.length) return;
    pushHistory();
    const gids = new Set(groups.map((g) => g.id));
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    setNodes((ns) => ns.filter((n) => !gids.has(n.id)).map((n) => {
      if (!gids.has(n.parentId)) return n;
      const g = byId.get(n.parentId);
      const { parentId, ...rest } = n;
      return { ...rest, ...(g.parentId && !gids.has(g.parentId) ? { parentId: g.parentId } : {}), position: { x: n.position.x + g.position.x, y: n.position.y + g.position.y }, selected: true };
    }));
    setEdges((es) => es.filter((e) => !gids.has(e.source) && !gids.has(e.target)));
    setTimeout(emitState, 0);
  }, [pushHistory, emitState]);

  const selectAll = useCallback(() => { setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); setEdges((es) => es.map((e) => ({ ...e, selected: true }))); setTimeout(emitState, 0); }, [emitState]);

  const nudge = useCallback((dx, dy) => {
    const sel = selectedNodes();
    if (!sel.length) return;
    const now = Date.now();
    if (now - lastNudge.current > 700) pushHistory();
    lastNudge.current = now;
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
  }, [pushHistory]);

  const autoLayout = useCallback(async () => {
    pushHistory();
    const model = flowToDiagram(diagram, nodesRef.current, edgesRef.current);
    const laid = await layoutDiagram({ ...model, layout: { ...model.layout, direction: diagram.layout?.direction ?? 'TB' } });
    const flow = diagramToFlow(laid);
    setNodes(flow.nodes); setEdges(flow.edges);
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 200 }), 50);
  }, [diagram, pushHistory, rf]);

  /* ---------- generic updaters for the inspector ---------- */
  const updateNodes = useCallback((ids, fn) => { const s = new Set(ids); setNodes((ns) => ns.map((n) => (s.has(n.id) ? fn(n) : n))); onDirty?.(); }, [onDirty]);
  const updateEdges = useCallback((ids, fn) => { const s = new Set(ids); setEdges((es) => es.map((e) => (s.has(e.id) ? fn(e) : e))); onDirty?.(); }, [onDirty]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('dw:save')); return; }
      if (typing) return;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
      else if (mod && k === 'c') { if (copy()) e.preventDefault(); }
      else if (mod && k === 'x') { if (copy()) { e.preventDefault(); remove(); } }
      else if (mod && k === 'v') { e.preventDefault(); paste(); }
      else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
      else if (mod && k === 'a') { e.preventDefault(); selectAll(); }
      else if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); }
      else if (e.key === 'Enter' || e.key === 'F2') { if (labelRef.current) { e.preventDefault(); labelRef.current.focus(); labelRef.current.select?.(); } }
      else if (e.key.startsWith('Arrow') && selectedNodes().length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [undo, redo, copy, paste, remove, duplicate, selectAll, group, ungroup, nudge]);

  /* ---------- imperative API for the toolbar ---------- */
  useImperativeHandle(ref, () => ({
    getDiagram: () => ({ ...flowToDiagram(diagram, nodesRef.current, edgesRef.current), name, canvas: { ...diagram.canvas, zoom: rf.getZoom() } }),
    undo, redo, copy, paste: () => paste(), cut: () => { if (copy()) remove(); }, remove, duplicate, align, group, ungroup, selectAll, autoLayout,
    zoomIn: () => rf.zoomIn({ duration: 120 }), zoomOut: () => rf.zoomOut({ duration: 120 }), fit: () => rf.fitView({ padding: 0.12, duration: 200 }),
    addShape: (item) => addItem(item),
    reset: (d) => { const f = diagramToFlow(d); past.current = []; future.current = []; setNodes(f.nodes); setEdges(f.edges); setTimeout(() => rf.fitView({ padding: 0.12 }), 50); emitState(); },
    focus: () => wrapRef.current?.focus(),
  }), [diagram, name, rf, undo, redo, copy, paste, remove, duplicate, align, group, ungroup, selectAll, autoLayout, addItem, emitState]);

  useEffect(() => { setName(diagram.name); }, [diagram.name]);
  useEffect(() => { const t1 = setTimeout(() => { rf.fitView({ padding: 0.12 }); emitState(); }, 60); const t2 = setTimeout(() => rf.fitView({ padding: 0.12 }), 450); return () => { clearTimeout(t1); clearTimeout(t2); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dw-graph-layout">
      <ShapePanel onAdd={(it) => addItem(it)} />
      <div className="dw-center">
      <div className="dw-canvas" ref={wrapRef} tabIndex={0} onDragOver={onDragOver} onDrop={onDrop} aria-label="Diagram canvas">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={onReconnect}
          onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}
          onMoveEnd={(_, vp) => { setZoom(vp.zoom); emitState(); }}
          connectionMode={ConnectionMode.Loose} edgesReconnectable
          snapToGrid={snap} snapGrid={[diagram.canvas?.gridSize ?? 10, diagram.canvas?.gridSize ?? 10]}
          selectionOnDrag panOnDrag={[1, 2]} panActivationKeyCode="Space" selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={['Shift', 'Control', 'Meta']} deleteKeyCode={['Delete', 'Backspace']}
          minZoom={0.05} maxZoom={4} nodeDragThreshold={2}
          onPaneClick={() => wrapRef.current?.focus()}
          fitView fitViewOptions={{ padding: 0.12 }}
          defaultEdgeOptions={{ type: 'styled' }}
          style={{ background: '#fbfbfc' }}
        >
          {showGrid && <Background variant={BackgroundVariant.Dots} gap={diagram.canvas?.gridSize ?? 10} size={1} color="#c9ced6" />}
          <MiniMap pannable zoomable ariaLabel="Diagram overview" nodeColor={(n) => (n.type === 'group' ? '#e2e8f0' : n.data?.style?.fill && n.data.style.fill !== 'transparent' ? n.data.style.fill : '#cbd5e1')} maskColor="rgba(148,163,184,0.18)" style={{ width: 150, height: 100 }} />
        </ReactFlow>
        <div className="dw-zoom-badge" aria-live="polite">{Math.round(zoom * 100)}%</div>
      </div>
      {referencePanel}
      </div>
      <Inspector
        diagram={{ ...diagram, name }} nodes={nodes} edges={edges}
        onNodes={updateNodes} onEdges={updateEdges}
        onDiagramName={(v) => { setName(v); onNameChange?.(v); onDirty?.(); }}
        labelRef={labelRef} onBeginEdit={() => { if (!past.current.length || Date.now() - lastNudge.current > 700) { lastNudge.current = Date.now(); pushHistory(); } }}
      />
    </div>
  );
});

const GraphEditor = forwardRef(function GraphEditor(props, ref) {
  return <ReactFlowProvider><GraphCanvas ref={ref} {...props} /></ReactFlowProvider>;
});
export default GraphEditor;

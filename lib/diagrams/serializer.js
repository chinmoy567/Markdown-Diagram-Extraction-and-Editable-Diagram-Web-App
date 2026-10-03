// Model <-> React Flow state. The model is the source of truth for save/export;
// React Flow state is the live editing representation.

export function diagramToFlow(d) {
  const byId = new Map(d.groups.map((g) => [g.id, g]));
  const depth = (g) => { let n = 0, c = g; while (c?.parentId && byId.has(c.parentId)) { n++; c = byId.get(c.parentId); } return n; };
  const groups = [...d.groups].sort((a, b) => depth(a) - depth(b));
  const gset = new Set(d.groups.map((g) => g.id));

  const nodes = [
    ...groups.map((g) => ({
      id: g.id, type: 'group', position: { x: g.x, y: g.y }, width: g.width, height: g.height,
      ...(g.parentId && gset.has(g.parentId) ? { parentId: g.parentId } : {}),
      data: { label: g.label, style: g.style },
      zIndex: depth(g),
    })),
    ...d.nodes.map((n) => ({
      id: n.id, type: n.shape === 'class' ? 'class' : 'shape', position: { x: n.x, y: n.y }, width: n.width, height: n.height,
      ...(n.parentId && gset.has(n.parentId) ? { parentId: n.parentId } : {}),
      data: {
        label: n.label, shape: n.shape, style: n.style, members: n.members, bar: n.bar,
        stereotype: n.stereotype, attributes: n.attributes, methods: n.methods,
      },
      zIndex: 20,
    })),
  ];
  const edges = d.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, type: 'styled',
    sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
    data: { label: e.label ?? '', style: e.style, meta: e.meta },
    zIndex: 10,
  }));
  return { nodes, edges };
}

export function flowToDiagram(base, nodes, edges) {
  const groups = [], plain = [];
  for (const n of nodes) {
    const w = Math.round(n.width ?? n.measured?.width ?? 140), h = Math.round(n.height ?? n.measured?.height ?? 56);
    const common = { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), width: w, height: h, ...(n.parentId ? { parentId: n.parentId } : {}) };
    if (n.type === 'group') groups.push({ ...common, label: n.data.label ?? '', style: n.data.style ?? {} });
    else {
      const o = { ...common, shape: n.data.shape ?? 'rectangle', label: n.data.label ?? '', style: n.data.style ?? {} };
      if (n.data.members) o.members = n.data.members;
      if (n.data.bar) o.bar = true;
      if (n.data.shape === 'class') { o.stereotype = n.data.stereotype; o.attributes = n.data.attributes ?? []; o.methods = n.data.methods ?? []; }
      plain.push(o);
    }
  }
  const e2 = edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}), ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    label: e.data?.label ?? '', style: e.data?.style ?? {}, ...(e.data?.meta ? { meta: e.data.meta } : {}),
  }));
  return { ...base, nodes: plain, edges: e2, groups, layout: { ...base.layout, done: true } };
}

/** Absolute position of a flow node (walks parents). */
export function absolutePosition(node, byId) {
  let x = node.position.x, y = node.position.y;
  let p = node.parentId ? byId.get(node.parentId) : null;
  while (p) { x += p.position.x; y += p.position.y; p = p.parentId ? byId.get(p.parentId) : null; }
  return { x, y };
}

export function sizeOf(node) {
  return { width: node.width ?? node.measured?.width ?? 140, height: node.height ?? node.measured?.height ?? 56 };
}

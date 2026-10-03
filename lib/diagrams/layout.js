// Auto-layout (ELK, layered, hierarchical). Operates on the diagram model and returns a NEW diagram.
// Groups become ELK compound nodes so subgraphs keep their members and can contain edges to/from
// other groups. Positions of children are relative to their parent group (same as the model).
import ELK from 'elkjs/lib/elk.bundled.js';
import { groupHeaderHeight, measureLines } from './measure.js';
import { absoluteMap, bestHandles } from './geometry.js';

const DIR = { TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };
let elk;

export async function layoutDiagram(diagram, direction) {
  elk ??= new ELK();
  const dir = DIR[direction ?? diagram.layout?.direction ?? 'TB'] ?? 'DOWN';
  const groupIds = new Set(diagram.groups.map((g) => g.id));
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));

  const childrenOf = new Map();
  const push = (pid, item) => { const k = pid && groupIds.has(pid) ? pid : '__root'; (childrenOf.get(k) ?? childrenOf.set(k, []).get(k)).push(item); };
  diagram.groups.forEach((g) => push(g.parentId, { kind: 'group', item: g }));
  diagram.nodes.forEach((n) => push(n.parentId, { kind: 'node', item: n }));

  const build = (key) => (childrenOf.get(key) ?? []).map(({ kind, item }) => {
    if (kind === 'node') return { id: item.id, width: item.width, height: item.height };
    const fs = item.style?.fontSize ?? 13;
    const header = groupHeaderHeight(fs);
    const titleW = measureLines(item.label || '', fs, 'bold').width + 28;
    return {
      id: item.id,
      children: build(item.id),
      layoutOptions: {
        'elk.padding': `[top=${header + 10},left=18,bottom=18,right=18]`,
        'elk.nodeLabels.placement': 'H_LEFT V_TOP INSIDE',
        'elk.direction': dir,
        'elk.minSize': `(${Math.ceil(titleW)}, ${header + 20})`,
      },
    };
  });

  const edges = [];
  diagram.edges.forEach((e) => {
    if (e.source === e.target) return;
    if (!(nodeIds.has(e.source) || groupIds.has(e.source)) || !(nodeIds.has(e.target) || groupIds.has(e.target))) return;
    const fs = 11;
    const label = e.label ? { id: `${e.id}__l`, text: e.label, ...(() => { const m = measureLines(e.label, fs); return { width: m.width + 8, height: m.height + 4 }; })() } : null;
    edges.push({ id: e.id, sources: [e.source], targets: [e.target], ...(label ? { labels: [label] } : {}) });
  });

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': dir,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '14',
      'elk.spacing.componentComponent': '48',
      'elk.separateConnectedComponents': 'true',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      'elk.padding': '[top=30,left=30,bottom=30,right=30]',
    },
    children: build('__root'),
    edges,
  };

  const out = await elk.layout(graph);

  const pos = new Map();
  (function walk(n) { for (const c of n.children ?? []) { pos.set(c.id, c); walk(c); } })(out);

  const round = (v) => Math.round(v);
  const groups = diagram.groups.map((g) => {
    const p = pos.get(g.id);
    return p ? { ...g, x: round(p.x), y: round(p.y), width: Math.max(round(p.width), 120), height: Math.max(round(p.height), 80) } : g;
  });
  let nodes = diagram.nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, x: round(p.x), y: round(p.y) } : n;
  });
  const abs = absoluteMap(groups, nodes);
  const edgesOut = diagram.edges.map((e) => {
    const a = abs.get(e.source), b = abs.get(e.target);
    if (!a || !b) return e;
    const [sh, th] = bestHandles(a, b, e.source === e.target);
    return { ...e, sourceHandle: sh, targetHandle: th };
  });

  const bounds = [...abs.values()].reduce((acc, r) => ({
    w: Math.max(acc.w, r.x + r.width), h: Math.max(acc.h, r.y + r.height),
  }), { w: 0, h: 0 });

  return {
    ...diagram, groups, nodes, edges: edgesOut,
    canvas: { ...diagram.canvas, width: Math.max(1200, Math.ceil(bounds.w + 80)), height: Math.max(800, Math.ceil(bounds.h + 80)) },
    layout: { ...diagram.layout, done: true, direction: diagram.layout?.direction ?? 'TB' },
  };
}

export { absoluteMap, bestHandles };

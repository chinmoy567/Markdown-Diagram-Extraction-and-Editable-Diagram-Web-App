import { sizeForNode } from '@/lib/diagrams/measure';
import { DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE, uid } from '@/lib/diagrams/model';

/** Apply a new label and grow the node if the text no longer fits (never shrinks). */
export function withLabel(node, value) {
  const data = { ...node.data, label: value };
  const sz = sizeForNode({ shape: node.data.shape, label: value, style: node.data.style, members: node.data.members });
  const w = Math.max(node.width ?? 0, Math.round(sz.width));
  const h = Math.max(node.height ?? 0, Math.round(sz.height));
  return { ...node, data, width: w, height: h };
}

let hexCtx;
export function toHex(c, fallback = '#000000') {
  if (typeof c !== 'string') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  try {
    hexCtx ??= document.createElement('canvas').getContext('2d');
    hexCtx.fillStyle = '#000000';
    hexCtx.fillStyle = c;
    const v = hexCtx.fillStyle;
    return /^#/.test(v) ? v : fallback;
  } catch { return fallback; }
}

export const SHAPE_PALETTE = [
  { key: 'rectangle', label: 'Rectangle' }, { key: 'rounded', label: 'Rounded rectangle' },
  { key: 'circle', label: 'Circle' }, { key: 'ellipse', label: 'Ellipse' },
  { key: 'diamond', label: 'Diamond' }, { key: 'triangle', label: 'Triangle' },
  { key: 'cylinder', label: 'Cylinder' }, { key: 'database', label: 'Database', shape: 'cylinder', text: 'Database' },
  { key: 'server', label: 'Server' }, { key: 'computer', label: 'Computer' },
  { key: 'laptop', label: 'Laptop' }, { key: 'mobile', label: 'Mobile' },
  { key: 'user', label: 'User' }, { key: 'cloud', label: 'Cloud' },
  { key: 'folder', label: 'Folder' }, { key: 'document', label: 'Document' },
  { key: 'component', label: 'Component' }, { key: 'container', label: 'Container' },
  { key: 'text', label: 'Text' }, { key: 'arrow', label: 'Arrow' }, { key: 'connector', label: 'Connector' },
  { key: 'hexagon', label: 'Hexagon' }, { key: 'stadium', label: 'Stadium' }, { key: 'note', label: 'Note' },
];

const DEFAULT_SIZE = {
  rectangle: [140, 56], rounded: [140, 56], stadium: [150, 48], circle: [80, 80], ellipse: [140, 80], diamond: [130, 90],
  triangle: [100, 90], cylinder: [110, 80], server: [90, 90], computer: [90, 90], laptop: [100, 80], mobile: [70, 90],
  user: [70, 90], cloud: [140, 90], folder: [120, 80], document: [120, 80], component: [150, 70], text: [120, 30],
  hexagon: [140, 70], note: [140, 70], point: [10, 10],
};

/** Build the flow node(s)/edge(s) for a palette item dropped at (x, y) (flow coordinates). */
export function buildPaletteItem(item, x, y) {
  if (item.key === 'container') {
    const id = uid('g');
    return { nodes: [{ id, type: 'group', position: { x, y }, width: 320, height: 200, data: { label: 'Container', style: { fill: '#f8fafc', stroke: '#94a3b8', strokeWidth: 1.5, color: '#334155', fontSize: 13, dash: '5 4' } }, zIndex: 0 }], edges: [] };
  }
  if (item.key === 'arrow' || item.key === 'connector') {
    const a = uid('n'), b = uid('n');
    const pt = (id, px) => ({ id, type: 'shape', position: { x: px, y }, width: 10, height: 10, data: { label: '', shape: 'point', style: { ...DEFAULT_NODE_STYLE, fill: '#334155' } }, zIndex: 20 });
    return {
      nodes: [pt(a, x), pt(b, x + 140)],
      edges: [{ id: uid('e'), source: a, target: b, type: 'styled', sourceHandle: 'right', targetHandle: 'left', data: { label: '', style: { ...DEFAULT_EDGE_STYLE, arrowEnd: item.key === 'arrow' ? 'arrow' : 'none', routing: 'straight' } }, zIndex: 10 }],
    };
  }
  const shape = item.shape ?? item.key;
  const [w, h] = DEFAULT_SIZE[shape] ?? [140, 56];
  const label = item.text ?? (shape === 'text' ? 'Text' : item.label);
  const style = { ...DEFAULT_NODE_STYLE, ...(shape === 'text' ? { fill: 'transparent', stroke: 'transparent' } : {}) };
  return { nodes: [{ id: uid('n'), type: 'shape', position: { x, y }, width: w, height: h, data: { label, shape, style }, zIndex: 20 }], edges: [] };
}

/** Parents must come before children in the array. */
export function sortNodes(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = [], seen = new Set();
  const visit = (n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    if (n.parentId && byId.has(n.parentId)) visit(byId.get(n.parentId));
    out.push(n);
  };
  nodes.forEach(visit);
  return out;
}

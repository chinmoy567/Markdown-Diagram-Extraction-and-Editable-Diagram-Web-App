// Core diagram schema. Pure JS, no DOM: runs in the browser, a worker, and node tests.
//
// Diagram {
//   id, name,
//   kind: 'graph' | 'sequence' | 'reference',     // which editor handles it
//   source: { format: 'mermaid'|'ascii', type, content },  // ORIGINAL, never modified
//   sourceFile, sourceFormat, sourceCode, diagramType,      // flat copies for convenience
//   status: 'converted' | 'partial' | 'reference' | 'failed',
//   confidence: 'high' | 'medium' | 'low',
//   warnings: string[],
//   canvas: { width, height, zoom, grid, snap },
//   nodes:  [{ id, shape, label, x, y, width, height, parentId?, style, members? }],
//   edges:  [{ id, source, target, label, style }],
//   groups: [{ id, label, x, y, width, height, parentId?, style }],
//   sequence?: { participants, items },
//   layout: { done: boolean },       // false => positions are placeholders; auto-layout on first open
//   metadata: { sourceFile, sourceHeading, sourceLine, sourceHash, ... }
// }
//
// Coordinates of nodes/groups with a parentId are RELATIVE to that group's top-left.

export const SHAPES = [
  'rectangle', 'rounded', 'stadium', 'circle', 'doublecircle', 'ellipse', 'diamond', 'hexagon',
  'triangle', 'cylinder', 'subroutine', 'parallelogram', 'trapezoid', 'document', 'folder',
  'cloud', 'user', 'server', 'computer', 'laptop', 'mobile', 'component', 'note', 'text',
  'start', 'end', 'class', 'point',
];

export const DEFAULT_NODE_STYLE = {
  fill: '#ffffff', stroke: '#334155', strokeWidth: 1.5, color: '#0f172a', fontSize: 13, dash: '',
};
export const DEFAULT_GROUP_STYLE = {
  fill: '#f8fafc', stroke: '#94a3b8', strokeWidth: 1.5, color: '#334155', fontSize: 13, dash: '5 4',
};
export const DEFAULT_EDGE_STYLE = {
  lineType: 'solid',        // solid | dashed | dotted | thick | invisible
  arrowStart: 'none',       // none | arrow | open | cross | circle | diamond | triangle | diamond-filled
  arrowEnd: 'arrow',
  routing: 'smoothstep',    // straight | bezier | smoothstep
  width: 1.5, color: '#334155',
};

let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function emptyCanvas() {
  return { width: 1600, height: 1000, zoom: 1, grid: true, snap: true, gridSize: 10 };
}

export function createDiagram(partial = {}) {
  const format = partial.source?.format ?? partial.sourceFormat ?? 'mermaid';
  const content = partial.source?.content ?? partial.sourceCode ?? '';
  const type = partial.source?.type ?? partial.diagramType ?? 'unknown';
  const sourceFile = partial.sourceFile ?? partial.metadata?.sourceFile ?? '';
  return {
    id: partial.id ?? uid('diagram'),
    name: partial.name ?? 'Untitled diagram',
    kind: partial.kind ?? 'graph',
    source: { format, type, content },
    sourceFile, sourceFormat: format, sourceCode: content, diagramType: type,
    status: partial.status ?? 'converted',
    confidence: partial.confidence ?? 'high',
    warnings: partial.warnings ?? [],
    canvas: { ...emptyCanvas(), ...(partial.canvas ?? {}) },
    nodes: partial.nodes ?? [],
    edges: partial.edges ?? [],
    groups: partial.groups ?? [],
    sequence: partial.sequence,
    layout: partial.layout ?? { done: false },
    metadata: { sourceFile, ...(partial.metadata ?? {}) },
  };
}

export function createNode(partial = {}) {
  return {
    id: partial.id ?? uid('n'),
    shape: partial.shape ?? 'rectangle',
    label: partial.label ?? '',
    x: partial.x ?? 0, y: partial.y ?? 0,
    width: partial.width ?? 140, height: partial.height ?? 56,
    parentId: partial.parentId,
    style: { ...DEFAULT_NODE_STYLE, ...(partial.style ?? {}) },
    members: partial.members,
    meta: partial.meta,
  };
}

export function createEdge(partial = {}) {
  return {
    id: partial.id ?? uid('e'),
    source: partial.source, target: partial.target,
    sourceHandle: partial.sourceHandle, targetHandle: partial.targetHandle,
    label: partial.label ?? '',
    style: { ...DEFAULT_EDGE_STYLE, ...(partial.style ?? {}) },
    meta: partial.meta,
  };
}

export function createGroup(partial = {}) {
  return {
    id: partial.id ?? uid('g'),
    label: partial.label ?? '',
    x: partial.x ?? 0, y: partial.y ?? 0,
    width: partial.width ?? 300, height: partial.height ?? 200,
    parentId: partial.parentId,
    style: { ...DEFAULT_GROUP_STYLE, ...(partial.style ?? {}) },
  };
}

export const TYPE_LABELS = {
  flowchart: 'Flowchart', graph: 'Flowchart', sequenceDiagram: 'Sequence', sequence: 'Sequence',
  stateDiagram: 'State', 'stateDiagram-v2': 'State', classDiagram: 'Class', erDiagram: 'ER',
  mindmap: 'Mindmap', timeline: 'Timeline', journey: 'Journey', gantt: 'Gantt', pie: 'Pie',
  gitGraph: 'Git graph', quadrantChart: 'Quadrant', requirementDiagram: 'Requirement',
  'ascii-boxes': 'ASCII boxes', 'ascii-tiers': 'ASCII tiers', 'ascii-sequence': 'ASCII sequence',
  'ascii-chain': 'ASCII arrow chain', 'ascii-tree': 'ASCII tree', 'ascii-unknown': 'ASCII (unclassified)',
};

export function typeLabel(t) { return TYPE_LABELS[t] ?? t ?? 'Unknown'; }

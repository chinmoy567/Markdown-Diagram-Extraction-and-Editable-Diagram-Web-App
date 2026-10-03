// Source -> editable model. Dispatches on format/type; NEVER throws to the caller:
// a failure is returned as { status: 'failed', error } so one bad diagram cannot take down an import.
import { parseFlowchart } from '../mermaid/flowchart.js';
import { parseState } from '../mermaid/state.js';
import { parseSequence } from '../mermaid/sequence.js';
import { parseClassDiagram } from '../mermaid/class.js';
import { parseEr, parseMindmap } from '../mermaid/other.js';
import { createNode, createEdge, createGroup, uid, DEFAULT_NODE_STYLE, DEFAULT_GROUP_STYLE } from './model.js';
import { sizeForNode } from './measure.js';
import { convertAscii } from '../ascii/converter.js';

const GRAPH_PARSERS = {
  flowchart: parseFlowchart, graph: parseFlowchart,
  stateDiagram: parseState, 'stateDiagram-v2': parseState,
  classDiagram: parseClassDiagram, erDiagram: parseEr, mindmap: parseMindmap,
};

const LINE_MAP = { solid: 'solid', dotted: 'dashed', dashed: 'dashed', thick: 'thick', invisible: 'invisible' };

export function irToGraph(ir) {
  const idMap = new Map();
  const groups = ir.groups.map((g) => createGroup({
    id: g.id, label: g.label, parentId: g.parentId,
    style: { ...pickStyle(g.style) },
  }));
  const nodes = ir.nodes.map((n) => {
    const base = createNode({
      id: n.id, shape: n.shape, label: n.label, parentId: n.parentId, members: n.members,
      style: { ...stateDefaults(n), ...pickStyle(n.style) },
    });
    if (n.shape === 'class') {
      base.label = n.label;
      base.stereotype = n.stereotype; base.attributes = n.attributes; base.methods = n.methods;
    }
    if (n.bar) base.bar = true;
    const sz = sizeForNode({ ...n, style: base.style });
    base.width = Math.round(sz.width); base.height = Math.round(sz.height);
    return base;
  });
  const edges = ir.edges.map((e) => createEdge({
    source: e.source, target: e.target, label: e.label ?? '',
    style: {
      lineType: LINE_MAP[e.lineType] ?? 'solid',
      arrowStart: e.arrowStart ?? 'none', arrowEnd: e.arrowEnd ?? 'arrow',
      ...(e.style?.stroke ? { color: e.style.stroke } : {}),
      ...(e.style?.strokeWidth ? { width: e.style.strokeWidth } : {}),
    },
    meta: { ...(e.startLabel ? { startLabel: e.startLabel } : {}), ...(e.endLabel ? { endLabel: e.endLabel } : {}), ...(e.isNoteLink ? { noteLink: true } : {}) },
  }));
  void idMap;
  return { nodes, edges, groups };
}

function stateDefaults(n) {
  if (n.shape === 'start') return { fill: '#0f172a', stroke: '#0f172a' };
  if (n.shape === 'end') return { fill: '#0f172a', stroke: '#0f172a' };
  if (n.shape === 'note') return { fill: '#fef9c3', stroke: '#ca8a04' };
  if (n.shape === 'rounded' && n.members) return {};
  return {};
}

function pickStyle(s = {}) {
  const out = {};
  for (const k of ['fill', 'stroke', 'strokeWidth', 'color', 'fontSize', 'dash', 'fontWeight']) if (s[k] != null && s[k] !== '') out[k] = s[k];
  return out;
}

function statusFrom(warnings) {
  return warnings.some((w) => /skipped|unsupported|not supported|not editable/.test(w)) ? 'partial' : 'converted';
}

export function convertMermaid(content, mermaidType) {
  const type = mermaidType ?? 'unknown';
  try {
    if (type === 'sequenceDiagram') {
      const seq = parseSequence(content);
      let n = 0;
      const withIds = (items) => items.map((it) => {
        const out = { id: uid('s'), ...it };
        if (it.type === 'block') out.branches = it.branches.map((b) => ({ ...b, items: withIds(b.items) }));
        n++;
        return out;
      });
      return {
        status: statusFrom(seq.warnings), kind: 'sequence', confidence: 'high', warnings: seq.warnings,
        sequence: { participants: seq.participants, items: withIds(seq.items), autonumber: seq.autonumber, title: seq.title },
        nodes: [], edges: [], groups: [], layout: { done: true }, stats: { items: n },
      };
    }
    const parser = GRAPH_PARSERS[type];
    if (!parser) {
      return {
        status: 'reference', kind: 'reference', confidence: 'low', nodes: [], edges: [], groups: [], layout: { done: true },
        warnings: [`Mermaid type "${type}" has no visual editor yet. The original source is preserved and can be rendered as a read-only reference.`],
      };
    }
    const ir = parser(content);
    const g = irToGraph(ir);
    if (!g.nodes.length && !g.groups.length) throw new Error('The diagram contains no nodes');
    return {
      status: statusFrom(ir.warnings), kind: 'graph', confidence: ir.warnings.length ? 'medium' : 'high', warnings: ir.warnings,
      ...g, layout: { done: false, direction: ir.direction ?? 'TB' },
      classDefs: ir.classDefs,
    };
  } catch (e) {
    return { status: 'failed', kind: 'reference', confidence: 'low', nodes: [], edges: [], groups: [], layout: { done: true }, warnings: [], error: e.message };
  }
}

export function convertSource(format, content, type) {
  if (format === 'mermaid') return convertMermaid(content, type);
  if (format === 'ascii') {
    try { return convertAscii(content, type); } catch (e) {
      return { status: 'failed', kind: 'reference', confidence: 'low', nodes: [], edges: [], groups: [], layout: { done: true }, warnings: [], error: e.message };
    }
  }
  return { status: 'failed', kind: 'reference', confidence: 'low', nodes: [], edges: [], groups: [], layout: { done: true }, warnings: [], error: `Unknown format "${format}"` };
}

export { DEFAULT_NODE_STYLE, DEFAULT_GROUP_STYLE };

// ASCII family dispatcher. Returns the same result shape as the Mermaid converter.
// Honest by construction: low-quality conversions are flagged, and nothing is returned
// when no structure could be recovered (the diagram then stays reference-only).
import { convertBoxes } from './boxes.js';
import { convertAsciiSequence } from './sequence.js';
import { convertTiers, convertChain, convertTree } from './flow.js';
import { bestHandles, absoluteMap } from '../diagrams/geometry.js';
import { createNode, createEdge, createGroup, uid } from '../diagrams/model.js';
import { sizeForNode } from '../diagrams/measure.js';

function refOnly(why) {
  return { status: 'reference', kind: 'reference', confidence: 'low', nodes: [], edges: [], groups: [], layout: { done: true }, warnings: [why] };
}

export function convertAscii(content, family) {
  const tryList = family === 'ascii-boxes' ? ['boxes']
    : family === 'ascii-sequence' ? ['sequence']
    : family === 'ascii-tiers' ? ['tiers']
    : family === 'ascii-chain' ? ['chain']
    : family === 'ascii-tree' ? ['tree']
    : ['boxes', 'sequence', 'tiers', 'chain', 'tree'];
  const errors = [];
  for (const kind of tryList) {
    try {
      if (kind === 'sequence') {
        const r = convertAsciiSequence(content);
        if (!r.sequence.items.length) throw new Error('no messages');
        const msgs = r.sequence.items.filter((i) => i.type === 'message').length;
        return { status: r.warnings.length ? 'partial' : 'converted', kind: 'sequence', confidence: msgs >= 3 ? 'medium' : 'low', warnings: r.warnings, sequence: r.sequence, nodes: [], edges: [], groups: [], layout: { done: true } };
      }
      if (kind === 'boxes') {
        const r = convertBoxes(content);
        return finish(r, { grid: true, direction: 'TB', quality: r.edges.length || r.boxCount === 1 ? 'medium' : 'low' });
      }
      const r = kind === 'tiers' ? convertTiers(content) : kind === 'chain' ? convertChain(content) : convertTree(content);
      return finish(r, { grid: false, direction: r.direction, quality: r.quality });
    } catch (e) { errors.push(`${kind}: ${e.message}`); }
  }
  return refOnly(`Automatic conversion was not possible (${errors.join('; ')}). The original text is preserved as a reference; rebuild the diagram manually next to it.`);
}

function finish(r, { grid, direction, quality }) {
  const groups = r.groups.map((g) => createGroup({ ...g, style: { ...(g.style ?? {}), fontSize: 12 } }));
  const nodes = r.nodes.map((n) => {
    const node = createNode({ ...n });
    if (!grid || n.shape === 'text') {
      const sz = sizeForNode({ ...node, style: { ...node.style, fontSize: node.style.fontSize ?? 13 } });
      node.width = Math.round(sz.width); node.height = Math.round(sz.height);
    }
    return node;
  });
  let edges = r.edges.map((e) => createEdge({ ...e, id: uid('e') , source: e.source, target: e.target }));
  // edges referenced ids from the converter; remap because createEdge got fresh ids (ids of nodes unchanged)
  if (grid) {
    const abs = absoluteMap(groups, nodes);
    edges = edges.map((e) => {
      const a = abs.get(e.source), b = abs.get(e.target);
      if (!a || !b) return e;
      const [sh, th] = bestHandles(a, b, e.source === e.target);
      return { ...e, sourceHandle: sh, targetHandle: th };
    });
  }
  const confidence = quality === 'low' ? 'low' : 'medium';
  const warnings = [...r.warnings];
  if (confidence !== 'high') warnings.unshift(`Automatic ASCII conversion, ${confidence} confidence. The original text stays available as a reference — verify the result before relying on it.`);
  return {
    status: quality === 'low' || r.warnings.length ? 'partial' : 'converted', kind: 'graph', confidence, warnings,
    nodes, edges, groups, layout: { done: grid, direction },
  };
}

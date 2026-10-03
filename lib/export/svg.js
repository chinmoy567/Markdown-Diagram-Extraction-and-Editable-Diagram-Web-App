// SVG export built DIRECTLY from the editable model (not from a DOM screenshot).
import { absoluteMap } from '../diagrams/geometry.js';
import { shapeMarkup, labelMarkup, classMarkup, groupMarkup, esc } from '../render/shapes.js';
import { edgeMarkup } from '../render/edges.js';
import { sequenceMarkup } from '../render/sequence.js';
import { FONT_FAMILY, MONO_FAMILY } from '../diagrams/measure.js';

const PAD = 28;

export function nodeMarkup(n) {
  if (n.shape === 'class') return classMarkup(n);
  return shapeMarkup(n.shape, n.width, n.height, n.style) + labelMarkup(n.shape, n.width, n.height, n.label, n.style, n.members);
}

export function diagramToSvg(diagram, { background = '#ffffff', transparent = false } = {}) {
  if (diagram.kind === 'sequence' && diagram.sequence) {
    const s = sequenceMarkup(diagram.sequence);
    return wrap(s.width, s.height, `<title>${esc(diagram.name)}</title>${s.markup}`, diagram, 0, 0);
  }
  if (diagram.kind === 'reference' || (!diagram.nodes.length && !diagram.groups.length)) return referenceSvg(diagram);

  const abs = absoluteMap(diagram.groups, diagram.nodes);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of abs.values()) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
  }
  // Edge labels may sit outside node bounds; leave generous padding.
  const ox = PAD - minX, oy = PAD - minY;
  const width = Math.ceil(maxX - minX + PAD * 2), height = Math.ceil(maxY - minY + PAD * 2);

  let defs = '';
  let edgeBody = '';
  for (const e of diagram.edges) {
    const m = edgeMarkup(e, abs, { idPrefix: '' });
    defs += m.defs; edgeBody += m.body;
  }
  const depth = (g) => { let d = 0, cur = g; const byId = new Map(diagram.groups.map((x) => [x.id, x])); while (cur?.parentId && byId.has(cur.parentId)) { d++; cur = byId.get(cur.parentId); } return d; };
  const groups = [...diagram.groups].sort((a, b) => depth(a) - depth(b));
  let body = '';
  for (const g of groups) {
    const r = abs.get(g.id);
    body += `<g transform="translate(${r.x} ${r.y})" data-group-id="${esc(g.id)}">${groupMarkup({ ...g, width: r.width, height: r.height })}</g>`;
  }
  body += `<g class="edges">${edgeBody}</g>`;
  for (const n of diagram.nodes) {
    const r = abs.get(n.id);
    body += `<g transform="translate(${r.x} ${r.y})" data-node-id="${esc(n.id)}">${nodeMarkup(n)}</g>`;
  }
  const bg = transparent ? '' : `<rect x="${-ox}" y="${-oy}" width="${width}" height="${height}" fill="${esc(background)}"/>`;
  return wrap(width, height, `<title>${esc(diagram.name)}</title><defs>${defs}</defs>${bg}${body}`, diagram, ox, oy);
}

function wrap(width, height, inner, diagram, ox, oy) {
  return {
    width, height,
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-diagram-id="${esc(diagram.id)}">` +
      `<g transform="translate(${ox} ${oy})">${inner}</g></svg>`,
  };
}

/** Unconverted diagrams export their original text, clearly labelled. Never a fake drawing. */
function referenceSvg(diagram) {
  const lines = diagram.source.content.split('\n');
  const lh = 15, cw = 7.4;
  const w = Math.ceil(Math.max(360, ...lines.map((l) => l.length * cw)) + 48);
  const h = lines.length * lh + 70;
  const inner = `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
    `<text x="20" y="26" font-family='${FONT_FAMILY}' font-size="13" font-weight="bold" fill="#92400e">${esc(diagram.name)} — original source (not converted to an editable diagram)</text>` +
    lines.map((l, i) => `<text x="20" y="${54 + i * lh}" xml:space="preserve" font-family='${MONO_FAMILY}' font-size="12.5" fill="#0f172a">${esc(l)}</text>`).join('');
  return wrap(w, h, `<title>${esc(diagram.name)}</title>${inner}`, diagram, 0, 0);
}

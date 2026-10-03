// Edge geometry + marker markup shared by the live editor and the exporters.
import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/system';
import { DEFAULT_EDGE_STYLE } from '../diagrams/model.js';
import { esc, color } from './shapes.js';
import { FONT_FAMILY, measureLines } from '../diagrams/measure.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];

export function sidePoint(rect, side) {
  switch (side) {
    case 'top': return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom': return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case 'left': return { x: rect.x, y: rect.y + rect.height / 2 };
    default: return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

export function resolveEdgeStyle(style = {}) {
  return {
    ...DEFAULT_EDGE_STYLE, ...style,
    color: color(style.color, DEFAULT_EDGE_STYLE.color),
    width: Number.isFinite(+style.width) ? +style.width : DEFAULT_EDGE_STYLE.width,
  };
}

/** Compute the SVG path for given endpoints + sides. */
export function edgeGeometry({ sx, sy, tx, ty, sourceSide = 'bottom', targetSide = 'top', routing = 'smoothstep' }) {
  const base = { sourceX: sx, sourceY: sy, sourcePosition: sourceSide, targetX: tx, targetY: ty, targetPosition: targetSide };
  if (routing === 'straight') { const [d, lx, ly] = getStraightPath(base); return { d, lx, ly }; }
  if (routing === 'bezier') { const [d, lx, ly] = getBezierPath(base); return { d, lx, ly }; }
  const [d, lx, ly] = getSmoothStepPath({ ...base, borderRadius: 8, offset: 22 });
  return { d, lx, ly };
}

export function dashFor(lineType, width) {
  if (lineType === 'dashed') return `${width * 4} ${width * 3}`;
  if (lineType === 'dotted') return `${width} ${width * 2.5}`;
  return '';
}

/** <marker> definition for an arrow kind; refX positions the tip at the line end. */
export function markerDef(id, kind, colorValue, width = 1.5) {
  const c = esc(colorValue);
  const sz = 10 + width * 2;
  const body = (() => {
    switch (kind) {
      case 'arrow': return { w: 10, h: 8, rx: 9.5, d: `<path d="M0,0 L10,4 L0,8 Z" fill="${c}" stroke="${c}" stroke-linejoin="round"/>` };
      case 'open': return { w: 10, h: 8, rx: 9.5, d: `<path d="M0.5,0.5 L9,4 L0.5,7.5" fill="none" stroke="${c}" stroke-width="1.4"/>` };
      case 'cross': return { w: 10, h: 10, rx: 5, d: `<path d="M1,1 L9,9 M9,1 L1,9" stroke="${c}" stroke-width="1.6" fill="none"/>` };
      case 'circle': return { w: 10, h: 10, rx: 9, d: `<circle cx="5" cy="5" r="4" fill="#fff" stroke="${c}" stroke-width="1.4"/>` };
      case 'triangle': return { w: 13, h: 10, rx: 12.5, d: `<path d="M0.5,0.5 L12.5,5 L0.5,9.5 Z" fill="#fff" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>` };
      case 'diamond': return { w: 16, h: 10, rx: 15.5, d: `<path d="M0.5,5 L8,0.5 L15.5,5 L8,9.5 Z" fill="#fff" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>` };
      case 'diamond-filled': return { w: 16, h: 10, rx: 15.5, d: `<path d="M0.5,5 L8,0.5 L15.5,5 L8,9.5 Z" fill="${c}" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>` };
      default: return null;
    }
  })();
  if (!body) return '';
  void sz;
  return `<marker id="${esc(id)}" viewBox="0 0 ${body.w} ${body.h}" refX="${body.rx}" refY="${body.h / 2}" markerWidth="${body.w}" markerHeight="${body.h}" markerUnits="userSpaceOnUse" orient="auto-start-reverse">${body.d}</marker>`;
}

/** Complete markup for one edge (path + markers + labels). `abs` = id -> absolute rect. */
export function edgeMarkup(edge, abs, { idPrefix = '' } = {}) {
  const a = abs.get(edge.source), b = abs.get(edge.target);
  if (!a || !b) return { defs: '', body: '' };
  const st = resolveEdgeStyle(edge.style);
  if (st.lineType === 'invisible') return { defs: '', body: '' };
  const sSide = edge.sourceHandle ?? 'bottom', tSide = edge.targetHandle ?? 'top';
  const sp = sidePoint(a, sSide), tp = sidePoint(b, tSide);
  const g = edgeGeometry({ sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourceSide: sSide, targetSide: tSide, routing: st.routing });
  const width = st.lineType === 'thick' ? Math.max(st.width * 2, 3) : st.width;
  const mid = `${idPrefix}mk-${edge.id}`;
  const defs = (st.arrowStart !== 'none' ? markerDef(`${mid}-s`, st.arrowStart, st.color, width) : '') +
    (st.arrowEnd !== 'none' ? markerDef(`${mid}-e`, st.arrowEnd, st.color, width) : '');
  const dash = dashFor(st.lineType, width);
  let body = `<path d="${g.d}" fill="none" stroke="${esc(st.color)}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}` +
    `${st.arrowStart !== 'none' ? ` marker-start="url(#${esc(mid)}-s)"` : ''}${st.arrowEnd !== 'none' ? ` marker-end="url(#${esc(mid)}-e)"` : ''}/>`;
  if (edge.label) body += labelPill(edge.label, g.lx, g.ly, 11);
  const meta = edge.meta ?? {};
  if (meta.startLabel) body += labelPill(meta.startLabel, sp.x + (sSide === 'left' ? -16 : sSide === 'right' ? 16 : 14), sp.y + (sSide === 'top' ? -12 : sSide === 'bottom' ? 12 : -10), 10, true);
  if (meta.endLabel) body += labelPill(meta.endLabel, tp.x + (tSide === 'left' ? -16 : tSide === 'right' ? 16 : 14), tp.y + (tSide === 'top' ? -12 : tSide === 'bottom' ? 12 : -10), 10, true);
  return { defs, body };
}

export function labelPill(text, x, y, fontSize = 11, small = false) {
  const m = measureLines(text, fontSize);
  const w = m.width + (small ? 6 : 12), h = m.height + (small ? 2 : 6);
  let out = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="#ffffff" fill-opacity="0.92" stroke="none"/>`;
  m.lines.forEach((l, i) => {
    out += `<text x="${x}" y="${y - m.height / 2 + (i + 0.5) * fontSize * 1.35}" text-anchor="middle" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${fontSize}" fill="#1e293b">${esc(l)}</text>`;
  });
  return out;
}

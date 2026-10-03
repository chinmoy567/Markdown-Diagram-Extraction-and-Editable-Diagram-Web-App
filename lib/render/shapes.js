// Pure SVG-markup builders for node shapes. Used by the live editor (ShapeNode / ClassNode)
// and by the exporters, so what you edit is exactly what you export.
import { DEFAULT_NODE_STYLE } from '../diagrams/model.js';
import { LINE_HEIGHT, MONO_FAMILY, FONT_FAMILY } from '../diagrams/measure.js';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const COLOR_OK = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,25})$/i;
export function color(c, fallback) {
  return typeof c === 'string' && COLOR_OK.test(c.trim()) ? c.trim() : fallback;
}
function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function dashAttr(d) { return d && /^[\d.\s,]+$/.test(d) ? ` stroke-dasharray="${esc(d.replace(/,/g, ' '))}"` : ''; }

export function resolveStyle(style = {}) {
  return {
    fill: color(style.fill, DEFAULT_NODE_STYLE.fill),
    stroke: color(style.stroke, DEFAULT_NODE_STYLE.stroke),
    strokeWidth: num(style.strokeWidth, DEFAULT_NODE_STYLE.strokeWidth),
    color: color(style.color, DEFAULT_NODE_STYLE.color),
    fontSize: num(style.fontSize, DEFAULT_NODE_STYLE.fontSize),
    dash: style.dash ?? '',
    fontWeight: style.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
    textAlign: style.textAlign === 'left' || style.textAlign === 'right' ? style.textAlign : 'center',
  };
}

/** Rectangle inside which the label is centred, per shape. */
export function labelBox(shape, w, h) {
  switch (shape) {
    case 'diamond': return { x: w * 0.2, y: h * 0.2, w: w * 0.6, h: h * 0.6 };
    case 'triangle': return { x: w * 0.25, y: h * 0.4, w: w * 0.5, h: h * 0.55 };
    case 'circle': case 'doublecircle': case 'ellipse': return { x: w * 0.12, y: h * 0.12, w: w * 0.76, h: h * 0.76 };
    case 'cylinder': return { x: 4, y: h * 0.2, w: w - 8, h: h * 0.72 };
    case 'cloud': return { x: w * 0.12, y: h * 0.2, w: w * 0.76, h: h * 0.62 };
    case 'user': return { x: 0, y: h * 0.62, w, h: h * 0.38 };
    case 'server': case 'computer': case 'laptop': case 'mobile': return { x: 0, y: h * 0.68, w, h: h * 0.32 };
    case 'hexagon': case 'parallelogram': case 'trapezoid': return { x: w * 0.12, y: 0, w: w * 0.76, h };
    case 'document': return { x: 4, y: 0, w: w - 8, h: h * 0.85 };
    case 'folder': return { x: 4, y: 10, w: w - 8, h: h - 10 };
    case 'component': return { x: 14, y: 0, w: w - 20, h };
    default: return { x: 4, y: 0, w, h };
  }
}

/** Markup (no <svg> wrapper) drawing the outline of a shape inside a w x h box. */
export function shapeMarkup(shape, w, h, style) {
  const s = resolveStyle(style);
  const sw = s.strokeWidth;
  const i = sw / 2;
  const common = `fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${sw}"${dashAttr(s.dash)} stroke-linejoin="round"`;
  const X = w - i, Y = h - i;
  switch (shape) {
    case 'text': return '';
    case 'point': return `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 0.5}" fill="${esc(s.stroke)}" stroke="${esc(s.stroke)}"/>`;
    case 'rounded': return `<rect x="${i}" y="${i}" width="${w - sw}" height="${h - sw}" rx="10" ${common}/>`;
    case 'stadium': return `<rect x="${i}" y="${i}" width="${w - sw}" height="${h - sw}" rx="${(h - sw) / 2}" ${common}/>`;
    case 'circle': case 'ellipse': return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - i}" ry="${h / 2 - i}" ${common}/>`;
    case 'doublecircle': return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - i}" ry="${h / 2 - i}" ${common}/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - i - 5}" ry="${h / 2 - i - 5}" fill="none" stroke="${esc(s.stroke)}" stroke-width="${sw}"/>`;
    case 'diamond': return `<polygon points="${w / 2},${i} ${X},${h / 2} ${w / 2},${Y} ${i},${h / 2}" ${common}/>`;
    case 'hexagon': { const k = Math.min(w * 0.18, 28); return `<polygon points="${k},${i} ${w - k},${i} ${X},${h / 2} ${w - k},${Y} ${k},${Y} ${i},${h / 2}" ${common}/>`; }
    case 'triangle': return `<polygon points="${w / 2},${i} ${X},${Y} ${i},${Y}" ${common}/>`;
    case 'parallelogram': { const k = Math.min(w * 0.16, 24); return `<polygon points="${k},${i} ${X},${i} ${w - k},${Y} ${i},${Y}" ${common}/>`; }
    case 'trapezoid': { const k = Math.min(w * 0.16, 24); return `<polygon points="${k},${i} ${w - k},${i} ${X},${Y} ${i},${Y}" ${common}/>`; }
    case 'subroutine': return `<rect x="${i}" y="${i}" width="${w - sw}" height="${h - sw}" ${common}/><line x1="10" y1="${i}" x2="10" y2="${Y}" stroke="${esc(s.stroke)}" stroke-width="${sw}"/><line x1="${w - 10}" y1="${i}" x2="${w - 10}" y2="${Y}" stroke="${esc(s.stroke)}" stroke-width="${sw}"/>`;
    case 'cylinder': {
      const ry = Math.min(11, h * 0.14);
      return `<path d="M${i},${ry + i} A${w / 2 - i},${ry} 0 0 1 ${X},${ry + i} V${Y - ry} A${w / 2 - i},${ry} 0 0 1 ${i},${Y - ry} Z" ${common}/><path d="M${i},${ry + i} A${w / 2 - i},${ry} 0 0 0 ${X},${ry + i}" fill="none" stroke="${esc(s.stroke)}" stroke-width="${sw}"/>`;
    }
    case 'document': return `<path d="M${i},${i} H${X} V${Y - 10} C${w * 0.75},${Y - 22} ${w * 0.6},${Y + 2} ${w / 2},${Y - 10} S${w * 0.25},${Y - 2} ${i},${Y - 10} Z" ${common}/>`;
    case 'folder': return `<path d="M${i},${i + 8} V${Y} H${X} V${i + 8} H${w * 0.45} L${w * 0.38},${i} H${i} Z" ${common}/>`;
    case 'cloud': {
      const a = w, b = h;
      return `<path d="M${a * 0.22},${b * 0.86} C${a * 0.02},${b * 0.86} ${a * 0.0},${b * 0.5} ${a * 0.2},${b * 0.46} C${a * 0.18},${b * 0.18} ${a * 0.5},${b * 0.08} ${a * 0.58},${b * 0.3} C${a * 0.72},${b * 0.12} ${a * 0.98},${b * 0.28} ${a * 0.86},${b * 0.5} C${a * 1.02},${b * 0.62} ${a * 0.96},${b * 0.88} ${a * 0.8},${b * 0.86} Z" ${common}/>`;
    }
    case 'note': return `<path d="M${i},${i} H${w - 14} L${X},14 V${Y} H${i} Z" ${common}/><path d="M${w - 14},${i} V14 H${X}" fill="none" stroke="${esc(s.stroke)}" stroke-width="${sw}"/>`;
    case 'component': return `<rect x="10" y="${i}" width="${w - 10 - i}" height="${h - sw}" ${common}/><rect x="${i}" y="${h * 0.25}" width="18" height="10" ${common}/><rect x="${i}" y="${h * 0.55}" width="18" height="10" ${common}/>`;
    case 'user': {
      const cx = w / 2, r = Math.min(w, h) * 0.16;
      return `<circle cx="${cx}" cy="${h * 0.2}" r="${r}" ${common}/><path d="M${cx - r * 2.1},${h * 0.58} C${cx - r * 2.1},${h * 0.32} ${cx + r * 2.1},${h * 0.32} ${cx + r * 2.1},${h * 0.58} Z" ${common}/>`;
    }
    case 'server': {
      const bh = h * 0.6, rh = bh / 3;
      return `<rect x="${w * 0.2}" y="${i}" width="${w * 0.6}" height="${bh}" rx="3" ${common}/>` +
        [1, 2].map((k) => `<line x1="${w * 0.2}" y1="${i + rh * k}" x2="${w * 0.8}" y2="${i + rh * k}" stroke="${esc(s.stroke)}" stroke-width="${sw}"/>`).join('') +
        [0, 1, 2].map((k) => `<circle cx="${w * 0.3}" cy="${i + rh * k + rh / 2}" r="2" fill="${esc(s.stroke)}"/>`).join('');
    }
    case 'computer': {
      const bh = h * 0.5;
      return `<rect x="${w * 0.2}" y="${i}" width="${w * 0.6}" height="${bh}" rx="3" ${common}/><line x1="${w / 2}" y1="${bh + i}" x2="${w / 2}" y2="${h * 0.6}" stroke="${esc(s.stroke)}" stroke-width="${sw}"/><line x1="${w * 0.36}" y1="${h * 0.6}" x2="${w * 0.64}" y2="${h * 0.6}" stroke="${esc(s.stroke)}" stroke-width="${sw * 1.4}"/>`;
    }
    case 'laptop': {
      const bh = h * 0.46;
      return `<rect x="${w * 0.26}" y="${i}" width="${w * 0.48}" height="${bh}" rx="3" ${common}/><path d="M${w * 0.14},${h * 0.6} H${w * 0.86} L${w * 0.8},${h * 0.5 + 2} H${w * 0.2} Z" ${common}/>`;
    }
    case 'mobile': return `<rect x="${w * 0.36}" y="${i}" width="${w * 0.28}" height="${h * 0.62}" rx="4" ${common}/><circle cx="${w / 2}" cy="${h * 0.56}" r="1.8" fill="${esc(s.stroke)}"/>`;
    case 'start': return `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 1}" fill="${esc(s.stroke)}" stroke="${esc(s.stroke)}"/>`;
    case 'end': return `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 1.5}" fill="#ffffff" stroke="${esc(s.stroke)}" stroke-width="1.6"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 6}" fill="${esc(s.stroke)}"/>`;
    case 'rectangle': default:
      return `<rect x="${i}" y="${i}" width="${w - sw}" height="${h - sw}" ${common}/>`;
  }
}

/** Text lines placed inside the label box. Returns <text> markup (used by exporters). */
export function labelMarkup(shape, w, h, label, style, members) {
  const s = resolveStyle(style);
  const box = labelBox(shape, w, h);
  const lines = String(label ?? '').split('\n');
  const mem = members?.length ? members : [];
  const lh = s.fontSize * LINE_HEIGHT;
  const total = (lines.length * lh) + (mem.length ? mem.length * (s.fontSize - 1) * LINE_HEIGHT + 6 : 0);
  let y = box.y + (box.h - total) / 2 + lh / 2;
  const anchor = s.textAlign === 'left' ? 'start' : s.textAlign === 'right' ? 'end' : 'middle';
  const tx = s.textAlign === 'left' ? box.x + 6 : s.textAlign === 'right' ? box.x + box.w - 6 : box.x + box.w / 2;
  let out = '';
  for (const l of lines) {
    out += `<text x="${tx}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${s.fontSize}" font-weight="${s.fontWeight}" font-style="${s.fontStyle}" fill="${esc(s.color)}">${esc(l)}</text>`;
    y += lh;
  }
  if (mem.length) {
    y += 2;
    out += `<line x1="${box.x + 4}" y1="${y - lh / 2 + 2}" x2="${box.x + box.w - 4}" y2="${y - lh / 2 + 2}" stroke="${esc(s.stroke)}" stroke-width="0.8" opacity="0.5"/>`;
    y += 4;
    for (const l of mem) {
      const fs = s.fontSize - 1;
      out += `<text x="${tx}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${fs}" fill="${esc(s.color)}" opacity="0.85">${esc(l)}</text>`;
      y += fs * LINE_HEIGHT;
    }
  }
  return out;
}

/** UML class box: header (stereotype + name), attributes, methods. */
export function classMarkup(node) {
  const w = node.width, h = node.height;
  const s = resolveStyle(node.style);
  const fs = Math.max(10, s.fontSize - 1);
  const lh = fs * LINE_HEIGHT;
  const mono = `font-family='${MONO_FAMILY}' font-size="${fs}"`;
  let out = `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}"/>`;
  let y = 8;
  if (node.stereotype) {
    out += `<text x="${w / 2}" y="${y + lh / 2}" text-anchor="middle" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${fs - 1}" fill="${esc(s.color)}" opacity="0.75">«${esc(node.stereotype)}»</text>`;
    y += lh;
  }
  const titleLines = String(node.label ?? '').split('\n');
  for (const t of titleLines) {
    out += `<text x="${w / 2}" y="${y + lh / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${fs + 1}" font-weight="bold" fill="${esc(s.color)}">${esc(t)}</text>`;
    y += (fs + 1) * LINE_HEIGHT;
  }
  y += 5;
  out += `<line x1="0.75" y1="${y}" x2="${w - 0.75}" y2="${y}" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}"/>`;
  y += 5;
  for (const a of node.attributes ?? []) { out += `<text x="10" y="${y + lh / 2}" dominant-baseline="central" ${mono} fill="${esc(s.color)}">${esc(a)}</text>`; y += lh; }
  if (node.methods?.length) {
    y += (node.attributes?.length ? 3 : 0);
    out += `<line x1="0.75" y1="${y}" x2="${w - 0.75}" y2="${y}" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}"/>`;
    y += 5;
    for (const m of node.methods) { out += `<text x="10" y="${y + lh / 2}" dominant-baseline="central" ${mono} fill="${esc(s.color)}">${esc(m)}</text>`; y += lh; }
  }
  return out;
}

/** Group (container) frame + title. */
export function groupMarkup(g) {
  const s = resolveStyle({ ...g.style });
  const w = g.width, h = g.height;
  const i = s.strokeWidth / 2;
  const hdr = s.fontSize * LINE_HEIGHT + 12;
  const lines = String(g.label ?? '').split('\n');
  let out = `<rect x="${i}" y="${i}" width="${w - s.strokeWidth}" height="${h - s.strokeWidth}" rx="6" fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}"${dashAttr(s.dash)}/>`;
  lines.forEach((l, k) => {
    out += `<text x="12" y="${8 + (k + 0.5) * s.fontSize * LINE_HEIGHT + 2}" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="${s.fontSize}" font-weight="bold" fill="${esc(s.color)}">${esc(l)}</text>`;
  });
  void hdr;
  return out;
}

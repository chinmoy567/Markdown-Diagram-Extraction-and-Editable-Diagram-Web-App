// Sequence diagram: deterministic layout + SVG markup. The editor displays this markup and
// attaches click handling through data-item-id / data-participant-id attributes.
import { esc } from './shapes.js';
import { FONT_FAMILY, textWidth } from '../diagrams/measure.js';

const FS = 12;
const ROW = 34;
const HEAD_H = 40;
const MARGIN = 24;

export function layoutSequence(seq) {
  const ps = seq.participants;
  const widths = ps.map((p) => Math.max(110, textWidth(p.label, 13, 'bold') + 28));
  // d[i] = centre-to-centre distance between participant i and i+1
  const d = ps.slice(1).map((_, i) => (widths[i] + widths[i + 1]) / 2 + 30);
  const idx = new Map(ps.map((p, i) => [p.id, i]));
  const visit = (items) => {
    for (const it of items) {
      if (it.type === 'message') {
        const a = idx.get(it.from), b = idx.get(it.to);
        if (a == null || b == null) continue;
        const T = textWidth(it.text || '', FS) + 36;
        if (a === b) { if (a < d.length) d[a] = Math.max(d[a], T + 60); continue; }
        const lo = Math.min(a, b), hi = Math.max(a, b);
        let sum = 0;
        for (let k = lo; k < hi; k++) sum += d[k];
        if (sum < T) for (let k = lo; k < hi; k++) d[k] += (T - sum) / (hi - lo);
      } else if (it.type === 'block') it.branches.forEach((br) => visit(br.items));
    }
  };
  visit(seq.items);
  const xs = [];
  let x = MARGIN + (widths[0] ?? 0) / 2;
  ps.forEach((_, i) => { if (i > 0) x += d[i - 1]; xs.push(x); });
  return { xs, widths, idx };
}

export function sequenceMarkup(seq, { selectedId = null } = {}) {
  const ps = seq.participants;
  const { xs, widths, idx } = layoutSequence(seq);
  const cx = (id) => xs[idx.get(id)] ?? MARGIN;
  let y = MARGIN + HEAD_H + 16;
  let out = '';
  let msgNo = 0;
  const bodyStart = y;
  const marks = [];

  const drawItems = (items, depth) => {
    for (const it of items) {
      const sel = selectedId === it.id;
      const attr = `data-item-id="${esc(it.id)}"`;
      if (it.type === 'message') {
        const x1 = cx(it.from), x2 = cx(it.to);
        const dash = it.line === 'dashed' ? ' stroke-dasharray="6 4"' : '';
        const label = (seq.autonumber ? `${++msgNo}. ` : '') + (it.text ?? '');
        if (it.from === it.to) {
          const lw = 34;
          marks.push(`<g ${attr} class="seq-item" cursor="pointer">` +
            `<rect x="${x1 - 4}" y="${y - 12}" width="${lw + textWidth(label, FS) + 20}" height="${ROW + 4}" fill="${sel ? '#dbeafe' : 'transparent'}" opacity="0.7"/>` +
            `<path d="M${x1},${y} h${lw} v18 h-${lw}" fill="none" stroke="#334155" stroke-width="1.4"${dash} marker-end="url(#sq-arrow)"/>` +
            `<text x="${x1 + lw + 8}" y="${y + 9}" font-family='${FONT_FAMILY}' font-size="${FS}" fill="#0f172a" dominant-baseline="central">${esc(label)}</text></g>`);
          y += ROW + 10;
        } else {
          const mx = (x1 + x2) / 2;
          const lx = Math.min(x1, x2);
          const w = Math.abs(x2 - x1);
          const markerEnd = it.head === 'cross' ? 'url(#sq-cross)' : it.head === 'open' ? 'url(#sq-open)' : it.head === 'async' ? 'url(#sq-open)' : it.head === 'none' ? '' : 'url(#sq-arrow)';
          marks.push(`<g ${attr} class="seq-item" cursor="pointer">` +
            `<rect x="${lx}" y="${y - 20}" width="${w}" height="${ROW}" fill="${sel ? '#dbeafe' : 'transparent'}" opacity="0.7"/>` +
            `<text x="${mx}" y="${y - 9}" text-anchor="middle" font-family='${FONT_FAMILY}' font-size="${FS}" fill="#0f172a" dominant-baseline="central">${esc(label)}</text>` +
            `<line x1="${x1}" y1="${y}" x2="${x2 + (x2 > x1 ? -1 : 1)}" y2="${y}" stroke="#334155" stroke-width="1.4"${dash}${markerEnd ? ` marker-end="${markerEnd}"` : ''}/></g>`);
          y += ROW;
        }
      } else if (it.type === 'note') {
        const txt = it.text ?? '';
        const lines = txt.split('\n');
        const w = Math.max(90, ...lines.map((l) => textWidth(l, FS - 1))) + 20;
        const h = lines.length * 15 + 12;
        const a = it.actors.map(cx);
        let nx;
        if (it.placement === 'over') nx = a.length > 1 ? (Math.min(...a) + Math.max(...a)) / 2 - Math.max(w, Math.max(...a) - Math.min(...a) + 40) / 2 : a[0] - w / 2;
        else if (it.placement === 'left of') nx = a[0] - w - 10;
        else nx = a[0] + 10;
        const ww = it.placement === 'over' && a.length > 1 ? Math.max(w, Math.max(...a) - Math.min(...a) + 40) : w;
        marks.push(`<g ${attr} class="seq-item" cursor="pointer"><rect x="${nx}" y="${y - 6}" width="${ww}" height="${h}" fill="${sel ? '#fde68a' : '#fef9c3'}" stroke="#ca8a04"/>` +
          lines.map((l, k) => `<text x="${nx + ww / 2}" y="${y + 6 + k * 15 + 2}" text-anchor="middle" font-family='${FONT_FAMILY}' font-size="${FS - 1}" fill="#422006" dominant-baseline="central">${esc(l)}</text>`).join('') + '</g>');
        y += h + 8;
      } else if (it.type === 'block') {
        const startY = y;
        y += 6;
        const left = MARGIN - 10 + depth * 8;
        const right = (xs[xs.length - 1] ?? 200) + (widths[widths.length - 1] ?? 100) / 2 + 10 - depth * 8;
        const bodyParts = [];
        let first = true;
        const seps = [];
        for (const br of it.branches) {
          if (!first) { seps.push({ y: y + 2, label: br.label, word: br.word ?? 'else' }); y += 22; }
          else y += 24;
          first = false;
          drawItems(br.items, depth + 1);
        }
        y += 6;
        const fill = it.kind === 'rect' ? 'rgba(148,163,184,0.12)' : 'none';
        marks.push(`<g ${attr} class="seq-item" cursor="pointer"><rect x="${left}" y="${startY}" width="${right - left}" height="${y - startY}" fill="${sel ? 'rgba(59,130,246,0.10)' : fill}" stroke="#64748b" stroke-width="1.2" pointer-events="stroke"/>` +
          (it.kind === 'rect' ? '' : `<path d="M${left},${startY} h${Math.max(46, textWidth(it.kind, FS - 1, 'bold') + 20)} v14 l-6,6 h-${Math.max(46, textWidth(it.kind, FS - 1, 'bold') + 20) - 6} Z" fill="#e2e8f0" stroke="#64748b"/>` +
            `<text x="${left + 8}" y="${startY + 10}" font-family='${FONT_FAMILY}' font-size="${FS - 1}" font-weight="bold" fill="#0f172a" dominant-baseline="central">${esc(it.kind)}</text>`) +
          (it.branches[0].label ? `<text x="${left + Math.max(46, textWidth(it.kind, FS - 1, 'bold') + 20) + 8}" y="${startY + 10}" font-family='${FONT_FAMILY}' font-size="${FS - 1}" fill="#334155" dominant-baseline="central">[${esc(it.branches[0].label)}]</text>` : '') +
          seps.map((s) => `<line x1="${left}" y1="${s.y}" x2="${right}" y2="${s.y}" stroke="#64748b" stroke-dasharray="6 4"/><text x="${left + 8}" y="${s.y + 11}" font-family='${FONT_FAMILY}' font-size="${FS - 1}" fill="#334155" dominant-baseline="central">[${esc(s.label || s.word)}]</text>`).join('') +
          '</g>');
        void bodyParts;
      }
    }
  };
  drawItems(seq.items, 0);
  const bottom = y + 10;

  // lifelines + participants
  let head = '';
  ps.forEach((p, i) => {
    const x = xs[i];
    const w = widths[i];
    const sel = selectedId === `p:${p.id}`;
    head += `<line x1="${x}" y1="${MARGIN + HEAD_H}" x2="${x}" y2="${bottom}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    const actor = p.kind === 'actor';
    const bx = x - w / 2;
    head += `<g data-participant-id="${esc(p.id)}" class="seq-item" cursor="pointer">` +
      (actor
        ? `<circle cx="${x}" cy="${MARGIN + 7}" r="6" fill="#fff" stroke="#334155" stroke-width="1.4"/><path d="M${x},${MARGIN + 13} v12 M${x - 9},${MARGIN + 18} h18 M${x},${MARGIN + 25} l-7,10 M${x},${MARGIN + 25} l7,10" stroke="#334155" stroke-width="1.4" fill="none"/>` +
          `<text x="${x}" y="${MARGIN + HEAD_H + 8}" text-anchor="middle" font-family='${FONT_FAMILY}' font-size="12" font-weight="bold" fill="#0f172a">${esc(p.label)}</text>`
        : `<rect x="${bx}" y="${MARGIN}" width="${w}" height="${HEAD_H - 4}" rx="4" fill="${sel ? '#dbeafe' : '#f1f5f9'}" stroke="#334155" stroke-width="1.4"/>` +
          `<text x="${x}" y="${MARGIN + (HEAD_H - 4) / 2}" text-anchor="middle" dominant-baseline="central" font-family='${FONT_FAMILY}' font-size="13" font-weight="bold" fill="#0f172a">${esc(p.label)}</text>`) +
      '</g>';
  });
  void bodyStart;

  const defs = `<defs>
<marker id="sq-arrow" viewBox="0 0 10 8" refX="9.5" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#334155"/></marker>
<marker id="sq-open" viewBox="0 0 10 8" refX="9.5" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0.5,0.5 L9,4 L0.5,7.5" fill="none" stroke="#334155" stroke-width="1.4"/></marker>
<marker id="sq-cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,9 M9,1 L1,9" stroke="#334155" stroke-width="1.6" fill="none"/></marker>
</defs>`;
  const width = (xs[xs.length - 1] ?? 200) + (widths[widths.length - 1] ?? 100) / 2 + MARGIN;
  const height = bottom + MARGIN;
  const titleBlock = seq.title ? `<text x="${width / 2}" y="14" text-anchor="middle" font-family='${FONT_FAMILY}' font-size="14" font-weight="bold" fill="#0f172a">${esc(seq.title)}</text>` : '';
  return { width: Math.ceil(width), height: Math.ceil(height), markup: defs + `<rect width="${width}" height="${height}" fill="#ffffff"/>` + titleBlock + head + marks.join(''), };
}

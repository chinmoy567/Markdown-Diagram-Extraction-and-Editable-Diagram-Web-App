// Shared helpers for Mermaid parsers. Nothing here evaluates input; it is all string handling.

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·', rarr: '→', larr: '←' };

export function decodeEntities(s) {
  return s
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(+n))          // Mermaid's #35; form
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Convert a Mermaid label into plain multi-line text. */
export function cleanLabel(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) s = s.slice(1, -1);
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?(b|i|u|em|strong|small|span|code|sub|sup|p|div)\b[^>]*>/gi, '');
  s = decodeEntities(s);
  return s.split('\n').map((l) => l.trim()).join('\n').trim();
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,25})$/i;
export function safeColor(c) {
  if (typeof c !== 'string') return undefined;
  const t = c.trim();
  return SAFE_COLOR.test(t) ? t : undefined;
}

/** "fill:#fff,stroke:#333,stroke-width:2px,stroke-dasharray:5 4" -> normalised style object. */
export function parseStyleProps(str) {
  const out = {};
  if (!str) return out;
  for (const part of splitTopLevel(str.replace(/;+\s*$/, ''), ',')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    switch (key) {
      case 'fill': { const c = safeColor(val); if (c) out.fill = c; break; }
      case 'stroke': { const c = safeColor(val); if (c) out.stroke = c; break; }
      case 'color': { const c = safeColor(val); if (c) out.color = c; break; }
      case 'stroke-width': { const n = parseFloat(val); if (!Number.isNaN(n)) out.strokeWidth = n; break; }
      case 'stroke-dasharray': out.dash = val.replace(/[^0-9. ]/g, '').trim(); break;
      case 'font-size': { const n = parseFloat(val); if (!Number.isNaN(n)) out.fontSize = n; break; }
      case 'font-weight': out.fontWeight = /bold|[6-9]00/.test(val) ? 'bold' : 'normal'; break;
      default: break;
    }
  }
  return out;
}

/** Split on a separator, ignoring separators inside (), [], {} and quotes. */
export function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of str) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"') { quote = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Remove %% comments (full-line and trailing), and return logical non-empty lines with original indexes. */
export function logicalLines(src) {
  return src.replace(/\r\n?/g, '\n').split('\n').map((text, i) => ({ text, line: i + 1 }))
    .map((l) => ({ ...l, text: l.text.replace(/(^|\s)%%(?!\{).*$/, '').replace(/\s+$/, '') }))
    .filter((l) => l.text.trim() !== '');
}

export class ParseResult {
  constructor(type) { this.type = type; this.warnings = []; this.unsupported = []; }
  warn(msg) { this.warnings.push(msg); }
}

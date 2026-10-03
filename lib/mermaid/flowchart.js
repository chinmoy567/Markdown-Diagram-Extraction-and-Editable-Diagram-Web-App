// Mermaid flowchart / graph parser -> intermediate graph (no layout, no DOM).
// Handles: directions, nested subgraphs (incl. forward references and edges to subgraphs),
// all node shapes, chained edges (A --> B --> C), `A & B --> C`, edge labels in every syntax,
// classDef / class / :::class / style / linkStyle, <br/> and \n in labels.

import { cleanLabel, logicalLines, parseStyleProps, splitTopLevel, ParseResult } from './common.js';

const ID_RE = /^[\wÀ-￿]+(?:[.\-](?=[\wÀ-￿]))*/u;

// Shape openers, longest first. [open, close(s), shape]
const SHAPES = [
  ['(((', [')))'], 'doublecircle'],
  ['((', ['))'], 'circle'],
  ['([', ['])'], 'stadium'],
  ['[(', [')]'], 'cylinder'],
  ['[[', [']]'], 'subroutine'],
  ['{{', ['}}'], 'hexagon'],
  ['[/', ['/]'], 'parallelogram'],
  ['[\\', ['\\]'], 'parallelogram'],
  ['[/', ['\\]'], 'trapezoid'],
  ['[\\', ['/]'], 'trapezoid'],
  ['(', [')'], 'rounded'],
  ['[', [']'], 'rectangle'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'rectangle'],
];

/** Try to read a shape + label at s[pos]. Returns { shape, label, end } or null. */
function readShape(s, pos) {
  // Special-case ordering so `[/ ... \]` (trapezoid) and `[/ ... /]` (parallelogram) are resolved by closer.
  const candidates = SHAPES.filter(([open]) => s.startsWith(open, pos));
  for (const [open, closers, shape] of candidates) {
    let p = pos + open.length;
    while (s[p] === ' ') p++;
    let text, after;
    if (s[p] === '"') {
      const endQ = s.indexOf('"', p + 1);
      if (endQ < 0) continue;
      text = s.slice(p + 1, endQ);
      after = endQ + 1;
      while (s[after] === ' ') after++;
      const closer = closers.find((c) => s.startsWith(c, after));
      if (!closer) continue;
      return { shape, label: cleanLabel(text), end: after + closer.length };
    }
    // unquoted: find the first matching closer
    let best = -1, bestLen = 0;
    for (const c of closers) {
      const idx = s.indexOf(c, p);
      if (idx >= 0 && (best < 0 || idx < best)) { best = idx; bestLen = c.length; }
    }
    if (best < 0) continue;
    return { shape, label: cleanLabel(s.slice(p, best)), end: best + bestLen };
  }
  return null;
}

// Link patterns, tried in order. Each returns { lineType, arrowStart, arrowEnd, label, end } or null.
const HEADS = { '>': 'arrow', x: 'cross', o: 'circle' };

function readLink(s, pos) {
  const rest = s.slice(pos);
  let m;

  // invisible
  if ((m = /^~{3,}/.exec(rest))) return finish({ lineType: 'invisible', arrowStart: 'none', arrowEnd: 'none' }, m[0].length);

  // --- text in the line: `-- text -->`, `<-- text -->`, `== text ==>`, `-. text .->`
  if ((m = /^([<xo])?--(?![->xo])\s+(.+?)\s+--+([>xo-])?(?=\s|$|\w)/.exec(rest)) && !/^\s*$/.test(m[2])) {
    const tail = rest.slice(m[0].length);
    return finish({ lineType: 'solid', arrowStart: head(m[1]), arrowEnd: m[3] === '-' ? 'none' : head(m[3]), label: cleanLabel(m[2]) }, m[0].length, tail);
  }
  if ((m = /^([<xo])?==(?![=>xo])\s+(.+?)\s+==+([>xo=])?(?=\s|$|\w)/.exec(rest))) {
    return finish({ lineType: 'thick', arrowStart: head(m[1]), arrowEnd: m[3] === '=' ? 'none' : head(m[3]), label: cleanLabel(m[2]) }, m[0].length);
  }
  if ((m = /^([<xo])?-\.(?![-.>])\s*(.+?)\s*\.+-([>xo])?/.exec(rest))) {
    return finish({ lineType: 'dotted', arrowStart: head(m[1]), arrowEnd: head(m[3]), label: cleanLabel(m[2]) }, m[0].length);
  }

  // --- plain links (optionally followed by |label|)
  if ((m = /^([<xo])?-\.+-([>xo])?/.exec(rest))) return finish({ lineType: 'dotted', arrowStart: head(m[1]), arrowEnd: head(m[2]) }, m[0].length);
  if ((m = /^([<xo])?={2,}([>xo])?/.exec(rest))) return finish({ lineType: 'thick', arrowStart: head(m[1]), arrowEnd: head(m[2]) }, m[0].length);
  if ((m = /^([<xo])?(-{2,})([>xo])?/.exec(rest))) {
    return finish({ lineType: 'solid', arrowStart: head(m[1]), arrowEnd: head(m[3]) }, m[0].length);
  }
  return null;

  function head(c) { return c ? HEADS[c === '<' ? '>' : c] : 'none'; }
  function finish(link, len) {
    let end = pos + len;
    // optional |label|
    let p = end;
    while (s[p] === ' ') p++;
    if (s[p] === '|') {
      const close = s.indexOf('|', p + 1);
      if (close > 0) { link.label = cleanLabel(s.slice(p + 1, close)); end = close + 1; }
    }
    return { ...link, label: link.label ?? '', end };
  }
}

function parseNodeRef(s, pos) {
  let p = pos;
  while (s[p] === ' ') p++;
  const m = ID_RE.exec(s.slice(p));
  if (!m) return null;
  let id = m[0];
  p += id.length;
  let shape = null, label = null;
  const sh = readShape(s, p);
  if (sh) { shape = sh.shape; label = sh.label; p = sh.end; }
  let cls = null;
  const cm = /^:::([\w-]+)/.exec(s.slice(p));
  if (cm) { cls = cm[1]; p += cm[0].length; }
  return { id, shape, label, cls, end: p };
}

export function parseFlowchart(src) {
  const res = new ParseResult('flowchart');
  const lines = logicalLines(src);
  if (!lines.length) throw new Error('Empty flowchart');

  const header = /^\s*(flowchart|graph)(?:\s+(TB|TD|BT|RL|LR))?\s*;?\s*$/i.exec(lines[0].text);
  if (!header) throw new Error(`Expected "flowchart <direction>" or "graph <direction>" on the first line, got: ${lines[0].text.trim().slice(0, 60)}`);
  const direction = (header[2] ?? 'TB').toUpperCase().replace('TD', 'TB');

  const nodes = new Map();     // id -> node
  const groups = new Map();    // id -> group
  const edges = [];
  const classDefs = new Map();
  const classAssign = [];      // [ids[], className]
  const inlineStyles = new Map();
  const linkStyles = [];

  // Pass 1: discover subgraph ids so forward references (edge to a subgraph before its definition) work.
  const subgraphIds = new Set();
  for (const { text } of lines) {
    const m = /^\s*subgraph\s+([^\s\["(]+)/.exec(text);
    if (m) subgraphIds.add(m[1]);
  }

  const stack = [];            // open subgraph ids
  const current = () => (stack.length ? stack[stack.length - 1] : undefined);

  function touchNode(ref) {
    if (subgraphIds.has(ref.id)) {
      // reference to a subgraph (not a node). Label from `id[label]` is ignored (Mermaid does likewise).
      if (ref.cls) classAssign.push([[ref.id], ref.cls]);
      return ref.id;
    }
    let n = nodes.get(ref.id);
    if (!n) {
      n = { id: ref.id, shape: 'rectangle', label: ref.id, parentId: undefined, classes: [], explicit: false };
      nodes.set(ref.id, n);
    }
    if (ref.shape) { n.shape = ref.shape; n.label = ref.label; n.explicit = true; }
    if (ref.cls) n.classes.push(ref.cls);
    // A mention inside a subgraph makes the node a member unless it already lives in one.
    if (current() && !n.parentId) n.parentId = current();
    return ref.id;
  }

  for (let li = 1; li < lines.length; li++) {
    const { text, line } = lines[li];
    const t = text.trim().replace(/;+$/, '').trim();
    if (!t) continue;
    let m;

    if ((m = /^subgraph\s+(.*)$/.exec(t))) {
      const spec = m[1].trim();
      let id, title;
      const withBracket = /^([^\s\["(]+)\s*\[(.*)\]\s*$/.exec(spec);
      if (withBracket) { id = withBracket[1]; title = cleanLabel(withBracket[2]); }
      else if (/^"/.test(spec)) { id = spec.replace(/"/g, '').replace(/\W+/g, '_'); title = cleanLabel(spec); }
      else if (/\s/.test(spec)) { id = spec.replace(/\W+/g, '_'); title = spec; }
      else { id = spec; title = spec; }
      if (!groups.has(id)) groups.set(id, { id, label: title, parentId: current(), classes: [] });
      else { const g = groups.get(id); g.label = title; if (!g.parentId) g.parentId = current(); }
      stack.push(id);
      continue;
    }
    if (t === 'end') { if (!stack.length) res.warn(`line ${line}: unmatched "end"`); stack.pop(); continue; }
    if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) {
      const g = current() && groups.get(current());
      if (g) g.direction = m[1].toUpperCase().replace('TD', 'TB');
      continue;
    }
    if ((m = /^classDef\s+(\S+)\s+(.*)$/.exec(t))) {
      for (const name of m[1].split(',')) classDefs.set(name, parseStyleProps(m[2]));
      continue;
    }
    if ((m = /^class\s+(\S+)\s+([\w-]+)$/.exec(t))) { classAssign.push([m[1].split(','), m[2]]); continue; }
    if ((m = /^style\s+(\S+)\s+(.*)$/.exec(t))) { for (const id of m[1].split(',')) inlineStyles.set(id, { ...(inlineStyles.get(id) ?? {}), ...parseStyleProps(m[2]) }); continue; }
    if ((m = /^linkStyle\s+(\S+)\s+(.*)$/.exec(t))) { linkStyles.push([m[1], parseStyleProps(m[2])]); continue; }
    if (/^(click|accTitle|accDescr|title)\b/.test(t)) { res.warn(`line ${line}: "${t.split(/\s/)[0]}" directive ignored (kept in original source)`); continue; }

    // edge / node statement
    try {
      parseStatement(t, line);
    } catch (e) {
      res.warn(`line ${line}: ${e.message} — statement skipped`);
    }
  }

  function parseStatement(t, line) {
    let pos = 0;
    let prev = null;                     // array of node ids on the left
    for (;;) {
      // group of nodes joined by &
      const ids = [];
      for (;;) {
        const ref = parseNodeRef(t, pos);
        if (!ref) throw new Error(`cannot parse node near "${t.slice(pos, pos + 25)}"`);
        ids.push(touchNode(ref));
        pos = ref.end;
        while (t[pos] === ' ') pos++;
        if (t[pos] === '&') { pos++; continue; }
        break;
      }
      if (prev) {
        const link = prev.link;
        for (const a of prev.ids) for (const b of ids) {
          edges.push({ source: a, target: b, label: link.label, lineType: link.lineType, arrowStart: link.arrowStart, arrowEnd: link.arrowEnd, line });
        }
      }
      while (t[pos] === ' ') pos++;
      if (pos >= t.length) break;
      const link = readLink(t, pos);
      if (!link) throw new Error(`unexpected text "${t.slice(pos, pos + 25)}"`);
      pos = link.end;
      prev = { ids, link };
    }
  }

  // Resolve classes
  const applyClass = (target, cls) => { target.classes.push(cls); };
  for (const [ids, cls] of classAssign) {
    for (const id of ids) {
      const target = nodes.get(id) ?? groups.get(id);
      if (target) applyClass(target, cls); else res.warn(`class "${cls}" refers to unknown id "${id}"`);
    }
  }
  const resolveStyle = (item) => {
    let st = { ...(classDefs.get('default') ?? {}) };
    for (const c of item.classes) st = { ...st, ...(classDefs.get(c) ?? {}) };
    st = { ...st, ...(inlineStyles.get(item.id) ?? {}) };
    return st;
  };
  for (const n of nodes.values()) { n.style = resolveStyle(n); }
  for (const g of groups.values()) { g.style = resolveStyle(g); }

  edges.forEach((e, i) => { e.index = i; });
  for (const [sel, st] of linkStyles) {
    const idxs = sel === 'default' ? edges.map((e) => e.index) : sel.split(',').map(Number).filter((n) => !Number.isNaN(n));
    for (const i of idxs) if (edges[i]) edges[i].style = st;
  }

  // Unreferenced classDef names are fine. Unknown class names on items:
  for (const item of [...nodes.values(), ...groups.values()]) {
    for (const c of item.classes) if (!classDefs.has(c)) res.warn(`class "${c}" used on "${item.id}" but has no classDef`);
  }
  if (stack.length) res.warn(`${stack.length} subgraph(s) not closed with "end"`);

  return {
    ...res,
    direction,
    nodes: [...nodes.values()],
    groups: [...groups.values()],
    edges,
    classDefs: Object.fromEntries(classDefs),
  };
}

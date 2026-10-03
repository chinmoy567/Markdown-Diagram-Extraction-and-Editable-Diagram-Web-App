// Line-oriented ASCII converters: vertical tiers, horizontal arrow chains, and tree outlines.
// Each returns { nodes, edges, warnings, direction } with unplaced nodes (auto-layout positions them).

const mkNode = (id, label) => ({ id, shape: 'rectangle', label, x: 0, y: 0, width: 140, height: 56, style: {} });

/* ------------------------------------------------------------------ tiers */
export function convertTiers(content) {
  const warnings = [];
  const lines = content.replace(/\t/g, '    ').split('\n');
  const isConn = (l) => /^\s*([|│]|[v▼^▲](\s|$))/.test(l) || /^\s*[|│]\s{1,}\S/.test(l);
  const blocks = [];       // { lines:[], conns:[] } conn lines BEFORE this block
  let cur = null;
  let pendingConn = [];
  let multiBar = 0, sideBySide = 0;
  for (const raw of lines) {
    if (!raw.trim()) { if (cur) { blocks.push(cur); cur = null; } continue; }
    if (/^\s*[-=_]{8,}\s*$/.test(raw)) continue;                     // rule lines under titles
    if (isConn(raw)) {
      if (cur) { blocks.push(cur); cur = null; }
      const bars = (raw.match(/[|│]/g) ?? []).length;
      if (bars > 1) multiBar++;
      pendingConn.push(raw);
      continue;
    }
    if (!cur) { cur = { lines: [], conns: pendingConn }; pendingConn = []; }
    if (/\S {5,}\S/.test(raw.trim())) sideBySide++;
    cur.lines.push(raw);
  }
  if (cur) blocks.push(cur);
  let real = blocks.filter((b) => b.lines.length);
  // a lone heading line such as "System Context:" is a title, not a tier
  if (real.length > 2 && real[0].lines.length === 1 && /[:—-]s*$/.test(real[0].lines[0]) && !real[1].conns.length) real = real.slice(1);
  if (real.length < 2) throw new Error('Fewer than two blocks found');

  const nodes = [], edges = [];
  const minIndent = Math.min(...real.flatMap((b) => b.lines.map((l) => l.length - l.trimStart().length)));
  real.forEach((b, i) => {
    const label = b.lines.map((l) => l.slice(minIndent).trimEnd().replace(/^\s+/, (s) => s.length > 4 ? '  ' : s)).join('\n').trim();
    nodes.push({ ...mkNode(`t${i}`, label), style: { fontSize: 12 }, shape: 'rectangle' });
  });
  real.forEach((b, i) => {
    if (i === 0) return;
    const conns = b.conns;
    if (!conns.length) return;
    const labels = conns.map((l) => l.replace(/^\s*[|│v▼^▲]\s*/, '').trim()).filter(Boolean);
    const down = conns.some((l) => /^\s*[v▼]/.test(l)), up = conns.some((l) => /^\s*[\^▲]/.test(l));
    edges.push({
      id: `e${i}`, source: `t${i - 1}`, target: `t${i}`, label: labels.join('\n'),
      style: { arrowEnd: down ? 'arrow' : 'none', arrowStart: up ? 'arrow' : 'none', lineType: 'solid' },
    });
  });
  if (multiBar) warnings.push(`${multiBar} connector line(s) fan out to several branches; only a single vertical chain was converted. Use the reference to add the missing branches.`);
  if (sideBySide) warnings.push(`${sideBySide} line(s) look like side-by-side columns; their text was kept inside one box. Split them manually if needed.`);
  return { nodes, edges, groups: [], warnings, direction: 'TB', quality: multiBar || sideBySide ? 'low' : 'medium' };
}

/* ------------------------------------------------------------------ chains */
const SEG = /(◀|◄|<)?([─━═]{2,}|-{2,})(?:(?![▶►>])(.{1,40}?)([─━═]{2,}|-{2,}))?(▶|►|>)?/g;

export function convertChain(content) {
  const warnings = [];
  const nodes = new Map();
  const edges = [];
  const key = (t) => t.toLowerCase().replace(/\s+/g, ' ');
  const node = (text) => {
    const [first, ...rest] = text.split(/\s{2,}/);
    const k = key(first);
    if (!nodes.has(k)) nodes.set(k, { ...mkNode(`c${nodes.size}`, first.trim()), style: { fontSize: 13 } });
    const n = nodes.get(k);
    if (rest.length && !n.label.includes(rest.join(' '))) n.label += `\n${rest.join(' ').trim()}`;
    return n.id;
  };
  let skipped = 0;
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    if (!line.trim()) continue;
    const segs = [];
    let m;
    SEG.lastIndex = 0;
    while ((m = SEG.exec(line))) segs.push({ s: m.index, e: m.index + m[0].length, left: !!m[1], right: !!m[5], label: (m[3] ?? '').replace(/^\(|\)$/g, '').trim() });
    if (!segs.length) { if (/[│└┘┌┐▲▼]/.test(line)) skipped++; continue; }
    const parts = [];
    let pos = 0;
    for (const sg of segs) { parts.push(line.slice(pos, sg.s).trim()); pos = sg.e; }
    parts.push(line.slice(pos).trim());
    if (parts.some((p, i) => !p && !(i === 0 && false))) { skipped++; continue; }
    const ids = parts.map(node);
    segs.forEach((sg, i) => {
      const a = ids[i], b = ids[i + 1];
      const [src, dst] = sg.left && !sg.right ? [b, a] : [a, b];
      edges.push({ id: `e${edges.length}`, source: src, target: dst, label: sg.label, style: { arrowEnd: sg.left || sg.right ? 'arrow' : 'none', arrowStart: sg.left && sg.right ? 'arrow' : 'none', lineType: 'solid' } });
    });
  }
  if (skipped) warnings.push(`${skipped} line(s) with vertical or bracket connectors (│ └ ▲ …) could not be interpreted and were left out — compare with the reference.`);
  if (!edges.length) throw new Error('No arrows found');
  return { nodes: [...nodes.values()], edges, groups: [], warnings, direction: 'LR', quality: skipped ? 'low' : 'medium' };
}

/* ------------------------------------------------------------------ tree */
export function convertTree(content) {
  const warnings = [];
  const nodes = [], edges = [];
  const recent = [];                // {id, textCol}
  let last = null;
  for (const raw of content.replace(/\t/g, '    ').split('\n')) {
    if (!raw.trim()) { last = null; continue; }
    const m = /^([ │]*)([├└]─+▶?\s*)(.*)$/.exec(raw);
    if (m) {
      const markerCol = m[1].length;
      const textCol = m[1].length + m[2].length;
      const id = `n${nodes.length}`;
      nodes.push({ ...mkNode(id, m[3].trim()), style: { fontSize: 12 } });
      let parent = null;
      for (let i = recent.length - 1; i >= 0; i--) if (recent[i].textCol <= markerCol) { parent = recent[i]; break; }
      while (recent.length && recent[recent.length - 1].textCol >= textCol) recent.pop();
      if (parent) edges.push({ id: `e${edges.length}`, source: parent.id, target: id, label: '', style: { arrowEnd: 'none', arrowStart: 'none' } });
      recent.push({ id, textCol });
      last = id;
      continue;
    }
    const body = raw.replace(/^[ │]*/, '');
    const col = raw.length - raw.replace(/^[ │]*/, '').length;
    const isContinuation = last && /^[ │]{2,}/.test(raw) && col > (recent[recent.length - 1]?.textCol ?? 0) - 1 && raw.trimStart() === body && /^[ │]/.test(raw);
    if (isContinuation) { const n = nodes.find((x) => x.id === last); n.label += `\n${body.trim()}`; continue; }
    const id = `n${nodes.length}`;
    nodes.push({ ...mkNode(id, body.trim()), style: { fontSize: 12, fontWeight: 'bold' } });
    recent.length = 0;
    if (col > 0) {
      // indented heading-like line: attach under previous root if any
    }
    recent.push({ id, textCol: col });
    last = id;
  }
  if (nodes.length < 2) throw new Error('Not enough lines to build a tree');
  warnings.push('Converted from an indented outline: each line became a text box and each indentation level a parent/child link. Review the structure against the reference.');
  return { nodes, edges, groups: [], warnings, direction: 'LR', quality: 'low' };
}

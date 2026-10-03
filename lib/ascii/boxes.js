// Box-and-connector ASCII diagrams (Unicode box drawing and +---+ / | styles).
// Strategy: parse the text into a character grid, trace closed rectangles (boxes), nest them,
// trace line/arrow paths between box borders into connectors, attach nearby text as labels.
// Anything that cannot be tied to a box/connector is reported, never invented.

const CW = 8, CH = 24;          // grid cell -> pixel
const TL = new Set(['┌', '╔', '├', '┬', '┼', '╠', '╦', '╬', '+']);
const TR = new Set(['┐', '╗', '┤', '┬', '┼', '╣', '╦', '╬', '+']);
const BL = new Set(['└', '╚', '├', '┴', '┼', '╠', '╩', '╬', '+']);
const BR = new Set(['┘', '╝', '┤', '┴', '┼', '╣', '╩', '╬', '+']);
const HEDGE = new Set(['─', '═', '━', '┬', '┴', '┼', '╦', '╩', '╬', '-', '=', '+', '▼', '▲', 'v', '^', '┌', '┐', '└', '┘']);
const VEDGE = new Set(['│', '║', '┃', '├', '┤', '┼', '╠', '╣', '╬', '|', '+', '▶', '◀', '►', '◄']);
// connections of line characters: [up, right, down, left]
const CONN = {
  '─': [0, 1, 0, 1], '═': [0, 1, 0, 1], '━': [0, 1, 0, 1], '│': [1, 0, 1, 0], '║': [1, 0, 1, 0], '┃': [1, 0, 1, 0],
  '┌': [0, 1, 1, 0], '┐': [0, 0, 1, 1], '└': [1, 1, 0, 0], '┘': [1, 0, 0, 1],
  '├': [1, 1, 1, 0], '┤': [1, 0, 1, 1], '┬': [0, 1, 1, 1], '┴': [1, 1, 0, 1], '┼': [1, 1, 1, 1],
  '╔': [0, 1, 1, 0], '╗': [0, 0, 1, 1], '╚': [1, 1, 0, 0], '╝': [1, 0, 0, 1], '╠': [1, 1, 1, 0], '╣': [1, 0, 1, 1], '╦': [0, 1, 1, 1], '╩': [1, 1, 0, 1], '╬': [1, 1, 1, 1],
};
const ARROWS = { '▶': 1, '►': 1, '▼': 2, '◀': 3, '◄': 3, '▲': 0 };   // direction index it points to
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];                      // up right down left

export function convertBoxes(content) {
  const warnings = [];
  const rawLines = content.replace(/\t/g, '    ').split('\n');
  const lines = rawLines.map((l) => [...l]);
  const H = lines.length;
  const W = Math.max(0, ...lines.map((l) => l.length));
  const g = (r, c) => (r >= 0 && r < H && c >= 0 && c < (lines[r]?.length ?? 0) ? lines[r][c] : ' ');

  /* ---------- 1. find boxes ---------- */
  const boxes = [];
  const seen = new Set();
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < lines[r].length; c++) {
      const ch = g(r, c);
      if (!TL.has(ch)) continue;
      if (!(HEDGE.has(g(r, c + 1)) && VEDGE.has(g(r + 1, c)))) continue;
      if (ch === '+' && !(/[-=]/.test(g(r, c + 1)) && /[|]/.test(g(r + 1, c)))) continue;
      // scan right for TR candidates
      for (let c2 = c + 2; c2 < W; c2++) {
        const t = g(r, c2);
        if (!HEDGE.has(t) && !TR.has(t)) break;
        if (!TR.has(t)) continue;
        // scan down for BR; real-world ASCII is often off by one column, so tolerate a drifting right edge
        let found = null, foundC2 = c2;
        for (const sh of [0, 1, -1]) {
          const vc = c2 + sh;
          if (!(VEDGE.has(g(r + 1, vc)) || (sh === 0 && BR.has(g(r + 1, vc))))) continue;
          for (let r2 = r + 1; r2 < H && found == null; r2++) {
            const cornerC = [vc, c2].find((x) => BR.has(g(r2, x)) && (g(r2, x) !== '+' || /[-=]/.test(g(r2, x - 1))));
            if (cornerC != null) {
              let ok = BL.has(g(r2, c));
              for (let x = c + 1; x < Math.min(cornerC, c2) && ok; x++) if (!HEDGE.has(g(r2, x))) ok = false;
              for (let y = r + 1; y < r2 && ok; y++) if (!VEDGE.has(g(y, c))) ok = false;
              if (ok) { found = r2; foundC2 = Math.max(c2, vc); break; }
            }
            if (!VEDGE.has(g(r2, vc))) break;
          }
          if (found != null) break;
        }
        if (found != null) {
          const key = `${r},${c},${found},${foundC2}`;
          if (!seen.has(key)) { seen.add(key); boxes.push({ r1: r, c1: c, r2: found, c2: foundC2 }); }
          break;                                  // smallest box for this top-left corner
        }
      }
    }
  }
  if (!boxes.length) throw new Error('No closed boxes found in this ASCII diagram');

  /* ---------- 2. nesting ---------- */
  boxes.sort((a, b) => area(a) - area(b));
  boxes.forEach((b, i) => { b.id = `b${i}`; });
  const contains = (o, i) => o.r1 <= i.r1 && o.c1 <= i.c1 && o.r2 >= i.r2 && o.c2 >= i.c2 && o !== i;
  for (const b of boxes) b.parent = boxes.filter((o) => contains(o, b)).sort((x, y) => area(x) - area(y))[0] ?? null;
  for (const b of boxes) b.children = boxes.filter((o) => o.parent === b);

  /* ---------- 3. text inside boxes ---------- */
  const inBox = (b, r, c) => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
  const owner = Array.from({ length: H }, () => new Array(W).fill(null));       // innermost box covering a cell
  const border = Array.from({ length: H }, () => new Array(W).fill(null));      // box whose border this cell is
  for (const b of [...boxes].reverse()) {
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) owner[r][c] = b;
  }
  for (const b of boxes) {
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
      if (r === b.r1 || r === b.r2 || c === b.c1 || c === b.c2) border[r][c] ??= b;
    }
  }
  const textOf = (b) => {
    const out = [];
    for (let r = b.r1 + 1; r < b.r2; r++) {
      let s = '';
      for (let c = b.c1 + 1; c < b.c2; c++) {
        if (owner[r][c] !== b) { s += ' '; continue; }
        const ch = g(r, c);
        s += ch;
      }
      const t = s.replace(/\s+$/, '').replace(/^\s+/, '').replace(/\s{3,}/g, '  ');
      if (t) out.push(t);
    }
    return out;
  };

  /* ---------- 4. connectors ---------- */
  const lineChar = (ch) => CONN[ch] || ARROWS[ch] !== undefined || ch === '|' || ch === '-';
  const conns = [];
  const usedCells = new Set();
  const connectorsByKey = new Map();
  function connectsTo(ch, dirIdx) {      // does char connect on side dirIdx
    if (CONN[ch]) return !!CONN[ch][dirIdx];
    if (ch === '|') return dirIdx % 2 === 0;
    if (ch === '-') return dirIdx % 2 === 1;
    if (ARROWS[ch] !== undefined) return true;
    return false;
  }
  for (const b of boxes) {
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
      if (border[r][c] !== b) continue;
      const exits = [];
      if (r === b.r1 && c > b.c1 && c < b.c2) exits.push(0);
      if (r === b.r2 && c > b.c1 && c < b.c2) exits.push(2);
      if (c === b.c2 && r > b.r1 && r < b.r2) exits.push(1);
      if (c === b.c1 && r > b.r1 && r < b.r2) exits.push(3);
      for (const d of exits) {
        const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (owner[nr]?.[nc] && owner[nr][nc] !== b && owner[nr][nc].parent === b.parent && border[nr][nc]) continue;  // touching boxes
        const nch = g(nr, nc);
        if (!lineChar(nch) || border[nr]?.[nc]) continue;
        if (!connectsTo(nch, (d + 2) % 4)) continue;
        const startHead = ARROWS[g(r, c)] !== undefined ? true : false;
        traceFrom(b, nr, nc, d, startHead, [[r, c]]);
      }
    }
  }

  function traceFrom(startBox, r, c, d, startHead, path) {
    // iterative DFS over branches
    const stack = [{ r, c, d, path: [...path], endHead: false }];
    const visitedGlobal = new Set();
    while (stack.length) {
      const st = stack.pop();
      let { r: cr, c: cc, d: cd } = st;
      const p = st.path;
      let guard = 0;
      while (guard++ < 2000) {
        const bd = border[cr]?.[cc];
        const ch = g(cr, cc);
        if (bd && bd !== startBox) {
          // arrived at another box
          const prevCh = p.length ? g(p[p.length - 1][0], p[p.length - 1][1]) : ' ';
          const head = ARROWS[ch] !== undefined || ARROWS[prevCh] !== undefined;
          register(startBox, bd, p, startHead, head);
          break;
        }
        if (bd && bd === startBox) break;
        if (!lineChar(ch)) break;
        const k = `${cr},${cc},${cd}`;
        if (visitedGlobal.has(k)) break;
        visitedGlobal.add(k);
        p.push([cr, cc]);
        if (CONN[ch]) {
          const inSide = (cd + 2) % 4;
          if (!CONN[ch][inSide]) break;
          const outs = [0, 1, 2, 3].filter((s) => s !== inSide && CONN[ch][s]);
          if (!outs.length) break;
          // straight through preferred; branch on the rest
          const straight = outs.includes(cd) ? cd : outs[0];
          for (const o of outs) if (o !== straight) stack.push({ r: cr + DIRS[o][0], c: cc + DIRS[o][1], d: o, path: [...p] });
          cd = straight;
        } else if (ch === '|' || ch === '-') {
          if ((ch === '|') !== (cd % 2 === 0)) break;
        } else if (ARROWS[ch] !== undefined) {
          // arrow glyph: keep going in the same direction
        }
        cr += DIRS[cd][0]; cc += DIRS[cd][1];
      }
    }
  }

  function register(a, b, path, startHead, endHead) {
    const cells = path.map(([r, c]) => `${r},${c}`);
    const key = [a.id, b.id].sort().join('|');
    const list = connectorsByKey.get(key) ?? [];
    const dup = list.find((x) => x.cells.some((cell) => cells.includes(cell)));
    const forward = a.id < b.id;
    if (dup) {
      // same physical line discovered from the other end: merge head information
      if (dup.a === a) { dup.startHead ||= startHead; dup.endHead ||= endHead; } else { dup.startHead ||= endHead; dup.endHead ||= startHead; }
      return;
    }
    void forward;
    const conn = { a, b, startHead, endHead, cells, path };
    list.push(conn); connectorsByKey.set(key, list); conns.push(conn);
    cells.forEach((x) => usedCells.add(x));
  }

  /* ---------- 5. labels for connectors; free text ---------- */
  const tokens = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < lines[r].length) {
      if (owner[r][c] || lineChar(lines[r][c]) && /[─│┌┐└┘├┤┬┴┼═║▶▼▲◀►◄]/.test(lines[r][c]) || lines[r][c] === ' ') { c++; continue; }
      let e = c, s = '';
      while (e < lines[r].length && !owner[r][e] && !(lines[r][e] === ' ' && lines[r][e + 1] === ' ') && !/[─│┌┐└┘├┤┬┴┼═║▶▼▲◀►◄]/.test(lines[r][e])) { s += lines[r][e]; e++; }
      if (s.trim()) tokens.push({ r, c, e: e - 1, text: s.trim() });
      c = e + 1;
    }
  }
  const freeText = [];
  for (const t of tokens) {
    let best = null, bd = 99;
    for (const cn of conns) {
      for (const [pr, pc] of cn.path) {
        const dr = Math.abs(pr - t.r);
        const dc = t.c > pc ? t.c - pc : pc > t.e ? pc - t.e : 0;
        const dist = dr * 3 + dc;
        if (dr <= 1 && dc <= 3 && dist < bd) { bd = dist; best = cn; }
      }
    }
    if (best) (best.labels ??= []).push(t); else freeText.push(t);
  }

  /* ---------- 5b. quality gate ---------- */
  let ink = 0, explained = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < lines[r].length; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    ink++;
    if (owner[r][c] || usedCells.has(`${r},${c}`)) explained++;
  }
  for (const t of tokens) if (!freeText.includes(t)) explained += t.text.replace(/s/g, '').length;
  const coverage = ink ? explained / ink : 0;
  const junk = (t) => /^[|v^+-=<>*.s]+$/.test(t.text) || t.text.length < 2;
  const realFree = freeText.filter((t) => !junk(t));
  if (coverage < 0.55 || (conns.length === 0 && boxes.length < 3 && realFree.length > 4)) {
    throw new Error(`only ${Math.round(coverage * 100)}% of this drawing could be interpreted as boxes and connectors — it is a free-form layout`);
  }
  freeText.splice(0, freeText.length, ...realFree);

  /* ---------- 6. build model ---------- */
  const groups = [], nodes = [], edges = [];
  const px = (b) => ({ x: b.c1 * CW, y: b.r1 * CH, w: (b.c2 - b.c1 + 1) * CW, h: Math.max((b.r2 - b.r1 + 1) * CH, 36) });
  const toAbs = new Map();
  const ordered = [...boxes].sort((a, b) => depth(a) - depth(b));
  function depth(b) { let d = 0, p = b.parent; while (p) { d++; p = p.parent; } return d; }
  for (const b of ordered) {
    const rect = px(b);
    toAbs.set(b.id, rect);
    const par = b.parent ? toAbs.get(b.parent.id) : { x: 0, y: 0 };
    const label = textOf(b).join('\n');
    const common = { id: b.id, x: rect.x - par.x, y: rect.y - par.y, width: rect.w, height: rect.h, parentId: b.parent?.id };
    if (b.children.length) groups.push({ ...common, label });
    else nodes.push({ ...common, shape: 'rectangle', label: label || ' ', style: { fontSize: 12 } });
  }
  // free text becomes plain text nodes (inside the smallest enclosing box if any)
  freeText.forEach((t, i) => {
    const x = t.c * CW, y = t.r * CH;
    nodes.push({ id: `t${i}`, shape: 'text', label: t.text, x, y, width: Math.max(40, t.text.length * 7.2 + 8), height: 20, style: { fontSize: 12, fill: 'transparent', stroke: 'transparent' } });
  });
  for (const cn of conns) {
    let src = cn.a, dst = cn.b, sh = cn.startHead, eh = cn.endHead;
    const label = (cn.labels ?? []).sort((x, y) => x.r - y.r || x.c - y.c).map((t) => t.text).join('\n');
    // an undirected line in a top-to-bottom flow keeps its drawn orientation
    edges.push({
      id: `e${edges.length}`, source: src.id, target: dst.id, label,
      style: { arrowStart: sh ? 'arrow' : 'none', arrowEnd: eh ? 'arrow' : 'none', lineType: 'solid', routing: 'smoothstep' },
    });
  }
  if (!edges.length && boxes.length > 1) warnings.push('No connectors were detected between the boxes: this looks like a layout or table. Boxes were converted; add connectors manually if needed.');
  const unmatched = freeText.length;
  if (unmatched) warnings.push(`${unmatched} piece(s) of text outside any box were kept as free text; check their placement against the reference.`);
  if (conns.some((c) => !c.startHead && !c.endHead)) warnings.push('Some lines had no arrowheads in the source; they were converted as plain lines.');

  return { nodes, edges, groups, warnings, boxCount: boxes.length, grid: true };
}

function area(b) { return (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1); }

// Decides whether a fenced block is a diagram, and of which family.
// Normal code (c, cpp, python, json, bash, ...) is never a diagram.
// Unlabelled / "text" fences are scored: only blocks with real diagram structure pass.

const MERMAID_TYPES = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'stateDiagram',
  'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph',
  'mindmap', 'timeline', 'zenuml', 'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta',
  'architecture-beta', 'kanban', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
];

const PLAIN_LANGS = new Set(['', 'text', 'txt', 'ascii', 'plain', 'plaintext', 'diagram', 'art']);

export function detectMermaidType(src) {
  const body = src.replace(/^\s*---[\s\S]*?\n---\s*\n/, '');
  for (const l of body.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('%%')) continue;
    const word = t.split(/[\s;]/)[0];
    return MERMAID_TYPES.find((m) => m.toLowerCase() === word.toLowerCase()) ?? null;
  }
  return null;
}

// └ is deliberately excluded: tree outlines (└─ item) use it. A real box always has ┌ ┐ or ┘ too.
const BOX_CORNERS = /[┌┐┘╔╗╝]/g;
const JUNCTIONS = /[├┤┬┴┼╠╣╦╩╬]/g;
const ARROW_TOKENS = /[─━═-]{2,}[▶►>]|[◀◄<][─━═-]{2,}|-->|<--|==>|<==|[─━═]{2,}[^\s─━═▶►>◀◄<]{1,40}[─━═]{2,}[▶►>]?/g;

export function nonEmptyLines(src) {
  return src.split('\n').filter((l) => l.trim() !== '');
}

/** Lifeline-style sequence chart: several lines share `|` columns. Returns the column indexes or null. */
export function findLifelines(lines) {
  const barLines = lines
    .map((l, idx) => ({ idx, cols: [...l].map((ch, c) => (ch === '|' ? c : -1)).filter((c) => c >= 0) }))
    .filter((x) => x.cols.length >= 3);
  if (barLines.length < 4) return null;
  const freq = new Map();
  for (const b of barLines) for (const c of b.cols) freq.set(c, (freq.get(c) ?? 0) + 1);
  const cols = [...freq.entries()]
    .filter(([, n]) => n >= Math.max(4, barLines.length * 0.5))
    .map(([c]) => c)
    .sort((a, b) => a - b);
  return cols.length >= 3 ? cols : null;
}

/**
 * Score a plain (unlabelled) fence.
 * strength 'strong' => auto-extracted as a diagram. 'weak' => listed as a candidate the user can promote.
 */
export function classifyPlainBlock(src) {
  const lines = src.split('\n');
  const ne = nonEmptyLines(src);
  const no = (why, score = 0) => ({ isDiagram: false, strength: null, family: null, score, reasons: [why] });
  if (ne.length < 1) return no('empty');

  const corners = (src.match(BOX_CORNERS) ?? []).length;
  const junctions = (src.match(JUNCTIONS) ?? []).length;
  const plusBoxEdges = ne.filter((l) => /^\s*\+[-=]{4,}\+?\s*$/.test(l)).length;
  const arrowTokens = (src.match(ARROW_TOKENS) ?? []).length;
  const treeLines = ne.filter((l) => /^\s*[│ ]*[├└]─+/.test(l)).length;
  const vHeads = ne.filter((l) => /^\s*[v▼^▲](\s|$)/.test(l)).length;
  const arrowLines = ne.filter((l) => (l.match(ARROW_TOKENS) ?? []).length > 0).length;
  const barOnly = ne.filter((l) => /^\s*[|│]\s*$/.test(l)).length;
  const barLabelled = ne.filter((l) => /^\s*[|│]\s{2,}\S/.test(l)).length;

  // negative signals: prose lists, checklists, logs
  const listy = ne.filter((l) => /^\s*(\[[ xX]\]|- \[[ xX]\]|☐|☑|[-*•]\s|\d+[.)]\s)/.test(l)).length;
  const logs = ne.filter((l) => /^\s*\[\d{4}-\d{2}-\d{2}/.test(l)).length;
  const neg = (listy + logs) / ne.length;

  const lifelines = findLifelines(lines);
  const seqArrows = ne.filter((l) => /\|\s*<?-{2,}/.test(l)).length;
  if (lifelines && seqArrows >= 3) {
    return { isDiagram: true, strength: 'strong', family: 'ascii-sequence', score: 90, reasons: [`${lifelines.length} lifelines, ${seqArrows} message lines`] };
  }
  if (corners >= 3) {
    return { isDiagram: true, strength: 'strong', family: 'ascii-boxes', score: 90, reasons: [`${corners} corners, ${junctions} junctions`] };
  }
  if (plusBoxEdges >= 2) {
    return { isDiagram: true, strength: 'strong', family: 'ascii-boxes', score: 85, reasons: [`${plusBoxEdges} +---+ box edges`] };
  }
  if (treeLines >= 3) {
    return { isDiagram: true, strength: 'weak', family: 'ascii-tree', score: 40, reasons: [`${treeLines} tree branches — outline, extracted only on request`] };
  }
  if (vHeads >= 1 && barOnly + barLabelled >= 2 && neg < 0.4) {
    return { isDiagram: true, strength: 'strong', family: 'ascii-tiers', score: 75, reasons: [`${vHeads} arrow heads, ${barOnly + barLabelled} connector lines`] };
  }
  if (arrowTokens >= 2 && neg < 0.4 && arrowLines / ne.length >= 0.3) {
    return { isDiagram: true, strength: 'strong', family: 'ascii-chain', score: 65, reasons: [`${arrowTokens} horizontal arrows`] };
  }
  if (arrowTokens >= 2 && neg < 0.3) {
    return { isDiagram: true, strength: 'weak', family: 'ascii-chain', score: 45, reasons: [`${arrowTokens} horizontal arrows in a long block`] };
  }
  return no(`no diagram structure (corners=${corners}, arrows=${arrowTokens}, bars=${barOnly + barLabelled}, lists=${listy}, logs=${logs})`, Math.min(30, arrowTokens * 5));
}

/**
 * Classify a scanned block.
 * @returns {{ kind: 'mermaid'|'ascii'|'candidate'|'code'|'text', family?: string, mermaidType?: string, score?: number, reasons: string[] }}
 */
export function classifyBlock(block) {
  const lang = block.lang;
  if (lang === 'mermaid' || lang === 'mmd') {
    return { kind: 'mermaid', mermaidType: detectMermaidType(block.content), reasons: ['```mermaid fence'] };
  }
  if (!PLAIN_LANGS.has(lang)) return { kind: 'code', reasons: [`language "${lang}"`] };

  const first = detectMermaidType(block.content);
  if (first && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/.test(block.content.trim())) {
    return { kind: 'mermaid', mermaidType: first, reasons: ['unlabelled fence starting with a Mermaid keyword'] };
  }
  const r = classifyPlainBlock(block.content);
  if (r.isDiagram && r.strength === 'strong') return { kind: 'ascii', family: r.family, score: r.score, reasons: r.reasons };
  if (r.isDiagram) return { kind: 'candidate', family: r.family, score: r.score, reasons: r.reasons };
  return { kind: 'text', score: r.score, reasons: r.reasons };
}

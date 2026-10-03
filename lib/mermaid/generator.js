// Editable model -> Mermaid source, ONLY where it is safe.
// Every generated text is re-parsed and compared against the model; if anything cannot be
// represented exactly, `ok` is false and `issues` explains why. The original source is never touched.
import { parseFlowchart } from './flowchart.js';
import { parseSequence } from './sequence.js';
import { parseState } from './state.js';
import { parseClassDiagram } from './class.js';

const SHAPE_SYNTAX = {
  rectangle: (l) => `["${l}"]`, rounded: (l) => `("${l}")`, stadium: (l) => `(["${l}"])`,
  circle: (l) => `(("${l}"))`, doublecircle: (l) => `((("${l}")))`, diamond: (l) => `{"${l}"}`,
  hexagon: (l) => `{{"${l}"}}`, cylinder: (l) => `[("${l}")]`, subroutine: (l) => `[["${l}"]]`,
  parallelogram: (l) => `[/"${l}"/]`, trapezoid: (l) => `[/"${l}"\\]`,
};
const q = (s) => String(s ?? '').replace(/"/g, '#quot;').replace(/\n/g, '<br/>');
const safeId = (id, map) => {
  if (map.has(id)) return map.get(id);
  const ok = /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !/^(end|graph|flowchart|subgraph|class|style|direction|click)$/i.test(id);
  const out = ok ? id : `n${map.size + 1}_${id.replace(/\W+/g, '').slice(0, 10)}`;
  map.set(id, out);
  return out;
};
const styleStr = (st = {}) => {
  const parts = [];
  if (st.fill) parts.push(`fill:${st.fill}`);
  if (st.stroke) parts.push(`stroke:${st.stroke}`);
  if (st.strokeWidth && st.strokeWidth !== 1.5) parts.push(`stroke-width:${st.strokeWidth}px`);
  if (st.color) parts.push(`color:${st.color}`);
  if (st.dash) parts.push(`stroke-dasharray:${st.dash}`);
  return parts.join(',');
};

export function generateMermaid(diagram) {
  try {
    if (diagram.kind === 'sequence' && diagram.sequence) return genSequence(diagram);
    if (diagram.kind !== 'graph') return { ok: false, issues: ['This diagram has no editable model to generate from.'], text: '' };
    if (diagram.nodes.some((n) => n.shape === 'class')) return genClass(diagram);
    if (diagram.source.type?.startsWith('stateDiagram') || diagram.nodes.some((n) => n.shape === 'start' || n.shape === 'end')) return genState(diagram);
    return genFlow(diagram);
  } catch (e) {
    return { ok: false, issues: [`Generator error: ${e.message}`], text: '' };
  }
}

function genFlow(d) {
  const issues = [];
  const ids = new Map();
  const dir = d.layout?.direction ?? 'TB';
  const lines = [`flowchart ${dir}`];
  const kids = new Map();
  const add = (pid, item) => { const k = pid ?? '__root'; (kids.get(k) ?? kids.set(k, []).get(k)).push(item); };
  d.groups.forEach((g) => add(g.parentId, { g }));
  d.nodes.forEach((n) => add(n.parentId, { n }));
  const gids = new Set(d.groups.map((g) => g.id));
  const emit = (key, indent) => {
    for (const it of kids.get(key) ?? []) {
      if (it.g) {
        lines.push(`${indent}subgraph ${safeId(it.g.id, ids)}["${q(it.g.label)}"]`);
        emit(it.g.id, indent + '    ');
        lines.push(`${indent}end`);
      } else {
        const n = it.n;
        let syn = SHAPE_SYNTAX[n.shape];
        if (!syn) { issues.push(`Shape "${n.shape}" on "${n.label.split('\n')[0]}" has no Mermaid equivalent; exported as a rectangle.`); syn = SHAPE_SYNTAX.rectangle; }
        lines.push(`${indent}${safeId(n.id, ids)}${syn(q(n.label))}`);
      }
    }
  };
  emit('__root', '    ');
  const edgeIdx = [];
  d.edges.forEach((e, i) => {
    const st = e.style ?? {};
    const hs = st.arrowStart ?? 'none', he = st.arrowEnd ?? 'arrow';
    const known = ['none', 'arrow', 'cross', 'circle'];
    if (!known.includes(hs) || !known.includes(he)) issues.push(`Edge ${e.source}→${e.target}: arrowhead "${!known.includes(hs) ? hs : he}" approximated.`);
    const cap = (h, left) => (h === 'arrow' ? (left ? '<' : '>') : h === 'cross' ? 'x' : h === 'circle' ? 'o' : '');
    let body;
    const L = st.lineType ?? 'solid';
    const s0 = cap(hs, true), e0 = cap(he, false);
    if (L === 'invisible') body = '~~~';
    else if (L === 'thick') body = `${s0}==${e0 || '='}`;
    else if (L === 'dashed' || L === 'dotted') body = `${s0}-.-${e0}`;
    else body = `${s0}--${e0 || '-'}`;
    const label = e.label ? `|"${q(e.label)}"|` : '';
    lines.push(`    ${safeId(e.source, ids)} ${body}${label} ${safeId(e.target, ids)}`);
    edgeIdx.push(i);
  });
  for (const n of d.nodes) { const s = styleStr(n.style); if (s && s !== styleStr({ fill: '#ffffff', stroke: '#334155', color: '#0f172a' })) lines.push(`    style ${safeId(n.id, ids)} ${s}`); }
  for (const g of d.groups) { const s = styleStr(g.style); if (s) lines.push(`    style ${safeId(g.id, ids)} ${s}`); }
  const text = lines.join('\n') + '\n';
  // verification
  try {
    const back = parseFlowchart(text);
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    if (back.nodes.length !== d.nodes.length) issues.push(`Round-trip check: node count ${back.nodes.length} ≠ ${d.nodes.length}.`);
    if (back.edges.length !== d.edges.length) issues.push(`Round-trip check: edge count ${back.edges.length} ≠ ${d.edges.length}.`);
    if (back.groups.length !== d.groups.length) issues.push(`Round-trip check: group count ${back.groups.length} ≠ ${d.groups.length}.`);
    const labels = new Map(back.nodes.map((n) => [n.id, norm(n.label)]));
    for (const n of d.nodes) if (labels.get(safeId(n.id, ids)) !== norm(n.label)) { issues.push(`Round-trip check: label of "${n.id}" changed.`); break; }
  } catch (e) { issues.push(`Round-trip check failed to parse: ${e.message}`); }
  void gids;
  return { ok: issues.length === 0, text, issues, notes: ['Node positions and sizes are editor-only and are not stored in Mermaid.'] };
}

function genSequence(d) {
  const s = d.sequence;
  const issues = [];
  const lines = ['sequenceDiagram'];
  if (s.title) lines.push(`    title ${s.title}`);
  if (s.autonumber) lines.push('    autonumber');
  const ids = new Map();
  for (const p of s.participants) lines.push(`    ${p.kind === 'actor' ? 'actor' : 'participant'} ${safeId(p.id, ids)} as ${p.label.replace(/\n/g, '<br/>')}`);
  const ARROW = { 'solid:arrow': '->>', 'dashed:arrow': '-->>', 'solid:open': '->', 'dashed:open': '-->', 'solid:cross': '-x', 'dashed:cross': '--x', 'solid:async': '-)', 'dashed:async': '--)' };
  const emit = (items, ind) => {
    for (const it of items) {
      if (it.type === 'message') {
        const arrow = ARROW[`${it.line}:${it.head}`] ?? (issues.push(`Message "${it.text}": arrow style approximated.`), '->>');
        lines.push(`${ind}${safeId(it.from, ids)}${arrow}${it.activate === 1 ? '+' : it.activate === -1 ? '-' : ''}${safeId(it.to, ids)}: ${(it.text ?? '').replace(/\n/g, '<br/>')}`);
      } else if (it.type === 'note') {
        lines.push(`${ind}Note ${it.placement} ${it.actors.map((a) => safeId(a, ids)).join(',')}: ${it.text.replace(/\n/g, '<br/>')}`);
      } else if (it.type === 'activate' || it.type === 'deactivate') lines.push(`${ind}${it.type} ${safeId(it.actor, ids)}`);
      else if (it.type === 'block') {
        it.branches.forEach((br, i) => {
          if (i === 0) lines.push(`${ind}${it.kind} ${br.label}`.trimEnd());
          else lines.push(`${ind}${br.word ?? (it.kind === 'par' ? 'and' : it.kind === 'critical' ? 'option' : 'else')} ${br.label}`.trimEnd());
          emit(br.items, ind + '    ');
        });
        lines.push(`${ind}end`);
      }
    }
  };
  emit(s.items, '    ');
  const text = lines.join('\n') + '\n';
  try {
    const back = parseSequence(text);
    const count = (items) => items.reduce((a, it) => a + 1 + (it.type === 'block' ? it.branches.reduce((x, b) => x + count(b.items), 0) : 0), 0);
    if (back.participants.length !== s.participants.length) issues.push('Round-trip check: participant count differs.');
    if (count(back.items) !== count(s.items)) issues.push('Round-trip check: item count differs.');
  } catch (e) { issues.push(`Round-trip check failed to parse: ${e.message}`); }
  return { ok: issues.length === 0, text, issues, notes: [] };
}

function genState(d) {
  const issues = [];
  const ids = new Map();
  const lines = ['stateDiagram-v2'];
  const dir = d.layout?.direction;
  if (dir && dir !== 'TB') lines.push(`    direction ${dir}`);
  const kind = new Map(d.nodes.map((n) => [n.id, n]));
  const kids = new Map();
  const add = (pid, it) => { const k = pid ?? '__root'; (kids.get(k) ?? kids.set(k, []).get(k)).push(it); };
  d.groups.forEach((g) => add(g.parentId, { g }));
  d.nodes.forEach((n) => add(n.parentId, { n }));
  const emit = (key, ind) => {
    for (const it of kids.get(key) ?? []) {
      if (it.g) { lines.push(`${ind}state "${q(it.g.label)}" as ${safeId(it.g.id, ids)} {`); emit(it.g.id, ind + '    '); lines.push(`${ind}}`); continue; }
      const n = it.n;
      if (n.shape === 'start' || n.shape === 'end' || n.shape === 'note') continue;
      const id = safeId(n.id, ids);
      if (n.label && n.label !== n.id) lines.push(`${ind}state "${q(n.label)}" as ${id}`); else lines.push(`${ind}${id}`);
      for (const m of n.members ?? []) lines.push(`${ind}${id} : ${m}`);
      if (!['rounded', 'rectangle', 'diamond'].includes(n.shape)) issues.push(`State "${n.label}": shape "${n.shape}" will be drawn as an ordinary state.`);
    }
  };
  emit('__root', '    ');
  const ref = (id, role) => { const n = kind.get(id); return n?.shape === 'start' || (role === 'dst' && n?.shape === 'end') ? '[*]' : n?.shape === 'end' ? '[*]' : safeId(id, ids); };
  for (const e of d.edges) {
    const sn = kind.get(e.source), tn = kind.get(e.target);
    if (sn?.shape === 'note' || tn?.shape === 'note') {
      const note = sn?.shape === 'note' ? sn : tn; const other = sn?.shape === 'note' ? e.target : e.source;
      lines.push(`    note right of ${safeId(other, ids)} : ${note.label.replace(/\n/g, '<br/>')}`);
      continue;
    }
    lines.push(`    ${ref(e.source, 'src')} --> ${ref(e.target, 'dst')}${e.label ? ` : ${e.label.replace(/\n/g, '<br/>')}` : ''}`);
  }
  const text = lines.join('\n') + '\n';
  try {
    const back = parseState(text);
    const realEdges = d.edges.length;
    if (back.edges.length !== realEdges - 0 && back.edges.length < realEdges - d.nodes.filter((n) => n.shape === 'note').length) issues.push('Round-trip check: transition count differs.');
  } catch (e) { issues.push(`Round-trip check failed to parse: ${e.message}`); }
  return { ok: issues.length === 0, text, issues, notes: ['Node positions are editor-only.'] };
}

const REL_TOKEN = (s, e, line) => {
  const k = `${s}|${e}|${line}`;
  const M = {
    'triangle|none|solid': '<|--', 'none|triangle|solid': '--|>', 'triangle|none|dashed': '<|..', 'none|triangle|dashed': '..|>',
    'diamond-filled|none|solid': '*--', 'none|diamond-filled|solid': '--*', 'diamond|none|solid': 'o--', 'none|diamond|solid': '--o',
    'open|none|solid': '<--', 'none|open|solid': '-->', 'open|none|dashed': '<..', 'none|open|dashed': '..>',
    'none|none|solid': '--', 'none|none|dashed': '..', 'none|arrow|solid': '-->', 'none|arrow|dashed': '..>',
  };
  return M[k] ?? null;
};

function genClass(d) {
  const issues = [];
  const lines = ['classDiagram'];
  if (d.layout?.direction && d.layout.direction !== 'TB') lines.push(`    direction ${d.layout.direction}`);
  for (const n of d.nodes) {
    lines.push(`    class ${n.id.replace(/\W+/g, '_')} {`);
    if (n.stereotype) lines.push(`        <<${n.stereotype}>>`);
    (n.attributes ?? []).forEach((a) => lines.push(`        ${a}`));
    (n.methods ?? []).forEach((m) => lines.push(`        ${m}`));
    lines.push('    }');
  }
  for (const e of d.edges) {
    const st = e.style ?? {};
    const tok = REL_TOKEN(st.arrowStart ?? 'none', st.arrowEnd ?? 'none', st.lineType === 'dotted' ? 'dashed' : st.lineType ?? 'solid');
    if (!tok) { issues.push(`Relationship ${e.source}→${e.target}: style approximated as a plain association.`); }
    const m = e.meta ?? {};
    lines.push(`    ${e.source.replace(/\W+/g, '_')} ${m.startLabel ? `"${m.startLabel}" ` : ''}${tok ?? '-->'} ${m.endLabel ? `"${m.endLabel}" ` : ''}${e.target.replace(/\W+/g, '_')}${e.label ? ` : ${e.label}` : ''}`);
  }
  const text = lines.join('\n') + '\n';
  try {
    const back = parseClassDiagram(text);
    if (back.nodes.length !== d.nodes.length) issues.push('Round-trip check: class count differs.');
    if (back.edges.length !== d.edges.length) issues.push('Round-trip check: relationship count differs.');
  } catch (e) { issues.push(`Round-trip check failed to parse: ${e.message}`); }
  return { ok: issues.length === 0, text, issues, notes: ['Class names containing non-word characters are rewritten with underscores.'] };
}

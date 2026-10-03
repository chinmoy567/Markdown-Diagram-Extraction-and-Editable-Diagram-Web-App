// Mermaid sequenceDiagram -> sequence IR.
// IR: { participants: [{id,label,kind}], items: Item[] }
// Item = message | note | block | activate | deactivate
//   message: { type:'message', from, to, text, line:'solid'|'dashed', head:'arrow'|'open'|'cross'|'async'|'none', activate?: 1|-1 }
//   note:    { type:'note', placement:'over'|'left of'|'right of', actors:[id], text }
//   block:   { type:'block', kind:'loop'|'alt'|'opt'|'par'|'critical'|'break'|'rect', branches:[{ label, items }] }
import { cleanLabel, logicalLines, ParseResult } from './common.js';

const BLOCKS = { loop: 'loop', alt: 'alt', opt: 'opt', par: 'par', critical: 'critical', break: 'break', rect: 'rect' };
const BRANCH_WORD = { alt: 'else', par: 'and', critical: 'option' };

// Arrow tokens, longest first.
const ARROWS = [
  ['-->>', 'dashed', 'arrow'], ['->>', 'solid', 'arrow'],
  ['--x', 'dashed', 'cross'], ['-x', 'solid', 'cross'],
  ['--)', 'dashed', 'async'], ['-)', 'solid', 'async'],
  ['-->', 'dashed', 'open'], ['->', 'solid', 'open'],
  ['<<-->>', 'dashed', 'arrow'], ['<<->>', 'solid', 'arrow'],
];

export function parseSequence(src) {
  const res = new ParseResult('sequence');
  const lines = logicalLines(src);
  if (!/^\s*sequenceDiagram\s*$/.test(lines[0]?.text ?? '')) throw new Error('Expected "sequenceDiagram" on the first line');

  const participants = new Map();
  let autonumber = false;
  let title = '';
  const root = { items: [] };
  const stack = [{ kind: 'root', branches: [root] }];
  const top = () => stack[stack.length - 1];
  const items = () => top().branches[top().branches.length - 1].items;

  const addP = (id, label, kind = 'participant') => {
    id = id.trim();
    if (!participants.has(id)) participants.set(id, { id, label: label ?? id, kind });
    else if (label != null) { const p = participants.get(id); p.label = label; p.kind = kind; }
  };

  for (let i = 1; i < lines.length; i++) {
    const { text, line } = lines[i];
    const t = text.trim().replace(/;+$/, '');
    let m;

    if ((m = /^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/.exec(t))) { addP(m[2], m[3] ? cleanLabel(m[3]) : undefined, m[1]); continue; }
    if (/^autonumber\b/.test(t)) { autonumber = true; continue; }
    if ((m = /^title\s*:?\s*(.+)$/.exec(t))) { title = cleanLabel(m[1]); continue; }
    if ((m = /^(activate|deactivate)\s+(\S+)$/.exec(t))) { addP(m[2]); items().push({ type: m[1], actor: m[2] }); continue; }
    if (/^(create|destroy|box|end box|link|links|properties)\b/.test(t) && !/^end$/.test(t)) {
      res.warn(`line ${line}: "${t.split(/\s/)[0]}" is not editable yet and was ignored (kept in original source)`);
      continue;
    }

    if ((m = /^note\s+(over|left of|right of)\s+([^:]+?)\s*:\s*(.*)$/i.exec(t))) {
      const actors = m[2].split(',').map((a) => a.trim());
      actors.forEach((a) => addP(a));
      items().push({ type: 'note', placement: m[1].toLowerCase(), actors, text: cleanLabel(m[3]) });
      continue;
    }

    if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/.exec(t)) && BLOCKS[m[1]]) {
      const block = { type: 'block', kind: m[1], branches: [{ label: m[1] === 'rect' ? '' : cleanLabel(m[2]), items: [] }] };
      items().push(block);
      stack.push(block);
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(t))) {
      const cur = top();
      if (cur.kind === 'root' || BRANCH_WORD[cur.kind] !== m[1]) { res.warn(`line ${line}: "${m[1]}" outside a matching block`); continue; }
      cur.branches.push({ label: cleanLabel(m[2]), items: [], word: m[1] });
      continue;
    }
    if (t === 'end') {
      if (stack.length === 1) res.warn(`line ${line}: unmatched "end"`); else stack.pop();
      continue;
    }

    // message:  A ->> B: text    (optional +/- activation marker before the target)
    const msg = parseMessage(t);
    if (msg) {
      addP(msg.from); addP(msg.to);
      items().push({ type: 'message', ...msg.item });
      continue;
    }
    res.warn(`line ${line}: unsupported statement "${t.slice(0, 50)}" skipped`);
  }
  if (stack.length > 1) res.warn(`${stack.length - 1} block(s) not closed with "end"`);

  return { ...res, participants: [...participants.values()], items: root.items, autonumber, title };
}

function parseMessage(t) {
  // find the earliest arrow token outside quotes
  let best = null;
  for (const [tok, line, head] of ARROWS) {
    const idx = t.indexOf(tok);
    if (idx > 0 && (!best || idx < best.idx || (idx === best.idx && tok.length > best.tok.length))) best = { idx, tok, line, head };
  }
  if (!best) return null;
  const from = t.slice(0, best.idx).trim();
  let rest = t.slice(best.idx + best.tok.length);
  let activate;
  if (rest.startsWith('+')) { activate = 1; rest = rest.slice(1); }
  else if (rest.startsWith('-')) { activate = -1; rest = rest.slice(1); }
  const colon = rest.indexOf(':');
  const to = (colon < 0 ? rest : rest.slice(0, colon)).trim();
  const text = colon < 0 ? '' : cleanLabel(rest.slice(colon + 1));
  if (!from || !to || /\s/.test(from) || /\s/.test(to)) return null;
  return { from, to, item: { from, to, text, line: best.line, head: best.head, ...(activate ? { activate } : {}) } };
}

// ASCII lifeline charts:   name   name   name  /  |  |  |  /  |--msg-->|  ...  ->  sequence model.
import { findLifelines } from '../markdown/detector.js';

export function convertAsciiSequence(content) {
  const warnings = [];
  const lines = content.replace(/\t/g, '    ').split('\n');
  const cols = findLifelines(lines);
  if (!cols) throw new Error('No lifelines found');

  // header: the last non-blank line before the first line that has >= 3 bars
  const firstBar = lines.findIndex((l) => cols.filter((c) => l[c] === '|').length >= Math.max(2, cols.length - 1));
  let headerLine = '';
  for (let i = firstBar - 1; i >= 0; i--) if (lines[i].trim()) { headerLine = lines[i]; break; }
  const toks = [];
  const re = /\S+(?: \S+)*/g;
  let m;
  while ((m = re.exec(headerLine))) toks.push({ text: m[0], s: m.index, e: m.index + m[0].length - 1 });
  const participants = cols.map((c, i) => {
    let best = null, bd = 1e9;
    for (const t of toks) {
      const d = c >= t.s && c <= t.e ? 0 : Math.min(Math.abs(c - t.s), Math.abs(c - t.e));
      if (d < bd) { bd = d; best = t; }
    }
    const label = best && bd <= 12 ? best.text : `Participant ${i + 1}`;
    return { id: `P${i + 1}`, label, kind: 'participant' };
  });
  if (new Set(participants.map((p) => p.label)).size !== participants.length) warnings.push('Some participant names could not be matched to lifelines unambiguously.');

  const idxOfCol = new Map(cols.map((c, i) => [c, i]));
  const items = [];
  let skipped = 0;
  const lastCol = cols[cols.length - 1];
  for (let li = firstBar < 0 ? 0 : firstBar; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const bars = cols.filter((c) => line[c] === '|');
    const stripped = line.replace(/[|\s]/g, '');
    if (!stripped) continue;                                    // pure lifeline spacer
    // arrow start: a lifeline whose next char begins an arrow ('-' or '<')
    let start = -1;
    for (const c of cols) if (line[c] === '|' && (line[c + 1] === '-' || (line[c + 1] === '<' && line[c + 2] === '-'))) { start = c; break; }
    if (start < 0) {
      // free text beside lifelines => note
      const t = line.replace(/\|/g, ' ').trim();
      const near = [...bars].reverse().find((c) => c < line.indexOf(t)) ?? cols[0];
      if (t) items.push({ type: 'note', placement: 'right of', actors: [participants[idxOfCol.get(near)].id], text: t });
      else skipped++;
      continue;
    }
    const nextBar = cols.find((c) => c > start && line[c] === '|');
    const bodyEnd = nextBar ?? line.length;
    let body = line.slice(start + 1, nextBar != null ? nextBar : bodyEnd);
    const leftHead = body.startsWith('<');
    const rightHead = /[>]\s*$/.test(body);
    const text = body.replace(/^<?-+/, '').replace(/-*>?\s*$/, '').replace(/^-+|-+$/g, '').trim();
    const fromIdx = idxOfCol.get(start);
    let item;
    if (nextBar == null || (!leftHead && !rightHead)) {
      // no head: message to self
      item = { type: 'message', from: participants[fromIdx].id, to: participants[fromIdx].id, text: text || body.replace(/-/g, '').trim(), line: 'solid', head: 'arrow' };
    } else if (leftHead) {
      item = { type: 'message', from: participants[idxOfCol.get(nextBar)].id, to: participants[fromIdx].id, text, line: 'dashed', head: 'arrow' };
    } else {
      item = { type: 'message', from: participants[fromIdx].id, to: participants[idxOfCol.get(nextBar)].id, text, line: 'solid', head: 'arrow' };
    }
    items.push(item);
    // trailing annotation after the last bar on this line
    const lastB = Math.max(...bars, nextBar ?? -1);
    const trailing = line.slice(lastB + 1).trim();
    if (trailing && lastB >= 0 && nextBar != null && lastB === nextBar && trailing.replace(/[-<>]/g, '')) {
      items.push({ type: 'note', placement: 'right of', actors: [participants[idxOfCol.get(lastB)].id], text: trailing.replace(/^\(|\)$/g, '') });
    } else if (nextBar == null) {
      // self message: annotation sits after the text, beyond a gap
      const afterText = line.slice(start + 1).replace(/^-+/, '');
      const gap = /\s{3,}(\S.*)$/.exec(afterText);
      if (gap && !gap[1].startsWith('|')) items.push({ type: 'note', placement: 'right of', actors: [participants[fromIdx].id], text: gap[1].replace(/\|/g, '').trim() });
    }
    if (nextBar != null && lastCol && line.slice(nextBar + 1).includes('|') === false) { /* ok */ }
  }
  if (skipped) warnings.push(`${skipped} line(s) were not understood and skipped.`);
  items.forEach((it, i) => { it.id = `s${i}`; });
  // clean message text artefacts
  for (const it of items) if (it.type === 'message') it.text = it.text.replace(/\s{2,}.*$/, (x) => x).replace(/\s+\|.*$/, '').trim();
  return { sequence: { participants, items, autonumber: false, title: '' }, warnings };
}

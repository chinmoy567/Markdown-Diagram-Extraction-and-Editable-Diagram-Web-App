// Mermaid classDiagram -> graph IR with `class` nodes (name, stereotype, attributes, methods).
import { cleanLabel, logicalLines, ParseResult } from './common.js';

// relationship tokens: left-marker, line, right-marker
const REL = /^(<\|--|\*--|o--|<--|-->|--\*|--o|--\|>|\.\.\|>|<\|\.\.|<\.\.|\.\.>|--|\.\.)$/;
const REL_SPLIT = /\s*(<\|--|<\|\.\.|\*--|o--|--\*|--o|--\|>|\.\.\|>|<--|-->|<\.\.|\.\.>|--|\.\.)\s*/;

const MARKERS = {
  '<|--': { start: 'triangle', end: 'none', line: 'solid' },
  '--|>': { start: 'none', end: 'triangle', line: 'solid' },
  '<|..': { start: 'triangle', end: 'none', line: 'dashed' },
  '..|>': { start: 'none', end: 'triangle', line: 'dashed' },
  '*--': { start: 'diamond-filled', end: 'none', line: 'solid' },
  '--*': { start: 'none', end: 'diamond-filled', line: 'solid' },
  'o--': { start: 'diamond', end: 'none', line: 'solid' },
  '--o': { start: 'none', end: 'diamond', line: 'solid' },
  '<--': { start: 'open', end: 'none', line: 'solid' },
  '-->': { start: 'none', end: 'open', line: 'solid' },
  '<..': { start: 'open', end: 'none', line: 'dashed' },
  '..>': { start: 'none', end: 'open', line: 'dashed' },
  '--': { start: 'none', end: 'none', line: 'solid' },
  '..': { start: 'none', end: 'none', line: 'dashed' },
};

export function parseClassDiagram(src) {
  const res = new ParseResult('class');
  const lines = logicalLines(src);
  if (!/^\s*classDiagram(-v2)?\s*$/.test(lines[0]?.text ?? '')) throw new Error('Expected "classDiagram" on the first line');

  const classes = new Map();
  const edges = [];
  let direction = 'TB';

  const ensure = (name) => {
    name = name.trim().replace(/~(.+)~/, '<$1>');
    if (!classes.has(name)) classes.set(name, { id: name, shape: 'class', label: name, stereotype: '', attributes: [], methods: [], classes: [], style: {} });
    return classes.get(name);
  };
  const addMember = (cls, text) => {
    text = text.trim();
    if (!text) return;
    const ann = /^<<(.*)>>$/.exec(text);
    if (ann) { cls.stereotype = ann[1]; return; }
    (text.includes('(') ? cls.methods : cls.attributes).push(text.replace(/~(.+?)~/g, '<$1>'));
  };

  for (let i = 1; i < lines.length; i++) {
    const { text, line } = lines[i];
    const t = text.trim().replace(/;+$/, '');
    let m;
    if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) { direction = m[1].toUpperCase().replace('TD', 'TB'); continue; }

    if ((m = /^class\s+([^\s{]+)(?:\s*\["([^"]+)"\])?\s*\{\s*$/.exec(t))) {
      const c = ensure(m[1]);
      if (m[2]) c.label = m[2];
      while (++i < lines.length && lines[i].text.trim() !== '}') addMember(c, lines[i].text);
      if (i >= lines.length) res.warn(`class "${m[1]}" body not closed with "}"`);
      continue;
    }
    if ((m = /^class\s+([^\s{]+)(?:\s*\["([^"]+)"\])?$/.exec(t))) { const c = ensure(m[1]); if (m[2]) c.label = m[2]; continue; }
    if ((m = /^<<(.+)>>\s+(\S+)$/.exec(t))) { ensure(m[2]).stereotype = m[1]; continue; }

    // relation:  [A] ["card"] <|-- ["card"] [B] [: label]
    const rel = /^(\S+?)\s*(?:"([^"]*)")?\s*(<\|--|<\|\.\.|\*--|o--|--\*|--o|--\|>|\.\.\|>|<--|-->|<\.\.|\.\.>|--|\.\.)\s*(?:"([^"]*)")?\s*(\S+?)\s*(?::\s*(.*))?$/.exec(t);
    if (rel && MARKERS[rel[3]]) {
      const mk = MARKERS[rel[3]];
      ensure(rel[1]); ensure(rel[5]);
      edges.push({
        source: rel[1].replace(/~(.+)~/, '<$1>'), target: rel[5].replace(/~(.+)~/, '<$1>'),
        label: cleanLabel(rel[6] ?? ''), startLabel: rel[2] ?? '', endLabel: rel[4] ?? '',
        lineType: mk.line, arrowStart: mk.start, arrowEnd: mk.end, line,
      });
      continue;
    }
    // member:  Name : member
    if ((m = /^([^\s:]+)\s*:\s*(.+)$/.exec(t))) { addMember(ensure(m[1]), m[2]); continue; }
    if (/^(note|link|click|callback|style|classDef|cssClass)\b/.test(t)) { res.warn(`line ${line}: "${t.split(/\s/)[0]}" ignored (kept in original source)`); continue; }
    res.warn(`line ${line}: unsupported statement "${t.slice(0, 50)}" skipped`);
  }

  return { ...res, direction, nodes: [...classes.values()], groups: [], edges };
}

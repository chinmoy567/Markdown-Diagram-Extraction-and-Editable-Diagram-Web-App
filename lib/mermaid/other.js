// erDiagram and mindmap parsers (same graph IR). Remaining Mermaid types are
// reported as "reference only" by converter.js — we never fake a conversion.
import { cleanLabel, logicalLines, ParseResult } from './common.js';

const ER_CARD = { '||': '1', '|o': '0..1', 'o|': '0..1', '}|': '1..*', '|{': '1..*', '}o': '0..*', 'o{': '0..*' };

export function parseEr(src) {
  const res = new ParseResult('er');
  const lines = logicalLines(src);
  if (!/^\s*erDiagram\s*$/.test(lines[0]?.text ?? '')) throw new Error('Expected "erDiagram" on the first line');
  const ents = new Map();
  const edges = [];
  const ensure = (n) => {
    n = n.trim().replace(/^"|"$/g, '');
    if (!ents.has(n)) ents.set(n, { id: n, shape: 'class', label: n, stereotype: '', attributes: [], methods: [], classes: [], style: {} });
    return ents.get(n);
  };
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].text.trim();
    let m;
    if ((m = /^("[^"]+"|[\w-]+)\s*\{$/.exec(t))) {
      const e = ensure(m[1]);
      while (++i < lines.length && lines[i].text.trim() !== '}') e.attributes.push(lines[i].text.trim().replace(/\s+/g, ' '));
      continue;
    }
    if ((m = /^("[^"]+"|[\w-]+)\s+([|o}][|o{}]|[|o}][|{o])(--|\.\.)([|o{][|o]|[|{o][|o}])\s+("[^"]+"|[\w-]+)\s*:\s*(.*)$/.exec(t))
      || (m = /^("[^"]+"|[\w-]+)\s+(\S{2})(--|\.\.)(\S{2})\s+("[^"]+"|[\w-]+)\s*:\s*(.*)$/.exec(t))) {
      ensure(m[1]); ensure(m[5]);
      edges.push({
        source: m[1].replace(/"/g, ''), target: m[5].replace(/"/g, ''), label: cleanLabel(m[6]),
        startLabel: ER_CARD[m[2]] ?? m[2], endLabel: ER_CARD[m[4]] ?? m[4],
        lineType: m[3] === '..' ? 'dashed' : 'solid', arrowStart: 'none', arrowEnd: 'none',
      });
      continue;
    }
    if ((m = /^("[^"]+"|[\w-]+)$/.exec(t))) { ensure(m[1]); continue; }
    res.warn(`line ${lines[i].line}: unsupported statement "${t.slice(0, 50)}" skipped`);
  }
  return { ...res, direction: 'LR', nodes: [...ents.values()], groups: [], edges };
}

export function parseMindmap(src) {
  const res = new ParseResult('mindmap');
  const lines = logicalLines(src);
  if (!/^\s*mindmap\s*$/.test(lines[0]?.text ?? '')) throw new Error('Expected "mindmap" on the first line');
  const nodes = [], edges = [];
  const stack = []; // {indent,id}
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].text.replace(/\t/g, '    ');
    const indent = raw.length - raw.trimStart().length;
    let t = raw.trim();
    if (/^::icon\(|^:::/.test(t)) continue;
    let shape = 'rounded', label = t;
    let m;
    if ((m = /^[\w-]*\(\((.*)\)\)$/.exec(t))) { shape = 'circle'; label = m[1]; }
    else if ((m = /^[\w-]*\)(.*)\($/.exec(t))) { shape = 'cloud'; label = m[1]; }
    else if ((m = /^[\w-]*\{\{(.*)\}\}$/.exec(t))) { shape = 'hexagon'; label = m[1]; }
    else if ((m = /^[\w-]*\[(.*)\]$/.exec(t))) { shape = 'rectangle'; label = m[1]; }
    else if ((m = /^[\w-]*\((.*)\)$/.exec(t))) { shape = 'rounded'; label = m[1]; }
    const id = `m${n++}`;
    nodes.push({ id, shape, label: cleanLabel(label), classes: [], style: {} });
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) edges.push({ source: stack[stack.length - 1].id, target: id, label: '', lineType: 'solid', arrowStart: 'none', arrowEnd: 'none' });
    stack.push({ indent, id });
  }
  return { ...res, direction: 'LR', nodes, groups: [], edges };
}

// Mermaid stateDiagram / stateDiagram-v2 -> graph IR (same shape as the flowchart IR).
import { cleanLabel, logicalLines, parseStyleProps, ParseResult } from './common.js';

export function parseState(src) {
  const res = new ParseResult('state');
  const lines = logicalLines(src);
  const head = /^\s*stateDiagram(?:-v2)?\s*$/.exec(lines[0]?.text ?? '');
  if (!head) throw new Error('Expected "stateDiagram" or "stateDiagram-v2" on the first line');

  const nodes = new Map();
  const groups = new Map();
  const edges = [];
  const classDefs = new Map();
  const classAssign = [];
  let direction = 'TB';
  const stack = [];     // composite state ids
  const scope = () => (stack.length ? stack[stack.length - 1] : undefined);
  const starts = new Map(); // scope -> id
  const ends = new Map();

  function ensureState(id, parentHint) {
    if (groups.has(id)) return id;
    let n = nodes.get(id);
    if (!n) {
      n = { id, shape: 'rounded', label: id, parentId: parentHint ?? scope(), classes: [], style: {} };
      nodes.set(id, n);
    } else if (!n.parentId && (parentHint ?? scope())) n.parentId = parentHint ?? scope();
    return id;
  }
  function startNode() {
    const key = scope() ?? '';
    if (!starts.has(key)) {
      const id = key ? `${key}__start` : '__start';
      nodes.set(id, { id, shape: 'start', label: '', parentId: scope(), classes: [], style: {} });
      starts.set(key, id);
    }
    return starts.get(key);
  }
  function endNode() {
    const key = scope() ?? '';
    if (!ends.has(key)) {
      const id = key ? `${key}__end` : '__end';
      nodes.set(id, { id, shape: 'end', label: '', parentId: scope(), classes: [], style: {} });
      ends.set(key, id);
    }
    return ends.get(key);
  }
  const ref = (tok, role) => {
    tok = tok.trim();
    if (tok === '[*]') return role === 'src' ? startNode() : endNode();
    const m = /^([\w.-]+)(?::::([\w-]+))?$/.exec(tok.replace(/:::/g, '::::'));
    const id = tok.replace(/:::[\w-]+$/, '');
    ensureState(id);
    const cm = /:::([\w-]+)$/.exec(tok);
    if (cm) classAssign.push([[id], cm[1]]);
    return id;
  };

  for (let i = 1; i < lines.length; i++) {
    const { text, line } = lines[i];
    const t = text.trim().replace(/;+$/, '');
    let m;
    if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) { direction = m[1].toUpperCase().replace('TD', 'TB'); continue; }
    if (t === '}') { stack.pop(); continue; }
    if (t === '--') { res.warn(`line ${line}: concurrent-region separator "--" is not supported; regions are drawn in one container`); continue; }

    // state "Long description" as id   |   state id { | state id <<choice>> | state id
    if ((m = /^state\s+"([^"]+)"\s+as\s+([\w.-]+)\s*(\{)?$/.exec(t))) {
      const id = m[2];
      if (m[3]) { groups.set(id, { id, label: cleanLabel(m[1]), parentId: scope(), classes: [], style: {} }); stack.push(id); }
      else { ensureState(id); nodes.get(id).label = cleanLabel(m[1]); }
      continue;
    }
    if ((m = /^state\s+([\w.-]+)\s*<<(choice|fork|join)>>$/.exec(t))) {
      ensureState(m[1]);
      Object.assign(nodes.get(m[1]), m[2] === 'choice' ? { shape: 'diamond', label: '' } : { shape: 'rectangle', label: '', bar: true });
      continue;
    }
    if ((m = /^state\s+([\w.-]+)\s*\{$/.exec(t))) {
      const id = m[1];
      nodes.delete(id);
      groups.set(id, { id, label: id, parentId: scope(), classes: [], style: {} });
      stack.push(id);
      continue;
    }
    if ((m = /^state\s+([\w.-]+)$/.exec(t))) { ensureState(m[1]); continue; }

    // notes
    if ((m = /^note\s+(left of|right of|over)\s+([\w.-]+)\s*:\s*(.*)$/i.exec(t))) { addNote(m[2], cleanLabel(m[3]), m[1]); continue; }
    if ((m = /^note\s+(left of|right of|over)\s+([\w.-]+)$/i.exec(t))) {
      const body = [];
      while (++i < lines.length && !/^\s*end\s+note\s*$/i.test(lines[i].text)) body.push(lines[i].text.trim());
      addNote(m[2], cleanLabel(body.join('\n')), m[1]);
      continue;
    }

    if ((m = /^classDef\s+(\S+)\s+(.*)$/.exec(t))) { for (const n of m[1].split(',')) classDefs.set(n, parseStyleProps(m[2])); continue; }
    if ((m = /^class\s+(\S+)\s+([\w-]+)$/.exec(t))) { classAssign.push([m[1].split(','), m[2]]); continue; }
    if ((m = /^style\s+/.test(t))) continue;

    // transition:  A --> B : label
    if ((m = /^(\[\*\]|[\w.-]+(?::::?[\w-]+)?)\s*-->\s*(\[\*\]|[\w.-]+(?::::?[\w-]+)?)\s*(?::\s*(.*))?$/.exec(t))) {
      const source = ref(m[1], 'src');
      const target = ref(m[2], 'dst');
      edges.push({ source, target, label: cleanLabel(m[3] ?? ''), lineType: 'solid', arrowStart: 'none', arrowEnd: 'arrow', line });
      continue;
    }
    // description:  id : text
    if ((m = /^([\w.-]+)\s*:\s*(.+)$/.exec(t))) {
      ensureState(m[1]);
      const n = nodes.get(m[1]);
      if (n) (n.members ??= []).push(cleanLabel(m[2]));
      continue;
    }
    // bare id
    if ((m = /^([\w.-]+)$/.exec(t))) { ensureState(m[1]); continue; }

    res.warn(`line ${line}: unsupported statement "${t.slice(0, 50)}" skipped`);
  }

  function addNote(target, text, placement) {
    const id = `note_${nodes.size + groups.size}_${target}`;
    ensureState(target);
    nodes.set(id, { id, shape: 'note', label: text, parentId: nodes.get(target)?.parentId, classes: [], style: {} });
    edges.push({ source: id, target, label: '', lineType: 'dotted', arrowStart: 'none', arrowEnd: 'none', isNoteLink: true, placement });
  }

  for (const [ids, cls] of classAssign) for (const id of ids) (nodes.get(id) ?? groups.get(id))?.classes.push(cls);
  for (const item of [...nodes.values(), ...groups.values()]) {
    let st = {};
    for (const c of item.classes) st = { ...st, ...(classDefs.get(c) ?? {}) };
    item.style = st;
  }
  if (stack.length) res.warn(`${stack.length} composite state(s) not closed with "}"`);

  return { ...res, direction, nodes: [...nodes.values()], groups: [...groups.values()], edges, classDefs: Object.fromEntries(classDefs) };
}

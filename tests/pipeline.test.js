// Tests run against the REAL documents in the project root (not toy examples).
import test from 'node:test';
import assert from 'node:assert/strict';
import { read, FILES } from './helpers.js';
import { extractDiagrams } from '../lib/markdown/extractor.js';
import { scanMarkdown } from '../lib/markdown/parser.js';
import { classifyBlock } from '../lib/markdown/detector.js';
import { layoutDiagram } from '../lib/diagrams/layout.js';
import { diagramToFlow, flowToDiagram } from '../lib/diagrams/serializer.js';
import { diagramToSvg } from '../lib/export/svg.js';
import { generateMermaid } from '../lib/mermaid/generator.js';

const md = (body, lang = 'mermaid') => '## Heading\n\n```' + lang + '\n' + body + '\n```\n';
const all = Object.fromEntries(FILES.map((f) => [f, extractDiagrams(read(f), f)]));
const arch = all['ARCHITECTURE.md'];
const byName = (r, n) => r.diagrams.find((d) => d.name.includes(n));

test('1. one file, one Mermaid flowchart -> one individual diagram named after its heading', () => {
  const r = extractDiagrams(md('flowchart LR\n  A[Arduino] --> B[Raspberry Pi]\n  B --> C[Dashboard]'), 'one.md');
  assert.equal(r.diagrams.length, 1);
  const d = r.diagrams[0];
  assert.equal(d.name, 'Heading');
  assert.deepEqual(d.nodes.map((n) => [n.id, n.shape, n.label]), [['A', 'rectangle', 'Arduino'], ['B', 'rectangle', 'Raspberry Pi'], ['C', 'rectangle', 'Dashboard']]);
  assert.deepEqual(d.edges.map((e) => [e.source, e.target, e.style.arrowEnd]), [['A', 'B', 'arrow'], ['B', 'C', 'arrow']]);
  assert.equal(d.sourceFormat, 'mermaid');
  assert.equal(d.diagramType, 'flowchart');
  assert.equal(d.sourceFile, 'one.md');
});

test('2. a document with many diagrams: ARCHITECTURE.md has 16, all independent and converted', () => {
  assert.equal(arch.diagrams.length, 16);
  assert.deepEqual(arch.summary.byType, { Flowchart: 9, State: 2, Sequence: 4, Class: 1 });
  assert.equal(new Set(arch.diagrams.map((d) => d.id)).size, 16);
  assert.ok(arch.diagrams.every((d) => d.status === 'converted'));
});

test('3. multiple files', () => {
  const total = Object.values(all).reduce((n, r) => n + r.diagrams.length, 0);
  assert.equal(Object.keys(all).length, 5);
  assert.equal(total, 27);
  assert.equal(all['high level software architure diagram.md'].diagrams.length, 1);
});

test('4. flowchart: shapes, chained edges, & lists, :::class and classDef', () => {
  const r = extractDiagrams(md('graph TD\n A((c)) --> B{d} --> C[(db)]\n X & Y --> Z([s])\n classDef k fill:#f00,stroke:#00f\n class A k\n Q[q]:::k'), 'f.md');
  const d = r.diagrams[0];
  const shape = Object.fromEntries(d.nodes.map((n) => [n.id, n.shape]));
  assert.deepEqual([shape.A, shape.B, shape.C, shape.Z], ['circle', 'diamond', 'cylinder', 'stadium']);
  assert.equal(d.edges.length, 4);
  assert.equal(d.nodes.find((n) => n.id === 'A').style.fill, '#f00');
  assert.equal(d.nodes.find((n) => n.id === 'Q').style.stroke, '#00f');
});

test('5. sequence diagram: participants, messages, notes, loop and alt/else', () => {
  const d = byName(arch, 'Startup Handshake');
  assert.equal(d.kind, 'sequence');
  assert.deepEqual(d.sequence.participants.map((p) => p.label), ['systemd', 'P3 Watchdog', 'P1 Control', 'Arduino']);
  const flat = JSON.stringify(d.sequence.items);
  assert.match(flat, /"kind":"loop"/);
  assert.match(flat, /"kind":"alt"/);
  assert.match(flat, /"type":"note"/);
  const alt = d.sequence.items.find((i) => i.type === 'block' && i.kind === 'alt');
  assert.equal(alt.branches.length, 2);
});

test('6. state diagram: initial/final states, labelled transitions, note', () => {
  const d = byName(arch, 'Firmware State Machine');
  assert.ok(d.nodes.some((n) => n.shape === 'start') && d.nodes.some((n) => n.shape === 'end'));
  const t = d.edges.find((e) => e.label.startsWith('motion opcode'));
  assert.ok(t);
  assert.match(t.label, /\{F,R,L,G,S,H\}/);
  assert.ok(d.nodes.some((n) => n.shape === 'note' && /Latched/.test(n.label)));
});

test('7. class diagram: stereotypes, attributes, relationships with labels', () => {
  const d = byName(arch, 'Data Model');
  assert.equal(d.nodes.length, 5);
  const t = d.nodes.find((n) => n.id === 'TelemetryFrame_Arduino');
  assert.equal(t.attributes.length, 8);
  assert.match(t.stereotype, /8-field CSV/);
  assert.equal(d.edges.length, 3);
  assert.ok(d.edges.every((e) => e.label && e.style.arrowEnd === 'open'));
});

test('8. subgraphs become nested groups; edges may target groups, even before they are declared', () => {
  const d = all['high level software architure diagram.md'].diagrams[0];
  assert.equal(d.groups.length, 7);
  assert.equal(d.groups.find((g) => g.id === 'P1').parentId, 'PI');
  assert.equal(d.nodes.find((n) => n.id === 'P1_SB').parentId, 'P1');
  assert.ok(d.edges.some((e) => e.source === 'P3' && e.target === 'P1'));
  const fwd = byName(arch, 'Firmware Scheduler');
  assert.ok(fwd.edges.some((e) => e.target === 'c1') && fwd.groups.some((g) => g.id === 'c1'));
});

test('9. edge labels in every Mermaid syntax; arrow kinds and line styles', () => {
  const d = extractDiagrams(md('flowchart LR\n A -->|WebSocket :8080| B\n B -- "quoted text" --> C\n C -.dotted label.-> D\n D <==>|both| E\n E <--> F\n F --x G\n G --- H'), 'e.md').diagrams[0];
  const e = d.edges;
  assert.deepEqual(e.map((x) => x.label), ['WebSocket :8080', 'quoted text', 'dotted label', 'both', '', '', '']);
  assert.equal(e[2].style.lineType, 'dashed');
  assert.equal(e[3].style.lineType, 'thick');
  assert.equal(e[3].style.arrowStart, 'arrow');
  assert.equal(e[5].style.arrowEnd, 'cross');
  assert.equal(e[6].style.arrowEnd, 'none');
  const real = byName(arch, 'System Context').edges.find((x) => x.label.startsWith('WebSocket :8080'));
  assert.equal(real.label, 'WebSocket :8080\ncontrol + telemetry');
});

test('10. ASCII architecture diagrams convert, with honest confidence', () => {
  const cap = all['CAPSTONE_METHODOLOGY_FINAL.md'];
  const box = byName(cap, 'High-Level Communication');
  assert.equal(box.source.format, 'ascii');
  assert.deepEqual(box.nodes.filter((n) => n.shape === 'rectangle').map((n) => n.label.split('\n')[0]).sort(),
    ['ARDUINO UNO', 'NEO-6M GPS', 'OPERATOR LAPTOP', 'Raspberry Pi 4', 'ROBOT DISPLAY (HDMI) +', 'Wi-Fi router'].sort());
  assert.ok(box.edges.length >= 4);
  assert.notEqual(box.confidence, 'high');
  const seq = byName(all['SOFTWARE_ARCHITECTURE.md'], 'Startup Handshake');
  assert.equal(seq.kind, 'sequence');
  assert.equal(seq.sequence.items.filter((i) => i.type === 'message').length, 14);
  const chain = byName(cap, 'Firmware State Machine');
  assert.ok(chain.nodes.some((n) => n.label === 'BOOT') && chain.edges.some((e) => e.label === 'F/R/L/G'));
  const free = byName(all['SOFTWARE_ARCHITECTURE.md'], 'Container View');
  assert.equal(free.status, 'reference', 'a free-form layout is not faked');
  assert.ok(free.source.content.length > 100);
});

test('11. normal code blocks are never diagrams (cpp, c, python, json, bash, ini, checklists, logs)', () => {
  const sa = scanMarkdown(read('SOFTWARE_ARCHITECTURE.md'));
  assert.equal(classifyBlock(sa.blocks.find((b) => b.lang === 'cpp')).kind, 'code');
  const langs = new Set(['c', 'cpp', 'python', 'json', 'bash', 'ini']);
  for (const f of FILES) for (const b of scanMarkdown(read(f)).blocks) if (langs.has(b.lang)) assert.equal(classifyBlock(b).kind, 'code');
  const r = extractDiagrams('```cpp\nvoid loop() {\n  a --> b;\n}\n```\n', 'c.md');
  assert.equal(r.diagrams.length, 0);
  assert.equal(r.skipped[0].kind, 'code');
  const cap = all['CAPSTONE_METHODOLOGY_FINAL.md'];
  for (const s of cap.skipped.filter((s) => /Checklist|Log Files|Pre-Deployment/i.test(s.heading))) assert.notEqual(s.kind, 'ascii');
  assert.ok(cap.skipped.length > 40, 'every skipped block is reported, none silently dropped');
});

test('12. broken Mermaid does not crash and does not affect other diagrams', () => {
  const text = [md('flowchart TB\n A --> B'), md('flowchart TB\n A[unterminated --> B\n subgraph x\n'), md('sequenceDiagram\n A->>B'), md('wibble\n x'), md('gantt\n title t')].join('\n');
  const r = extractDiagrams(text, 'broken.md');
  assert.equal(r.diagrams.length, 5);
  assert.equal(r.diagrams[0].status, 'converted');
  assert.ok(['partial', 'failed'].includes(r.diagrams[1].status));
  assert.equal(r.diagrams[2].status, 'converted');
  assert.equal(r.diagrams[3].status, 'reference');   // unknown keyword: kept as reference, never dropped
  assert.match(r.diagrams[3].warnings[0], /no visual editor/);
  assert.equal(r.diagrams[4].status, 'reference');
  for (const d of r.diagrams) assert.ok(d.source.content.length > 0);
});

test('13/14. edit -> save -> reload keeps the edit (editor state <-> stored model, through JSON)', async () => {
  const d = await layoutDiagram(byName(arch, 'System Context'));
  const flow = diagramToFlow(d);
  const n = flow.nodes.find((x) => x.id === 'dashboard');
  n.data = { ...n.data, label: 'My edited dashboard' };
  n.position = { x: n.position.x + 37, y: n.position.y };
  flow.nodes.push({ id: 'new1', type: 'shape', position: { x: 5, y: 5 }, width: 100, height: 40, data: { label: 'New', shape: 'cloud', style: {} } });
  flow.edges.pop();
  const saved = JSON.parse(JSON.stringify(flowToDiagram(d, flow.nodes, flow.edges)));
  const again = diagramToFlow(saved);
  assert.equal(again.nodes.find((x) => x.id === 'dashboard').data.label, 'My edited dashboard');
  assert.equal(again.nodes.find((x) => x.id === 'dashboard').position.x, n.position.x);
  assert.ok(again.nodes.some((x) => x.id === 'new1' && x.data.shape === 'cloud'));
  assert.equal(again.edges.length, d.edges.length - 1);
  assert.equal(saved.source.content, d.source.content, 'original source untouched by editing');
  assert.equal(saved.groups.length, d.groups.length);
});

test('15. SVG export is built from the model, well-formed, and contains every object', async () => {
  for (const d0 of [byName(arch, 'Container View'), all['high level software architure diagram.md'].diagrams[0], byName(arch, 'Data Model'), byName(arch, 'Startup Handshake')]) {
    const d = d0.kind === 'graph' ? await layoutDiagram(d0) : d0;
    const { svg } = diagramToSvg(d);
    assert.match(svg, /^<\?xml[\s\S]*<svg [^>]*viewBox="0 0 \d+ \d+"/);
    assert.equal((svg.match(/<svg /g) ?? []).length, 1);
    for (const tag of ['g', 'defs', 'marker', 'text']) {
      assert.equal((svg.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length, (svg.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, `balanced <${tag}>`);
    }
    if (d.kind === 'graph') {
      assert.equal((svg.match(/data-node-id=/g) ?? []).length, d.nodes.length);
      assert.equal((svg.match(/data-group-id=/g) ?? []).length, d.groups.length);
      assert.ok(!svg.includes('<image') && !svg.includes('data:image'), 'no embedded raster');
    }
    const first = (d.kind === 'graph' ? d.nodes[0].label : d.sequence.participants[0].label).split('\n')[0];
    assert.ok(svg.includes(first.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
  }
});

test('security: hostile labels and colours are escaped or rejected in exported SVG', async () => {
  const src = 'flowchart TB\n A["<script>alert(1)</script><img src=x onerror=alert(2)>"] --> B\n style A fill:red" onload="alert(3),stroke:url(javascript:1)';
  const d0 = extractDiagrams(md(src), 'x.md').diagrams[0];
  const { svg } = diagramToSvg(await layoutDiagram(d0));
  assert.ok(!/<script/i.test(svg) && !/<img/i.test(svg) && !/onload=/i.test(svg) && !/javascript:/i.test(svg));
});

test('source is preserved byte-for-byte and the input text is not modified', () => {
  for (const f of FILES) {
    const text = read(f);
    const before = text.slice();
    const r = extractDiagrams(text, f);
    assert.equal(text, before);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    for (const d of r.diagrams) {
      assert.equal(d.source.content, lines.slice(d.metadata.sourceLine, d.metadata.sourceEndLine - 1).join('\n'), `${f}: ${d.name}`);
      assert.equal(d.sourceCode, d.source.content);
    }
  }
});

test('re-import yields identical stable ids and hashes (duplicate-detection basis)', () => {
  const a = extractDiagrams(read('ARCHITECTURE.md'), 'ARCHITECTURE.md');
  const b = extractDiagrams(read('ARCHITECTURE.md'), 'ARCHITECTURE.md');
  assert.deepEqual(a.diagrams.map((d) => d.id), b.diagrams.map((d) => d.id));
  assert.equal(a.file.hash, b.file.hash);
  assert.notEqual(a.file.hash, extractDiagrams(read('ARCHITECTURE.md') + '\nx', 'ARCHITECTURE.md').file.hash);
});

test('generated Mermaid for every real Mermaid diagram passes its own round-trip verification', async () => {
  for (const f of ['ARCHITECTURE.md', 'high level software architure diagram.md']) {
    for (let d of all[f].diagrams) {
      if (d.kind === 'graph') d = await layoutDiagram(d);
      const g = generateMermaid(d);
      assert.ok(g.ok, `${d.name}: ${g.issues?.join('; ')}`);
    }
  }
});

test('generator refuses to claim exactness for shapes Mermaid cannot express', () => {
  const d = extractDiagrams(md('flowchart TB\n A --> B'), 'g.md').diagrams[0];
  d.nodes[0].shape = 'server';
  const g = generateMermaid(d);
  assert.equal(g.ok, false);
  assert.match(g.issues.join(' '), /no Mermaid equivalent/);
});

test('performance: all five real documents extract quickly', () => {
  const t = Date.now();
  for (const f of FILES) extractDiagrams(read(f), f);
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t}ms`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDiagrams } from '../lib/markdown/extractor.js';
import { layoutDiagram } from '../lib/diagrams/layout.js';
import { diagramToDrawioXml, diagramToDrawioFile } from '../lib/export/drawio.js';

const md = '## Flow\n\n```mermaid\nflowchart LR\n  A[Start & "go"] --> B{Ok?}\n  B -->|yes| C((Done))\n```\n';

async function diagramFor(mermaidBody) {
  const body = '## Flow\n\n```mermaid\n' + mermaidBody + '\n```\n';
  const d = extractDiagrams(body, 'x.md').diagrams[0];
  return d.layout?.done ? d : await layoutDiagram(d);
}

/** Minimal dependency-free well-formedness check: every opening tag has a matching close (or is self-closing). */
function assertWellFormedXml(xml) {
  assert.match(xml, /^<\?xml[^>]*\?>\s*<mxfile|^<mxGraphModel/, 'must start with a recognisable root element');
  const stack = [];
  const tagRe = /<\/?([a-zA-Z][\w:-]*)(?:\s[^>]*?)?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(xml))) {
    const [full, name, selfClose] = m;
    if (full.startsWith('</')) {
      const top = stack.pop();
      assert.equal(top, name, `mismatched closing tag </${name}> (expected </${top}>)`);
    } else if (!selfClose && !full.endsWith('/>')) {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `unclosed tags remain: ${stack.join(', ')}`);
  // Every attribute value must be well-quoted and not contain a raw unescaped & or < or >.
  const attrRe = /(\w[\w:-]*)="([^"]*)"/g;
  let a;
  while ((a = attrRe.exec(xml))) {
    const val = a[2];
    assert.doesNotMatch(val, /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i, `unescaped "&" in attribute ${a[1]}="${val}"`);
    assert.doesNotMatch(val, /<|>/, `unescaped angle bracket in attribute ${a[1]}="${val}"`);
  }
}

/** Parse an mxCell's style="..." attribute into a key->value map (bare keys map to true). */
function parseStyle(styleAttr) {
  const out = {};
  for (const part of styleAttr.split(';')) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx < 0) out[part] = true;
    else out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

function edgeCells(xml) {
  return [...xml.matchAll(/<mxCell[^>]*\bedge="1"[^>]*\/?>/g)].map((m) => m[0]);
}
function vertexCells(xml) {
  return [...xml.matchAll(/<mxCell[^>]*\bvertex="1"[^>]*\/?>/g)].map((m) => m[0]);
}
function cellAttr(cellXml, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(cellXml);
  return m ? m[1] : undefined;
}

test('draw.io export produces mxGraph XML with vertices and edges', async () => {
  const d = extractDiagrams(md, 'x.md').diagrams[0];
  const laid = d.layout?.done ? d : await layoutDiagram(d);
  const xml = diagramToDrawioXml(laid);
  assert.match(xml, /^<mxGraphModel/);
  assert.equal((xml.match(/vertex="1"/g) || []).length, 3);
  assert.equal((xml.match(/edge="1"/g) || []).length, 2);
  assert.match(xml, /rhombus/);
  assert.match(xml, /Start &amp;amp; &quot;go&quot;/);
  assert.match(diagramToDrawioFile(laid), /<mxfile/);
});

test('ordinary edge label exports without underline styling', async () => {
  const d = await diagramFor('flowchart LR\n  A[Controller] -.->|supervises| B[Worker]');
  const xml = diagramToDrawioXml(d);
  assertWellFormedXml(xml);
  const [edge] = edgeCells(xml);
  assert.ok(edge, 'expected one edge cell');
  assert.equal(cellAttr(edge, 'value'), 'supervises');
  const style = parseStyle(cellAttr(edge, 'style'));
  assert.equal(style.fontStyle, '0', 'fontStyle must be explicitly 0 so draw.io does not fall back to its underlined edge-label default');
  assert.doesNotMatch(cellAttr(edge, 'value'), /<u>|text-decoration/i);
});

test('edge labels with punctuation, ampersands, quotes and angle brackets escape correctly', async () => {
  const d = await diagramFor('flowchart LR\n  A[Gateway] --o|"WebRTC: video, audio & talk <live>"| B[Client]');
  const xml = diagramToDrawioXml(d);
  assertWellFormedXml(xml);
  const [edge] = edgeCells(xml);
  assert.match(cellAttr(edge, 'value'), /WebRTC: video, audio &amp;amp; talk &amp;lt;live&amp;gt;/);
});

test('multiline edge labels remain intact (rendered as <br> for editable multiline text)', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -->|"line one<br>line two"| B[B]');
  assert.equal(d.edges[0].label, 'line one\nline two');
  const xml = diagramToDrawioXml(d);
  assertWellFormedXml(xml);
  const [edge] = edgeCells(xml);
  // The raw XML attribute text must contain the escaped entities for "<br>" (&lt;br&gt;), not a literal
  // "<" (which would break the XML) and not the escaped text "&lt;br&gt;" appearing literally once draw.io
  // unescapes the attribute — i.e. one level of entity-escaping, matching how `<` and `>` are escaped elsewhere.
  assert.match(cellAttr(edge, 'value'), /line one&lt;br&gt;line two/);
  assert.doesNotMatch(cellAttr(edge, 'value'), /&amp;lt;br&amp;gt;/, 'the <br> break must not be double-escaped');
});

test('dashed and dotted connector styles are preserved alongside the label fix', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -.->|dotted link| B[B]\n  B -->|solid| C[C]');
  const xml = diagramToDrawioXml(d);
  const edges = edgeCells(xml);
  const dotted = edges.find((e) => cellAttr(e, 'value') === 'dotted link');
  const solid = edges.find((e) => cellAttr(e, 'value') === 'solid');
  assert.match(cellAttr(dotted, 'style'), /dashed=1/);
  assert.doesNotMatch(cellAttr(solid, 'style'), /dashed=1/);
});

test('exported edge label has no background chip behind the text', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -.->|supervises| B[B]');
  const xml = diagramToDrawioXml(d);
  const [edge] = edgeCells(xml);
  const style = parseStyle(cellAttr(edge, 'style'));
  assert.equal(style.labelBackgroundColor, 'none');
});

test('edge labels carry no border box and an explicit dark font colour', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -.->|UART 9600 baud| B[B]');
  const xml = diagramToDrawioXml(d);
  const [edge] = edgeCells(xml);
  const style = parseStyle(cellAttr(edge, 'style'));
  assert.equal(style.labelBorderColor, 'none', 'draw.io otherwise draws a box around the pasted edge label');
  assert.equal(style.fontColor, '#0f172a', 'without an explicit fontColor the label inherits the canvas theme colour');
});

test('edge labels are centred on the connector, not dropped below it', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -.->|WebRTC: video, audio, talk| B[B]');
  const xml = diagramToDrawioXml(d);
  const [edge] = edgeCells(xml);
  const style = parseStyle(cellAttr(edge, 'style'));
  assert.equal(style.verticalAlign, 'middle', 'without this draw.io hangs the label below the line');
  assert.equal(style.align, 'center');
  assert.match(xml, /<mxPoint as="offset"\/>/, 'a zero offset point stops draw.io applying its default label offset');
});

test('node and group labels are unaffected by the edge-label fix', async () => {
  const d = await diagramFor('flowchart LR\n  subgraph G[Group One]\n    A[Node A]\n  end\n  A -->|edge label| B[Node B]');
  const xml = diagramToDrawioXml(d);
  for (const v of vertexCells(xml)) {
    const style = parseStyle(cellAttr(v, 'style'));
    assert.equal(style.fontStyle, undefined, 'vertex/group styles should not gain an explicit fontStyle from the edge fix');
    assert.equal(style.labelBackgroundColor, undefined, 'vertex/group styles should not gain labelBackgroundColor from the edge fix');
  }
});

test('two distinct edges that happen to share the same label remain two distinct edges', async () => {
  const d = await diagramFor('flowchart LR\n  A[Supervisor A] -.->|supervises| X[Worker X]\n  B[Supervisor B] -.->|supervises| Y[Worker Y]');
  const xml = diagramToDrawioXml(d);
  const edges = edgeCells(xml);
  assert.equal(edges.length, 2, 'both legitimate edges must be present');
  const supervises = edges.filter((e) => cellAttr(e, 'value') === 'supervises');
  assert.equal(supervises.length, 2);
  const sources = new Set(edges.map((e) => cellAttr(e, 'source')));
  const targets = new Set(edges.map((e) => cellAttr(e, 'target')));
  assert.equal(sources.size, 2, 'edges must keep distinct sources');
  assert.equal(targets.size, 2, 'edges must keep distinct targets');
});

test('a single edge in the source produces exactly one edge cell (no duplication)', async () => {
  const d = await diagramFor('flowchart LR\n  A[A] -->|once| B[B]');
  const xml = diagramToDrawioXml(d);
  assert.equal(edgeCells(xml).length, 1);
  assert.equal(d.edges.length, 1);
});

test('the full representative architecture diagram exports valid XML with every feature intact', async () => {
  const d = await diagramFor([
    'flowchart LR',
    '  SupA[Supervisor A]:::dark -.->|supervises| WorkerA[Worker A]',
    '  SupB[Supervisor B]:::dark -.->|supervises| WorkerB[Worker B]',
    '  Gateway[Gateway]:::dark --o|"WebRTC: video, audio, talk"| Client[Client]',
    '  Gateway --o|"WebSocket: control, telemetry"| Hub[Hub]',
    '  Hub -.->|"UART 9600 baud"| Sensor[Sensor]',
    '  classDef dark fill:#1e293b,color:#ffffff',
  ].join('\n'));
  const xml = diagramToDrawioXml(d);
  assertWellFormedXml(xml);
  const edges = edgeCells(xml);
  assert.equal(edges.length, 5);
  for (const e of edges) {
    const style = parseStyle(cellAttr(e, 'style'));
    assert.equal(style.fontStyle, '0');
    assert.equal(style.labelBackgroundColor, 'none');
  }
  const file = diagramToDrawioFile(d);
  assertWellFormedXml(file);
  assert.match(file, /<mxfile/);
});

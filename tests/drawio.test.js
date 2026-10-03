import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDiagrams } from '../lib/markdown/extractor.js';
import { layoutDiagram } from '../lib/diagrams/layout.js';
import { diagramToDrawioXml, diagramToDrawioFile } from '../lib/export/drawio.js';

const md = '## Flow\n\n```mermaid\nflowchart LR\n  A[Start & "go"] --> B{Ok?}\n  B -->|yes| C((Done))\n```\n';

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

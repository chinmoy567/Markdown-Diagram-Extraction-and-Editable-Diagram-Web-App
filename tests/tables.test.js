import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTables, tableToHtml, tableToTsv, tableToMarkdown } from '../lib/markdown/tables.js';

const md = [
  '# Doc', '', '## Specs', '',
  '| Name | Qty | Note |', '|:-----|----:|:----:|',
  '| **Motor** | 4 | uses `a\\|b` |', '| Sensor | 12 | <br>x |', '',
  'text', '', '```', '| not | a table |', '|---|---|', '| x | y |', '```', '',
  'A | B', '--|--', '1 | 2', '',
].join('\n');

test('extracts pipe tables, skips fenced ones, keeps heading + alignment', () => {
  const t = extractTables(md);
  assert.equal(t.length, 2);
  assert.equal(t[0].heading, 'Specs');
  assert.deepEqual(t[0].header, ['Name', 'Qty', 'Note']);
  assert.deepEqual(t[0].align, ['left', 'right', 'center']);
  assert.equal(t[0].rows[0][2], 'uses `a|b`');
  assert.deepEqual(t[1].rows, [['1', '2']]);
});

test('renders html, tsv and markdown', () => {
  const [t] = extractTables(md);
  assert.match(tableToHtml(t), />Motor<\/td>/);
  assert.doesNotMatch(tableToHtml(t), /<strong>|<code>|<th|#f0f0f0/);
  assert.match(tableToHtml(t), /text-align:right/);
  assert.equal(tableToTsv(t).split('\n')[1], 'Motor\t4\tuses a|b');
  assert.match(tableToMarkdown(t), /\| :--- \| ---: \| :---: \|/);
});

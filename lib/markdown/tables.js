// GFM pipe tables in markdown text -> structured tables + clipboard-ready renderings.
// Read-only with respect to the input; tables inside fenced code blocks are ignored.
import { scanMarkdown } from './parser.js';

const SEP_CELL = /^:?-+:?$/;

/** Split one table row on unescaped pipes that are not inside `code spans`. */
export function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseSeparator(line, cols) {
  if (!line.includes('-') || !line.includes('|')) return null;
  const cells = splitRow(line);
  if (cells.length !== cols || !cells.every((c) => SEP_CELL.test(c))) return null;
  return cells.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
}

/** @returns {{ index, heading, startLine, endLine, header: string[], align: (string|null)[], rows: string[][] }[]} */
export function extractTables(text) {
  const { lines, blocks, headings } = scanMarkdown(text);
  const inFence = new Set();
  for (const b of blocks) for (let l = b.startLine; l <= b.endLine; l++) inFence.add(l);
  const tables = [];
  let i = 0;
  while (i < lines.length - 1) {
    const line = lines[i];
    if (line.includes('|') && !inFence.has(i + 1) && !inFence.has(i + 2)) {
      const header = splitRow(line);
      const align = parseSeparator(lines[i + 1], header.length);
      if (align) {
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|') && !inFence.has(j + 1)) {
          const r = splitRow(lines[j]);
          while (r.length < header.length) r.push('');
          rows.push(r.slice(0, header.length));
          j++;
        }
        let h = null;
        for (const x of headings) { if (x.line <= i + 1) h = x; else break; }
        tables.push({ index: tables.length, heading: h?.text ?? '', startLine: i + 1, endLine: j, header, align, rows });
        i = j;
        continue;
      }
    }
    i++;
  }
  return tables;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline markdown in a cell -> safe HTML (escaped first, then a small set of formatting). */
export function inlineToHtml(src, { plain = false } = {}) {
  let s = esc(src);
  if (plain) return s;
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return s;
}

/** Inline markdown in a cell -> plain text (formatting stripped). */
export function inlineToText(src) {
  return src
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => a ?? b)
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1');
}

/**
 * Plain table for pasting into Word / Google Docs / Outlook: white cells, thin black borders, regular text.
 * Formatting inside cells (bold, code, links) is dropped on purpose so the table matches a native document table.
 */
export function tableToHtml(t) {
  const cell = 'border:1px solid #000;padding:4px 8px;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:11pt;font-weight:normal;vertical-align:top;';
  const al = (k) => (t.align[k] ? `text-align:${t.align[k]};` : '');
  const td = (c, k) => `<td style="${cell}${al(k)}">${inlineToHtml(inlineToText(c), { plain: true })}</td>`;
  const rows = [t.header, ...t.rows].map((r) => `<tr>${r.map(td).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;border:1px solid #000;"><tbody>${rows}</tbody></table>`;
}

/** Tab-separated text: pastes into Excel / Sheets cell-by-cell, and reads fine in plain-text editors. */
export function tableToTsv(t) {
  const f = (c) => inlineToText(c).replace(/[\t\r\n]+/g, ' ');
  return [t.header, ...t.rows].map((r) => r.map(f).join('\t')).join('\n');
}

/** The table as markdown, normalised from the parsed cells. */
export function tableToMarkdown(t) {
  const sep = t.align.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'));
  const row = (r) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
  return [row(t.header), `| ${sep.join(' | ')} |`, ...t.rows.map(row)].join('\n');
}

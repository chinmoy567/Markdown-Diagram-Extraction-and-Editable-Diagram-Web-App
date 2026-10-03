// Copy a parsed markdown table so it pastes as a real table in Word / Google Docs / Excel,
// and as tab-separated text in plain-text targets.
import { tableToHtml, tableToTsv, tableToMarkdown } from '../markdown/tables.js';

/** @param {'rich'|'markdown'} mode  rich = HTML + TSV together; markdown = raw markdown text */
export async function copyTable(table, mode = 'rich') {
  if (mode === 'markdown') { await navigator.clipboard.writeText(tableToMarkdown(table)); return; }
  const html = tableToHtml(table);
  const text = tableToTsv(table);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
    return;
  }
  // Fallback for browsers without ClipboardItem: select a rendered copy and use the copy command.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;';
  host.innerHTML = html;
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand('copy');
  sel.removeAllRanges();
  host.remove();
  if (!ok) throw new Error('clipboard unavailable');
}

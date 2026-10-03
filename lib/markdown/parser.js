// Markdown scanning layer. It does NOT evaluate or render anything: it only tokenises
// fenced code blocks and headings, preserving exact line positions and raw text.
// Input is treated as untrusted text.

export function hashString(str) {
  // FNV-1a 32-bit, twice with different seeds => 16 hex chars. Stable and dependency-free.
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

export function cleanHeading(text) {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scan markdown text.
 * @returns {{ lines: string[], blocks: Block[], headings: Heading[] }}
 * Block: { index, lang, info, startLine, endLine, content, headingIndex, precedingText, followingText, adjacentHeading }
 * Lines are 1-based in startLine/endLine (fence lines included).
 */
export function scanMarkdown(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks = [];
  const headings = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = FENCE_OPEN.exec(line);
    if (open) {
      const fence = open[2];
      const marker = fence[0];
      const closeRe = new RegExp(`^ {0,3}\\${marker}{${fence.length},}\\s*$`);
      let j = i + 1;
      const body = [];
      let closed = false;
      while (j < lines.length) {
        if (closeRe.test(lines[j])) { closed = true; break; }
        body.push(lines[j]);
        j++;
      }
      const lastHeading = headings.length ? headings[headings.length - 1] : null;
      // Is the heading "adjacent"? Only blank lines / short intro text between heading and fence.
      let adjacent = false;
      if (lastHeading) {
        const between = lines.slice(lastHeading.line, i).filter((l) => l.trim() !== '');
        adjacent = between.length <= 3 && !between.some((l) => FENCE_OPEN.test(l));
      }
      blocks.push({
        index: blocks.length,
        lang: (open[3] || '').toLowerCase(),
        info: line.trim().replace(/^(`{3,}|~{3,})/, '').trim(),
        startLine: i + 1,
        endLine: closed ? j + 1 : j,
        closed,
        content: body.join('\n'),
        headingIndex: headings.length ? headings.length - 1 : -1,
        adjacentHeading: adjacent,
        // Lines of prose just before the fence (used for figure captions)
        precedingText: collectPrecedingProse(lines, i),
        followingText: collectFollowingProse(lines, closed ? j + 1 : j),
      });
      i = closed ? j + 1 : j;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) headings.push({ level: h[1].length, text: cleanHeading(h[2]), raw: line, line: i + 1 });
    i++;
  }
  return { lines, blocks, headings };
}

function collectPrecedingProse(lines, fenceIdx) {
  const out = [];
  for (let k = fenceIdx - 1; k >= 0 && out.length < 3; k--) {
    const l = lines[k];
    if (l.trim() === '') { if (out.length) break; else continue; }
    if (HEADING.test(l) || FENCE_OPEN.test(l)) break;
    out.unshift(l.trim());
  }
  return out.join(' ');
}

function collectFollowingProse(lines, afterIdx) {
  const out = [];
  for (let k = afterIdx; k < lines.length && out.length < 3; k++) {
    const l = lines[k];
    if (l.trim() === '') { if (out.length) break; else continue; }
    if (HEADING.test(l) || FENCE_OPEN.test(l)) break;
    out.push(l.trim());
  }
  return out.join(' ');
}

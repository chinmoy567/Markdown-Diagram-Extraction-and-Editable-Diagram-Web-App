// Markdown text -> individual diagram objects. Read-only with respect to the input.
import { scanMarkdown, hashString } from './parser.js';
import { classifyBlock } from './detector.js';
import { convertSource } from '../diagrams/converter.js';
import { createDiagram, typeLabel } from '../diagrams/model.js';

/** "14.2 Sequence — x" -> "Sequence — x";  "A.1  Overview" -> "Overview";  "1. System Context" -> "System Context" */
export function nameFromHeading(h) {
  return h.replace(/^(?:[A-Z]\.)?\d+(?:\.\d+)*[.)]?\s+/, '').replace(/^[A-Z]\.\d+(?:\.\d+)*\s+/, '').trim() || h;
}

const DEFAULT_NAMES = {
  flowchart: 'Flowchart', graph: 'Flowchart', sequenceDiagram: 'Sequence Diagram', stateDiagram: 'State Diagram',
  'stateDiagram-v2': 'State Diagram', classDiagram: 'Class Diagram', erDiagram: 'ER Diagram',
};

function mermaidTitle(content) {
  const fm = /^\s*---\s*\n([\s\S]*?)\n---/.exec(content);
  const t = fm && /^title:\s*(.+)$/m.exec(fm[1]);
  return t ? t[1].replace(/^["']|["']$/g, '').trim() : null;
}

export function fileId(name, hash) { return `f-${hashString(name).slice(0, 8)}-${hash.slice(0, 8)}`; }

/**
 * @param {string} text   Markdown source
 * @param {string} fileName
 * @param {{ promote?: number[] }} [opts]  block indexes of candidate/text blocks to force-convert as ASCII
 */
export function extractDiagrams(text, fileName, opts = {}) {
  const { blocks, headings, lines } = scanMarkdown(text);
  const fileHash = hashString(text);
  const diagrams = [];
  const skipped = [];
  const nameCount = new Map();
  const typeCount = new Map();
  const idSeen = new Map();

  for (const block of blocks) {
    let cls = classifyBlock(block);
    const forced = opts.promote?.includes(block.index);
    const heading = block.headingIndex >= 0 ? headings[block.headingIndex] : null;

    if (cls.kind === 'code' || cls.kind === 'text' || cls.kind === 'candidate') {
      if (forced && cls.kind !== 'code') cls = { kind: 'ascii', family: cls.family ?? 'ascii-unknown', score: cls.score ?? 0, reasons: ['promoted manually'] };
      else {
        skipped.push({
          blockIndex: block.index, kind: cls.kind, lang: block.lang, family: cls.family ?? null,
          startLine: block.startLine, endLine: block.endLine, heading: heading?.text ?? '',
          reason: cls.reasons.join('; '), lineCount: block.content.split('\n').length,
          preview: block.content.split('\n').slice(0, 6).join('\n'), content: block.content,
        });
        continue;
      }
    }

    const isMermaid = cls.kind === 'mermaid';
    const format = isMermaid ? 'mermaid' : 'ascii';
    const type = isMermaid ? (cls.mermaidType ?? 'unknown') : (cls.family ?? 'ascii-unknown');

    // ---- name
    let name;
    const title = isMermaid ? mermaidTitle(block.content) : null;
    if (title) name = title;
    else if (heading) name = nameFromHeading(heading.text);
    if (!name) {
      const base = isMermaid ? (DEFAULT_NAMES[type] ?? 'Diagram') : 'ASCII Diagram';
      const n = (typeCount.get(base) ?? 0) + 1; typeCount.set(base, n);
      name = `${base} ${n}`;
    }
    const seen = (nameCount.get(name) ?? 0) + 1; nameCount.set(name, seen);
    if (seen > 1) name = `${name} (${seen})`;

    // ---- stable id: file name + source hash + occurrence of identical source
    const sourceHash = hashString(block.content);
    const key = `${fileName}:${sourceHash}`;
    const occ = (idSeen.get(key) ?? 0) + 1; idSeen.set(key, occ);
    const id = `d-${hashString(key).slice(0, 10)}${occ > 1 ? `-${occ}` : ''}`;

    // ---- convert (never throws)
    const conv = convertSource(format, block.content, type);

    diagrams.push(createDiagram({
      id, name, kind: conv.kind,
      sourceFile: fileName,
      source: { format, type, content: block.content },
      status: conv.status, confidence: conv.confidence, warnings: conv.warnings ?? [],
      nodes: conv.nodes, edges: conv.edges, groups: conv.groups, sequence: conv.sequence,
      layout: conv.layout,
      metadata: {
        sourceFile: fileName, sourceHeading: heading?.text ?? '', sourceHeadingLevel: heading?.level ?? 0,
        sourceLine: block.startLine, sourceEndLine: block.endLine, blockIndex: block.index, sourceHash, fileHash,
        precedingText: block.precedingText.slice(0, 300), followingText: block.followingText.slice(0, 300),
        detection: cls.reasons.join('; '), conversionError: conv.error ?? null,
        promoted: !!forced,
      },
    }));
  }

  const summary = {
    fileName, fileHash, bytes: text.length, lines: lines.length, fences: blocks.length,
    diagrams: diagrams.length,
    byType: countBy(diagrams, (d) => typeLabel(d.source.type)),
    converted: diagrams.filter((d) => d.status === 'converted').length,
    partial: diagrams.filter((d) => d.status === 'partial').length,
    reference: diagrams.filter((d) => d.status === 'reference').length,
    failed: diagrams.filter((d) => d.status === 'failed').length,
    skippedCode: skipped.filter((s) => s.kind === 'code').length,
    skippedText: skipped.filter((s) => s.kind === 'text').length,
    candidates: skipped.filter((s) => s.kind === 'candidate').length,
  };
  return { file: { id: fileId(fileName, fileHash), name: fileName, hash: fileHash, size: text.length }, diagrams, skipped, summary };
}

function countBy(arr, fn) {
  const o = {};
  for (const x of arr) { const k = fn(x); o[k] = (o[k] ?? 0) + 1; }
  return o;
}

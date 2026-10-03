// Library-level operations on top of `storage`: importing files, conflict resolution, promoting skipped blocks.
import { storage } from './db.js';
import { extractDiagrams, fileId } from '../markdown/extractor.js';
import { convertSource } from '../diagrams/converter.js';
import { createDiagram, uid } from '../diagrams/model.js';
import { hashString } from '../markdown/parser.js';

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../markdown/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      ev.data.ok ? p.resolve(ev.data.result) : p.reject(new Error(ev.data.error));
    };
    worker.onerror = () => {
      // Worker failed to start: fall back to the main thread for everything pending and in future.
      const items = [...pending.values()];
      pending.clear(); worker = null;
      items.forEach((p) => { try { p.resolve(extractDiagrams(p.text, p.name, { promote: p.promote })); } catch (e) { p.reject(e); } });
    };
  } catch { worker = null; }
  return worker;
}

/** Parse in a Web Worker (falls back to the main thread). */
export function extractAsync(name, text, promote) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => extractDiagrams(text, name, { promote }));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, text, name, promote });
    w.postMessage({ id, name, text, promote });
  });
}

/** Read + parse a batch of File/{name,text} items. Does not write anything. */
export async function analyseFiles(items, onProgress) {
  const existing = await storage.listFiles();
  const existingDiagrams = await storage.listDiagrams();
  const out = [];
  let i = 0;
  for (const it of items) {
    const text = it.text ?? (await it.file.text());
    const result = await extractAsync(it.name, text);
    const prev = existing.find((f) => f.name === it.name);
    const editedCount = prev ? existingDiagrams.filter((d) => d.fileId === prev.id && d.edited).length : 0;
    out.push({
      name: it.name, text, result,
      conflict: prev ? { fileId: prev.id, identical: prev.hash === result.file.hash, editedCount, previousDiagrams: existingDiagrams.filter((d) => d.fileId === prev.id).length } : null,
      action: prev ? (prev.hash === result.file.hash ? 'ignore' : 'replace') : 'add',
    });
    onProgress?.(++i, items.length);
  }
  return out;
}

/** Apply analysed imports with the user's chosen action per file. */
export async function commitImports(analysed) {
  const report = [];
  for (const a of analysed) {
    const { result } = a;
    if (a.action === 'ignore') { report.push({ name: a.name, action: 'ignored', diagrams: 0 }); continue; }
    const now = Date.now();
    let fid = result.file.id;
    let name = a.name;
    let diagrams = result.diagrams;
    let skipped = result.skipped;
    if (a.action === 'copy') {
      let n = 2;
      const files = await storage.listFiles();
      const taken = new Set(files.map((f) => f.name));
      const stem = a.name.replace(/\.md$/i, '');
      name = `${stem} (copy)`; while (taken.has(`${name}.md`) || taken.has(name)) name = `${stem} (copy ${n++})`;
      name = `${name}.md`;
      fid = `f-${uid('copy')}`;
      diagrams = diagrams.map((d) => ({ ...d, id: uid('diagram'), sourceFile: name, metadata: { ...d.metadata, sourceFile: name, copiedFrom: a.name } }));
    } else if (a.action === 'replace' && a.conflict) {
      await storage.deleteDiagramsByFile(a.conflict.fileId);
      if (a.conflict.fileId !== fid) await storage.deleteFile(a.conflict.fileId);
    }
    await storage.putFile({ id: fid, name, hash: result.file.hash, size: result.file.size, text: a.text, skipped, summary: result.summary, importedAt: now });
    await storage.putDiagrams(diagrams.map((d) => ({ ...d, fileId: fid, createdAt: now, updatedAt: now, edited: false })));
    report.push({ name, action: a.action, diagrams: diagrams.length, summary: result.summary });
  }
  return report;
}

/** Turn a skipped block (candidate / plain text) into a diagram on request. */
export async function promoteSkipped(file, blockIndex) {
  const block = file.skipped.find((s) => s.blockIndex === blockIndex);
  if (!block) throw new Error('Block not found');
  const family = block.family ?? 'ascii-unknown';
  const conv = convertSource('ascii', block.content, family);
  const sourceHash = hashString(block.content);
  const d = createDiagram({
    id: `d-${hashString(`${file.name}:${sourceHash}:promoted`).slice(0, 10)}`,
    name: block.heading ? block.heading.replace(/^(?:[A-Z]\.)?\d+(?:\.\d+)*[.)]?\s+/, '') : `ASCII Diagram (line ${block.startLine})`,
    kind: conv.kind, sourceFile: file.name,
    source: { format: 'ascii', type: family, content: block.content },
    status: conv.status, confidence: conv.confidence, warnings: conv.warnings ?? [],
    nodes: conv.nodes, edges: conv.edges, groups: conv.groups, sequence: conv.sequence, layout: conv.layout,
    metadata: { sourceFile: file.name, sourceHeading: block.heading, sourceLine: block.startLine, sourceEndLine: block.endLine, blockIndex: block.blockIndex, sourceHash, promoted: true, conversionError: conv.error ?? null },
  });
  const now = Date.now();
  await storage.putDiagram({ ...d, fileId: file.id, createdAt: now, updatedAt: now, edited: false });
  const remaining = file.skipped.filter((s) => s.blockIndex !== blockIndex);
  await storage.putFile({ ...file, skipped: remaining });
  return d;
}

export { fileId };

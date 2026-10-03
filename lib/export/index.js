// Export orchestration: single diagrams and "export all" as a ZIP.
import { diagramToSvg } from './svg.js';
import { generateMermaid } from '../mermaid/generator.js';

export function safeFileName(name) {
  return String(name).replace(/[^\w\-. ]+/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'diagram';
}

export function diagramToJson(diagram) {
  return JSON.stringify({ format: 'diagram-workbench/1', exportedAt: new Date().toISOString(), diagram }, null, 2);
}

export function download(blobOrText, fileName, type = 'application/octet-stream') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** format: svg | png | pdf | json | mermaid */
export async function exportDiagram(diagram, format) {
  const base = safeFileName(diagram.name);
  switch (format) {
    case 'svg': return download(diagramToSvg(diagram).svg, `${base}.svg`, 'image/svg+xml');
    case 'json': return download(diagramToJson(diagram), `${base}.json`, 'application/json');
    case 'png': { const { diagramToPngBlob } = await import('./raster.js'); return download(await diagramToPngBlob(diagram), `${base}.png`); }
    case 'pdf': { const { diagramToPdfBlob } = await import('./raster.js'); return download(await diagramToPdfBlob(diagram), `${base}.pdf`); }
    case 'mermaid': {
      const g = generateMermaid(diagram);
      const text = g.ok ? g.text : diagram.source.format === 'mermaid' ? diagram.source.content : null;
      if (text == null) throw new Error(g.issues.join('; ') || 'Mermaid cannot be generated for this diagram');
      return download(text, `${base}.mmd`, 'text/plain');
    }
    default: throw new Error(`Unknown export format ${format}`);
  }
}

export async function exportAllZip(diagrams, formats = ['svg', 'json'], onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set();
  let i = 0;
  for (const d of diagrams) {
    i++;
    const stem = `${String(i).padStart(3, '0')}-${safeFileName(d.sourceFile.replace(/\.md$/i, ''))}-${safeFileName(d.name)}`;
    const folder = used.has(stem) ? `${stem}-${i}` : stem; used.add(stem);
    if (formats.includes('svg')) zip.file(`${folder}.svg`, diagramToSvg(d).svg);
    if (formats.includes('json')) zip.file(`${folder}.json`, diagramToJson(d));
    if (formats.includes('mermaid') && d.source.format === 'mermaid') zip.file(`${folder}.mmd`, d.source.content);
    if (formats.includes('png')) { const { diagramToPngBlob } = await import('./raster.js'); zip.file(`${folder}.png`, await diagramToPngBlob(d)); }
    onProgress?.(i, diagrams.length);
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return zip.generateAsync({ type: 'blob' });
}

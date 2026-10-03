// Browser-only: PNG and PDF from the model-derived SVG. (Loaded on demand.)
import { diagramToSvg } from './svg.js';

export async function svgToPngBlob(svgString, width, height, scale = 2) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not rasterise the SVG')); img.src = url; });
    const maxDim = 8192;
    const k = Math.min(scale, maxDim / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * k));
    canvas.height = Math.max(1, Math.round(height * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export async function diagramToPngBlob(diagram, scale = 2) {
  const { svg, width, height } = diagramToSvg(diagram);
  return svgToPngBlob(svg, width, height, scale);
}

export async function diagramToPdfBlob(diagram) {
  const { jsPDF } = await import('jspdf');
  const { svg, width, height } = diagramToSvg(diagram);
  const png = await svgToPngBlob(svg, width, height, 3);
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(png); });
  const landscape = width >= height;
  const pdf = new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'pt', format: [width, height], compress: true });
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height, undefined, 'FAST');
  pdf.setProperties({ title: diagram.name, subject: `Exported from ${diagram.sourceFile}` });
  return pdf.output('blob');
}

// Text measurement + default node sizing. Uses a canvas when one exists (browser / worker),
// otherwise a calibrated heuristic so node tests and SSR behave deterministically.

let ctx = null;
let triedCtx = false;
const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export { FONT_FAMILY };

function getCtx() {
  if (triedCtx) return ctx;
  triedCtx = true;
  try {
    if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(4, 4).getContext('2d');
    else if (typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  } catch { ctx = null; }
  return ctx;
}

export function textWidth(text, fontSize = 13, weight = 'normal', family = FONT_FAMILY) {
  const c = getCtx();
  if (c) {
    c.font = `${weight} ${fontSize}px ${family}`;
    return c.measureText(text).width;
  }
  let w = 0;
  for (const ch of text) {
    if (/[ilI.,:;|'!()\[\]\s]/.test(ch)) w += 0.34;
    else if (/[mwMW@%]/.test(ch)) w += 0.86;
    else if (/[A-Z]/.test(ch)) w += 0.66;
    else if (ch.charCodeAt(0) > 0x2e80) w += 1.0;
    else w += 0.56;
  }
  return w * fontSize * (family === MONO_FAMILY ? 1.08 : 1);
}

export const LINE_HEIGHT = 1.35;

export function measureLines(text, fontSize = 13, weight = 'normal', family = FONT_FAMILY) {
  const lines = String(text ?? '').split('\n');
  const width = Math.max(0, ...lines.map((l) => textWidth(l, fontSize, weight, family)));
  return { lines, width, height: lines.length * fontSize * LINE_HEIGHT };
}

/** Default (width,height) for a node. */
export function sizeForNode(node) {
  const fs = node.style?.fontSize ?? 13;
  const shape = node.shape ?? 'rectangle';
  if (shape === 'start') return { width: 18, height: 18 };
  if (shape === 'end') return { width: 24, height: 24 };
  if (node.bar) return { width: 90, height: 8 };
  if (shape === 'class') return classSize(node);

  const m = measureLines(node.label || '', fs);
  const members = node.members?.length ? measureLines(node.members.join('\n'), fs - 1) : { width: 0, height: 0 };
  let w = Math.max(m.width, members.width) + 32;
  let h = m.height + (members.height ? members.height + 8 : 0) + 22;
  w = Math.max(w, 80); h = Math.max(h, 38);
  switch (shape) {
    case 'diamond': return { width: Math.max(w * 1.5, 90), height: Math.max(h * 1.7, 64) };
    case 'circle': case 'doublecircle': { const d = Math.max(w * 0.85, h * 1.2, 60); return { width: d, height: d }; }
    case 'ellipse': return { width: w * 1.25, height: h * 1.2 };
    case 'hexagon': return { width: w + 30, height: h };
    case 'cylinder': return { width: w, height: h + 22 };
    case 'parallelogram': case 'trapezoid': return { width: w + 30, height: h };
    case 'stadium': return { width: w + 14, height: h };
    case 'document': return { width: w, height: h + 10 };
    case 'cloud': return { width: w + 40, height: h + 26 };
    case 'user': return { width: Math.max(70, m.width + 16), height: 90 };
    case 'server': case 'computer': case 'laptop': case 'mobile': return { width: Math.max(w, 90), height: Math.max(h + 24, 84) };
    case 'text': return { width: Math.max(m.width + 8, 40), height: Math.max(m.height + 8, 24) };
    case 'triangle': return { width: w + 40, height: h + 40 };
    default: return { width: w, height: h };
  }
}

export function classSize(node) {
  const fs = node.style?.fontSize ?? 12;
  const title = measureLines(node.label, fs + 1, 'bold');
  const stereo = node.stereotype ? measureLines(`«${node.stereotype}»`, fs - 1) : { width: 0, height: 0 };
  const attrs = measureLines((node.attributes ?? []).join('\n'), fs, 'normal', MONO_FAMILY);
  const meths = measureLines((node.methods ?? []).join('\n'), fs, 'normal', MONO_FAMILY);
  const width = Math.max(120, title.width + 24, stereo.width + 24, attrs.width + 20, meths.width + 20);
  const lineH = fs * LINE_HEIGHT;
  const headH = title.height + (stereo.height ? stereo.height : 0) + 14;
  const aH = (node.attributes?.length ?? 0) * lineH + 10;
  const mH = (node.methods?.length ?? 0) * lineH + 10;
  return { width: Math.ceil(width), height: Math.ceil(headH + (node.attributes?.length ? aH : 6) + (node.methods?.length ? mH : 0)) };
}

export function groupHeaderHeight(fontSize = 13) { return fontSize * LINE_HEIGHT + 14; }

// draw.io (diagrams.net) export: model -> mxGraph XML. Pure JS, no DOM.
// The XML can be pasted straight onto a draw.io canvas (Ctrl+V) or saved as a .drawio file.
import { absoluteMap } from '../diagrams/geometry.js';

const attr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Labels are rendered with html=1, so escape for HTML first, then for the XML attribute.
const htmlLabel = (s) => attr(String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>'));

const SHAPE_STYLE = {
  rectangle: 'rounded=0',
  rounded: 'rounded=1',
  stadium: 'rounded=1;arcSize=50',
  circle: 'ellipse',
  doublecircle: 'ellipse;shape=doubleEllipse',
  ellipse: 'ellipse',
  diamond: 'rhombus',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2',
  triangle: 'triangle',
  cylinder: 'shape=cylinder3;boundedLbl=1;size=10',
  subroutine: 'shape=process',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter',
  trapezoid: 'shape=trapezoid;perimeter=trapezoidPerimeter',
  document: 'shape=document;boundedLbl=1',
  folder: 'shape=folder;tabWidth=40;tabHeight=12',
  cloud: 'ellipse;shape=cloud',
  user: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top',
  server: 'shape=mxgraph.cisco.servers.standard_host;html=1',
  computer: 'shape=mxgraph.cisco.computers_and_peripherals.pc',
  laptop: 'shape=mxgraph.cisco.computers_and_peripherals.laptop',
  mobile: 'shape=mobile',
  component: 'shape=component',
  note: 'shape=note;size=14',
  text: 'text;strokeColor=none;fillColor=none',
  start: 'ellipse;fillColor=#000000',
  end: 'ellipse;shape=doubleEllipse',
  class: 'swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;collapsible=0',
  point: 'ellipse;aspect=fixed',
};

const ARROW = {
  none: ['none', 0], arrow: ['classic', 1], open: ['open', 0], cross: ['cross', 0],
  circle: ['oval', 1], diamond: ['diamond', 0], 'diamond-filled': ['diamond', 1], triangle: ['block', 0],
};

function arrowStyle(which, kind) {
  const [name, fill] = ARROW[kind] ?? ARROW.none;
  return `${which}Arrow=${name};${which}Fill=${fill}`;
}

function nodeStyle(n) {
  const s = n.style ?? {};
  const parts = [SHAPE_STYLE[n.shape] ?? 'rounded=0', 'whiteSpace=wrap', 'html=1'];
  if (n.shape !== 'text') {
    if (n.shape !== 'start') parts.push(`fillColor=${s.fill ?? '#ffffff'}`);
    parts.push(`strokeColor=${s.stroke ?? '#334155'}`, `strokeWidth=${s.strokeWidth ?? 1.5}`);
  }
  parts.push(`fontColor=${s.color ?? '#0f172a'}`, `fontSize=${s.fontSize ?? 13}`);
  if (s.dash) parts.push('dashed=1');
  return parts.join(';');
}

function groupStyle(g) {
  const s = g.style ?? {};
  return ['rounded=1', 'whiteSpace=wrap', 'html=1', 'verticalAlign=top', 'container=1', 'collapsible=0',
    `fillColor=${s.fill ?? '#f8fafc'}`, `strokeColor=${s.stroke ?? '#94a3b8'}`, `strokeWidth=${s.strokeWidth ?? 1.5}`,
    `fontColor=${s.color ?? '#334155'}`, `fontSize=${s.fontSize ?? 13}`, s.dash ? 'dashed=1' : ''].filter(Boolean).join(';');
}

function edgeStyle(e) {
  const s = e.style ?? {};
  const parts = ['html=1', 'rounded=1'];
  if (s.routing === 'smoothstep') parts.push('edgeStyle=orthogonalEdgeStyle');
  else if (s.routing === 'bezier') parts.push('curved=1');
  parts.push(arrowStyle('end', s.arrowEnd), arrowStyle('start', s.arrowStart));
  parts.push(`strokeColor=${s.color ?? '#334155'}`, `strokeWidth=${s.lineType === 'thick' ? Math.max(3, (s.width ?? 1.5) * 2) : (s.width ?? 1.5)}`);
  if (s.lineType === 'dashed') parts.push('dashed=1');
  if (s.lineType === 'dotted') parts.push('dashed=1;dashPattern=1 3');
  if (s.lineType === 'invisible') parts.push('strokeColor=none');
  return parts.join(';');
}

export function canExportDrawio(diagram) {
  return diagram.kind !== 'sequence' && diagram.kind !== 'reference' && (diagram.nodes.length > 0 || diagram.groups.length > 0);
}

/** Returns an <mxGraphModel> XML string (what draw.io puts on the clipboard when you copy shapes). */
export function diagramToDrawioXml(diagram) {
  if (!canExportDrawio(diagram)) throw new Error('draw.io export supports flowchart/graph-style diagrams (not sequence or reference diagrams)');
  const ids = new Map();
  [...diagram.groups, ...diagram.nodes].forEach((it, i) => ids.set(it.id, `c${i + 2}`));
  const abs = absoluteMap(diagram.groups, diagram.nodes);
  const rel = (it) => (it.parentId && ids.has(it.parentId) ? it : { ...it, ...abs.get(it.id) });
  const parentOf = (it) => (it.parentId && ids.has(it.parentId) ? ids.get(it.parentId) : '1');
  // Parents must precede children in the XML.
  const depth = (g) => { let d = 0; let cur = g; const by = new Map(diagram.groups.map((x) => [x.id, x])); while (cur?.parentId && by.has(cur.parentId)) { d++; cur = by.get(cur.parentId); } return d; };

  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const g of [...diagram.groups].sort((a, b) => depth(a) - depth(b))) {
    const r = rel(g);
    cells.push(`<mxCell id="${ids.get(g.id)}" value="${htmlLabel(g.label)}" style="${attr(groupStyle(g))}" vertex="1" parent="${parentOf(g)}"><mxGeometry x="${Math.round(r.x)}" y="${Math.round(r.y)}" width="${Math.round(g.width)}" height="${Math.round(g.height)}" as="geometry"/></mxCell>`);
  }
  for (const n of diagram.nodes) {
    const r = rel(n);
    let label = htmlLabel(n.label);
    if (n.shape === 'class' && n.members?.length) label = htmlLabel([n.label, ...n.members.map((m) => (typeof m === 'string' ? m : m.text ?? m.label ?? ''))].join('\n'));
    cells.push(`<mxCell id="${ids.get(n.id)}" value="${label}" style="${attr(nodeStyle(n))}" vertex="1" parent="${parentOf(n)}"><mxGeometry x="${Math.round(r.x)}" y="${Math.round(r.y)}" width="${Math.round(n.width)}" height="${Math.round(n.height)}" as="geometry"/></mxCell>`);
  }
  diagram.edges.forEach((e, i) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return;
    cells.push(`<mxCell id="e${i}" value="${htmlLabel(e.label)}" style="${attr(edgeStyle(e))}" edge="1" parent="1" source="${ids.get(e.source)}" target="${ids.get(e.target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  });

  return `<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel>`;
}

/** Full .drawio file (mxfile wrapper, uncompressed). */
export function diagramToDrawioFile(diagram) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="diagram-workbench"><diagram id="${attr(diagram.id)}" name="${attr(diagram.name)}">${diagramToDrawioXml(diagram)}</diagram></mxfile>`;
}

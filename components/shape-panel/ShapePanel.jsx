'use client';
import { shapeMarkup } from '@/lib/render/shapes';
import { SHAPE_PALETTE } from '../diagram-editor/util';

function Icon({ item }) {
  const shape = item.shape ?? item.key;
  let inner;
  if (item.key === 'arrow') inner = '<line x1="4" y1="22" x2="38" y2="6" stroke="#334155" stroke-width="1.6"/><path d="M38,6 l-9,1 M38,6 l-3,8" stroke="#334155" stroke-width="1.6" fill="none"/>';
  else if (item.key === 'connector') inner = '<line x1="4" y1="22" x2="38" y2="6" stroke="#334155" stroke-width="1.6"/><circle cx="4" cy="22" r="2.5" fill="#334155"/><circle cx="38" cy="6" r="2.5" fill="#334155"/>';
  else if (item.key === 'container') inner = '<rect x="3" y="3" width="36" height="22" rx="3" fill="#f8fafc" stroke="#94a3b8" stroke-dasharray="4 3" stroke-width="1.4"/><line x1="3" y1="10" x2="39" y2="10" stroke="#94a3b8"/>';
  else if (item.key === 'text') inner = '<text x="21" y="19" text-anchor="middle" font-size="15" font-family="serif" fill="#334155">T</text>';
  else inner = shapeMarkup(shape, 42, 28, { strokeWidth: 1.3, stroke: '#334155', fill: '#fff' });
  return <svg width="42" height="28" viewBox="0 0 42 28" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />;
}

export default function ShapePanel({ onAdd }) {
  return (
    <aside className="dw-shape-panel" aria-label="Shapes">
      <div className="dw-panel-title">Shapes</div>
      <div className="dw-shape-grid" role="list">
        {SHAPE_PALETTE.map((it) => (
          <button
            key={it.key} type="button" role="listitem" draggable title={`${it.label} — drag onto the canvas or click to add`}
            aria-label={`Add ${it.label}`}
            className="dw-shape-btn"
            onDragStart={(e) => { e.dataTransfer.setData('application/dw-shape', it.key); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => onAdd(it)}
          >
            <Icon item={it} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <p className="dw-hint">Drag a shape onto the canvas (drop onto a container to nest it), or click to add at the centre.</p>
    </aside>
  );
}

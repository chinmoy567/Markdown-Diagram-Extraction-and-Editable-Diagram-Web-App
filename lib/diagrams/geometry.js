// Pure geometry helpers shared by layout, ASCII conversion and exporters (no ELK import).
/** id -> absolute rect for groups and nodes. */
export function absoluteMap(groups, nodes) {
  const items = new Map();
  groups.forEach((g) => items.set(g.id, g));
  nodes.forEach((n) => items.set(n.id, n));
  const cache = new Map();
  const resolve = (id) => {
    if (cache.has(id)) return cache.get(id);
    const it = items.get(id);
    if (!it) return { x: 0, y: 0 };
    const parent = it.parentId && items.has(it.parentId) ? resolve(it.parentId) : { x: 0, y: 0 };
    const r = { x: parent.x + it.x, y: parent.y + it.y, width: it.width, height: it.height };
    cache.set(id, r);
    return r;
  };
  for (const id of items.keys()) resolve(id);
  return cache;
}

/** Pick which side of each rect a connector should leave/enter. */
export function bestHandles(a, b, self) {
  if (self) return ['right', 'right'];
  const acx = a.x + a.width / 2, acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2, bcy = b.y + b.height / 2;
  const dx = bcx - acx, dy = bcy - acy;
  const ex = Math.abs(dx) / ((a.width + b.width) / 2 || 1);
  const ey = Math.abs(dy) / ((a.height + b.height) / 2 || 1);
  if (ey >= ex) return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
}


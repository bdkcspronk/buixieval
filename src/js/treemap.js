// Squarified treemap: lays items (with .weight) into a w×h box, returning {item, x, y, w, h}.
function worst(row, side) {
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function placeRow(row, box, out) {
  const sum = row.reduce((s, r) => s + r.area, 0);
  if (box.w >= box.h) {
    const colW = sum / box.h;
    let y = box.y;
    for (const r of row) {
      const h = r.area / colW;
      out.push({ item: r.item, x: box.x, y, w: colW, h });
      y += h;
    }
    return { x: box.x + colW, y: box.y, w: box.w - colW, h: box.h };
  }
  const rowH = sum / box.w;
  let x = box.x;
  for (const r of row) {
    const w = r.area / rowH;
    out.push({ item: r.item, x, y: box.y, w, h: rowH });
    x += w;
  }
  return { x: box.x, y: box.y + rowH, w: box.w, h: box.h - rowH };
}

export function treemap(items, width, height) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!total) return [];
  const queue = [...items]
    .sort((a, b) => b.weight - a.weight)
    .map((item) => ({ item, area: (item.weight / total) * width * height }));

  const out = [];
  let box = { x: 0, y: 0, w: width, h: height };
  let row = [];
  while (queue.length) {
    const side = Math.min(box.w, box.h);
    const next = queue[0];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(queue.shift());
    } else {
      box = placeRow(row, box, out);
      row = [];
    }
  }
  if (row.length) placeRow(row, box, out);
  return out;
}

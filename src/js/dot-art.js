const C = {
  base: '#2a1d15',
  cream: '#e8dbb0',
  sand: '#c9b283',
  maroon: '#8a412f',
  blue: '#3d74d8',
  line: '#e6eef4',
};

const rand = (a, b) => a + Math.random() * (b - a);

function dot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function makeRiver(x0) {
  const amp = rand(25, 50);
  const freq = rand(0.006, 0.01);
  const phase = rand(0, Math.PI * 2);
  const slope = rand(-0.12, 0.12);
  return {
    x: (y) => x0 + slope * y + amp * Math.sin(y * freq + phase),
    dx: (y) => slope + amp * freq * Math.cos(y * freq + phase),
  };
}

function riverDistance(r, px, py) {
  return Math.abs(px - r.x(py)) / Math.hypot(r.dx(py), 1);
}

function offsetPoint(r, y, d) {
  const s = r.dx(y);
  const len = Math.hypot(s, 1);
  return [r.x(y) + d / len, y - (d * s) / len];
}

function drawRiver(ctx, r, h) {
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.line;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let y = -40; y <= h + 40; y += 3) {
      const [px, py] = offsetPoint(r, y, side * 19);
      if (y === -40) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  let acc = 0;
  let side = 1;
  let prev = [r.x(-40), -40];
  for (let y = -39; y <= h + 40; y += 1) {
    const p = [r.x(y), y];
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    if (acc >= 4.5) {
      acc = 0;
      side = -side;
      const [px, py] = offsetPoint(r, y, side * 8);
      dot(ctx, px, py, 3.6, C.blue);
    }
  }
}

function drawWaterhole(ctx, x, y) {
  const rings = [C.cream, C.blue, C.maroon, C.cream, C.blue];
  dot(ctx, x, y, 5.5, C.maroon);
  rings.forEach((color, i) => {
    const radius = 10 + i * 8.5;
    const n = Math.max(6, Math.round((2 * Math.PI * radius) / 8.6));
    const start = Math.random() * Math.PI;
    for (let j = 0; j < n; j++) {
      const a = start + (j / n) * Math.PI * 2;
      dot(ctx, x + Math.cos(a) * radius, y + Math.sin(a) * radius, 3.3, color);
    }
  });
  ctx.beginPath();
  ctx.arc(x, y, 52, 0, Math.PI * 2);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 4.5;
  ctx.stroke();
}

function draw(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, w, h);

  const riverCount = Math.max(1, Math.round(w / 520));
  const rivers = Array.from({ length: riverCount }, (_, i) =>
    makeRiver(((i + 0.5) * w) / riverCount + rand(-60, 60))
  );

  const holes = [];
  const holeCount = Math.max(2, Math.round((w * h) / 260000));
  for (let tries = 0; holes.length < holeCount && tries < 300; tries++) {
    const x = rand(40, w - 40);
    const y = rand(40, h - 40);
    const clearOfRivers = rivers.every((r) => riverDistance(r, x, y) > 85);
    const clearOfHoles = holes.every((o) => Math.hypot(o.x - x, o.y - y) > 160);
    if (clearOfRivers && clearOfHoles) holes.push({ x, y });
  }

  const stepX = 13;
  const stepY = 11.5;
  for (let row = 0, y = 4; y < h + stepY; row++, y += stepY) {
    for (let x = row % 2 ? stepX / 2 : 0; x < w + stepX; x += stepX) {
      const px = x + rand(-1.2, 1.2);
      const py = y + rand(-1.2, 1.2);
      if (rivers.some((r) => riverDistance(r, px, py) < 27)) continue;
      if (holes.some((o) => Math.hypot(o.x - px, o.y - py) < 60)) continue;
      const pick = Math.random();
      const color = pick < 0.12 ? C.maroon : pick < 0.25 ? C.sand : C.cream;
      dot(ctx, px, py, rand(2.8, 3.8), color);
    }
  }

  rivers.forEach((r) => drawRiver(ctx, r, h));
  holes.forEach((o) => drawWaterhole(ctx, o.x, o.y));
}

export function mountDotArt() {
  const canvas = document.createElement('canvas');
  canvas.className = 'dot-art';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  // Drawn taller than the viewport so mobile URL-bar resizes don't force a redraw.
  let drawnW = 0;
  let drawnH = 0;
  const render = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === drawnW && h <= drawnH) return;
    drawnW = w;
    drawnH = h + 120;
    draw(canvas, drawnW, drawnH);
  };

  render();
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
}

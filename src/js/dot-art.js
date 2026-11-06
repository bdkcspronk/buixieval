const C = {
  base: '#2a1d15',
  cream: '#e8dbb0',
  sand: '#c9b283',
  maroon: '#8a412f',
  blue: '#3d74d8',
  line: '#e6eef4',
};

// Scales every size and spacing in the art; 1.5 draws ~2.25x fewer dots than 1.
const S = 1.5;

const rand = (a, b) => a + Math.random() * (b - a);

function dot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function makeRiver(x0) {
  const amp = rand(25, 50) * S;
  const freq = rand(0.006, 0.01) / S;
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

const FLOW = 14 * S; // px/s the blue dots travel downstream
const DOT_GAP = 4.5 * S;

function drawRiverBanks(ctx, r, h) {
  const pad = 40 * S;
  ctx.lineWidth = 4.5 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.line;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let y = -pad; y <= h + pad; y += 3) {
      const [px, py] = offsetPoint(r, y, side * 19 * S);
      if (y === -pad) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

// Precomputes where each pixel of river height sits along the river's length,
// so the flowing dots can be placed by distance travelled each frame.
function riverPath(r, h) {
  const pad = 40 * S;
  const ys = [];
  const lens = [];
  let len = 0;
  let prevX = r.x(-pad);
  for (let y = -pad; y <= h + pad; y += 1) {
    const x = r.x(y);
    len += Math.hypot(x - prevX, 1);
    prevX = x;
    ys.push(y);
    lens.push(len);
  }
  return { r, ys, lens };
}

// Dots alternate sides every DOT_GAP; shifting them by a multiple of two gaps
// lands on the same pattern, so the offset loops seamlessly.
function addRiverDots(path, river, t) {
  const { r, ys, lens } = river;
  let next = (t * FLOW) % (2 * DOT_GAP);
  let k = 0;
  for (let i = 0; i < ys.length; i++) {
    while (lens[i] >= next) {
      const [px, py] = offsetPoint(r, ys[i], (k % 2 ? -8 : 8) * S);
      const rad = 3.6 * S;
      path.moveTo(px + rad, py);
      path.arc(px, py, rad, 0, Math.PI * 2);
      next += DOT_GAP;
      k++;
    }
  }
}

const RING_COLORS = [C.cream, C.blue, C.maroon];
const MIN_RINGS = 5;
const MAX_RINGS = 14;
const RIVER_HALF = 21.25 * S; // centreline to the outer edge of a bank line

// Radius of the white outline around a hole with this many rings (52 for 5 rings at S=1).
const holeOutline = (rings) => (10 + (rings - 1) * 8.5 + 8) * S;

// True distance from a point to the river's centreline, sampled along the curve, so
// big holes are checked against the bends above and below them, not just level with the centre.
function riverClearance(r, x, y, reach) {
  let min = Infinity;
  for (let yy = y - reach; yy <= y + reach; yy += 2) {
    min = Math.min(min, Math.hypot(r.x(yy) - x, yy - y));
  }
  return min;
}

function drawWaterhole(ctx, { x, y, rings }) {
  dot(ctx, x, y, 5.5 * S, C.maroon);
  for (let i = 0; i < rings; i++) {
    const radius = (10 + i * 8.5) * S;
    const n = Math.max(6, Math.round((2 * Math.PI * radius) / (8.6 * S)));
    const start = Math.random() * Math.PI;
    const color = RING_COLORS[i % RING_COLORS.length];
    for (let j = 0; j < n; j++) {
      const a = start + (j / n) * Math.PI * 2;
      dot(ctx, x + Math.cos(a) * radius, y + Math.sin(a) * radius, 3.3 * S, color);
    }
  }
  ctx.beginPath();
  ctx.arc(x, y, holeOutline(rings), 0, Math.PI * 2);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 4.5 * S;
  ctx.stroke();
}

// Draws everything that stays still onto an offscreen layer once, and returns a
// function that paints that layer plus the flowing river dots for time t (seconds).
function build(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const bg = document.createElement('canvas');
  bg.width = canvas.width;
  bg.height = canvas.height;
  const ctx = bg.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, w, h);

  const riverCount = Math.max(1, Math.round(w / (520 * S)));
  const rivers = Array.from({ length: riverCount }, (_, i) =>
    makeRiver(((i + 0.5) * w) / riverCount + rand(-60, 60) * S)
  );

  // Holes are spread by splitting the screen into a grid of roughly equal cells and
  // placing at most one hole at a random spot inside each cell, so no side of the
  // screen can end up crowded while another stays empty.
  const holes = [];
  const cellSize = 510 * S;
  const cols = Math.max(1, Math.round(w / cellSize));
  let rows = Math.max(1, Math.round(h / cellSize));
  if (cols * rows < 2) rows = 2;
  const cellW = w / cols;
  const cellH = h / rows;
  const cells = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) cells.push([cx, cy]);
  cells.sort(() => Math.random() - 0.5); // random order, so neighbours don't always lose out the same way

  const inset = 0.15; // keep centres off the cell borders so neighbouring holes don't bunch up
  for (const [cx, cy] of cells) {
    const target = MIN_RINGS + Math.floor(Math.random() * (MAX_RINGS - MIN_RINGS + 1));
    let best = null;
    for (let tries = 0; tries < 40 && !(best && best.rings === target); tries++) {
      const x = (cx + rand(inset, 1 - inset)) * cellW;
      const y = (cy + rand(inset, 1 - inset)) * cellH;
      // Shrink ring by ring until the hole fits between the rivers and the other holes.
      const roomFromRivers = Math.min(
        ...rivers.map((r) => riverClearance(r, x, y, holeOutline(MAX_RINGS) + RIVER_HALF + 20 * S))
      );
      const roomFromHoles = Math.min(...holes.map((o) => Math.hypot(o.x - x, o.y - y) - o.outline - 22 * S));
      const room = Math.min(roomFromRivers - RIVER_HALF - 12 * S, roomFromHoles);
      let rings = target;
      while (rings >= MIN_RINGS && holeOutline(rings) > room) rings--;
      if (rings >= MIN_RINGS && (!best || rings > best.rings)) best = { x, y, rings };
    }
    if (best) holes.push({ ...best, outline: holeOutline(best.rings) });
  }

  const stepX = 13 * S;
  const stepY = 11.5 * S;
  const jitter = 1.2 * S;
  for (let row = 0, y = 4 * S; y < h + stepY; row++, y += stepY) {
    for (let x = row % 2 ? stepX / 2 : 0; x < w + stepX; x += stepX) {
      const px = x + rand(-jitter, jitter);
      const py = y + rand(-jitter, jitter);
      if (rivers.some((r) => riverDistance(r, px, py) < 27 * S)) continue;
      if (holes.some((o) => Math.hypot(o.x - px, o.y - py) < o.outline + 8 * S)) continue;
      const pick = Math.random();
      const color = pick < 0.12 ? C.maroon : pick < 0.25 ? C.sand : C.cream;
      dot(ctx, px, py, rand(2.8, 3.8) * S, color);
    }
  }

  rivers.forEach((r) => drawRiverBanks(ctx, r, h));
  holes.forEach((o) => drawWaterhole(ctx, o));

  const paths = rivers.map((r) => riverPath(r, h));
  const out = canvas.getContext('2d');
  return (t) => {
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(bg, 0, 0);
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
    const blue = new Path2D();
    paths.forEach((p) => addRiverDots(blue, p, t));
    out.fillStyle = C.blue;
    out.fill(blue);
  };
}

export function mountDotArt() {
  const canvas = document.createElement('canvas');
  canvas.className = 'dot-art';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  const now = () => (performance.now() - start) / 1000;

  // Drawn taller than the viewport so mobile URL-bar resizes don't force a redraw.
  let drawnW = 0;
  let drawnH = 0;
  let paint = null;
  const render = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === drawnW && h <= drawnH) return;
    drawnW = w;
    drawnH = h + 120;
    paint = build(canvas, drawnW, drawnH);
    paint(now());
  };

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    paint(now());
  };
  const syncMotion = () => {
    cancelAnimationFrame(raf);
    if (!reduceMotion?.matches) raf = requestAnimationFrame(tick);
  };

  render();
  syncMotion();
  reduceMotion?.addEventListener?.('change', syncMotion);

  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
}

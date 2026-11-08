// Outback ambience: a floating sound toggle. While it is on, the bird-call loop
// plays, the occasional bird or small flock flies across the screen, and now and
// then dingoes trot or kangaroos hop along the bottom.

const AUDIO_SRC = '/audio/outback.mp3';
const VOLUME = 0.5;
const FADE_MS = 800;
const FIRST_FLOCK_DELAY = [0, 0];
const RESUME_FLOCK_DELAY = [2500, 6000];
const STORAGE_KEY = 'bx-sound';
const MAX_BIRDS = 15; // on screen (or waiting to enter) at once, however fast the button is pressed
const NEXT_FLOCK_DELAY = [10000, 25000];
const NEXT_FLOCK_DELAY_PHONE = [16000, 34000];
const isPhone = () => window.matchMedia?.('(max-width: 640px)').matches ?? window.innerWidth <= 640;

// Each sheet holds its frames side by side (width/height = ratio of one frame).
// `cycle` is the order the frames play in.
const FLYERS = [
  { sheet: '/images/cockatoo-sheet.webp', ratio: 300 / 258, frames: 4, cycle: [0, 1, 2, 3] },
  { sheet: '/images/galah-sheet.webp', ratio: 300 / 362, frames: 4, cycle: [0, 1, 2, 3] },
  // Lorikeet: wings up, mid, down, mid.
  { sheet: '/images/lorikeet-sheet.webp', ratio: 300 / 277, frames: 3, cycle: [1, 0, 2, 0] },
];

// Ground animals cross along the bottom of the screen. Their sheets are lined up
// on the torso with every frame's feet on the bottom edge. `stride` is how far one
// gait cycle carries them, in frame widths, so their feet don't slide.
const WALKERS = [
  { sheet: '/images/dingo-sheet.webp', ratio: 480 / 285, frames: 4, cycle: [0, 1, 2, 3], cadence: [0.6, 0.72], stride: 0.85, pack: [1, 3] },
  // Kangaroo frames: 0 crouch, 1 airborne, 2 landing, 3 standing up for a look around.
  { sheet: '/images/kangaroo-sheet.webp', ratio: 480 / 403, frames: 4, hop: { crouch: 0, air: 1, land: 2, stand: 3 }, cadence: [0.7, 0.85], stride: 1.3, pack: [1, 3], scale: 1.15 }, // its long tail eats into the width
];

const rand = (min, max) => min + Math.random() * (max - min);

// Shuffled rounds: every animal shows up once per round, in a new order each
// time, and a round never opens with the animal that closed the previous one.
// The round lives in sessionStorage so it carries on from page to page.
const ROUND_KEY = 'bx-ambience-round';
const ANIMALS = [...FLYERS, ...WALKERS];
const bySheet = (sheet) => ANIMALS.find((animal) => animal.sheet === sheet);

function loadRound() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ROUND_KEY));
    return {
      round: (saved?.round ?? []).map(bySheet).filter(Boolean),
      last: bySheet(saved?.last) ?? null,
    };
  } catch {
    return { round: [], last: null };
  }
}

function nextAnimal() {
  let { round, last } = loadRound();
  if (!round.length) {
    round = [...ANIMALS];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    if (round[0] === last) round.push(round.shift());
  }
  last = round.shift();
  try {
    sessionStorage.setItem(ROUND_KEY, JSON.stringify({ round: round.map((a) => a.sheet), last: last.sheet }));
  } catch {
    // Storage blocked: the round just restarts on the next page.
  }
  return last;
}

const framePosition = (species, frame) => `${(frame / (species.frames - 1)) * 100}% 0`;

// Plays the sheet's frames in `cycle` order, each for an equal share of `period` seconds.
function playFrames(sprite, species, period, phase) {
  // The step easing goes on each keyframe: in the options it would apply to the
  // whole cycle and hold the first frame the entire time.
  const keys = [...species.cycle, species.cycle[0]].map((frame) => ({
    backgroundPosition: framePosition(species, frame),
    easing: 'steps(1, end)',
  }));
  return sprite.animate(keys, { duration: period * 1000, delay: -phase * 1000, iterations: Infinity });
}

function createSprite(layer, species, size, direction) {
  const animal = document.createElement('div');
  animal.className = 'bird';
  animal.style.width = `${size}px`;
  const sprite = document.createElement('div');
  sprite.className = 'bird-sprite';
  sprite.style.backgroundImage = `url(${species.sheet})`;
  sprite.style.backgroundSize = `${species.frames * 100}% 100%`;
  sprite.style.aspectRatio = String(species.ratio);
  sprite.style.transform = direction < 0 ? 'scaleX(-1)' : 'none';
  animal.appendChild(sprite);
  layer.appendChild(animal);
  return { animal, sprite };
}

function createBird(layer, { species, direction, top, size, duration, delay }) {
  const { animal: bird, sprite } = createSprite(layer, species, size, direction);
  // Own flap speed and starting phase per bird, so a flock never flaps in unison.
  playFrames(sprite, species, rand(0.4, 0.58), rand(0, 0.6));

  const width = window.innerWidth;
  const startX = direction > 0 ? -size - 20 : width + 20;
  const endX = direction > 0 ? width + 20 : -size - 20;
  const y = (step) => `${top + Math.sin(step * Math.PI * 2 + rand(0, 1)) * rand(10, 30)}px`;
  const frames = [0, 0.33, 0.66, 1].map((step) => ({
    transform: `translate(${startX + (endX - startX) * step}px, ${y(step)})`,
  }));

  const animation = bird.animate(frames, { duration, delay, easing: 'linear', fill: 'both' });
  animation.onfinish = () => bird.remove();
  animation.oncancel = () => bird.remove();
  return animation;
}

// Trots at a steady pace, legs cycling in time with the ground it covers.
function createWalker(layer, { species, direction, top, size, delay }) {
  const { animal, sprite } = createSprite(layer, species, size, direction);
  const period = rand(...species.cadence);
  playFrames(sprite, species, period, rand(0, period));

  const width = window.innerWidth;
  const startX = direction > 0 ? -size - 20 : width + 20;
  const endX = direction > 0 ? width + 20 : -size - 20;
  const speed = (size * species.stride) / period; // px per second
  const duration = (Math.abs(endX - startX) / speed) * 1000;
  const at = (x) => ({ transform: `translate(${x}px, ${top}px)` });

  const animation = animal.animate([at(startX), at(endX)], { duration, delay, easing: 'linear', fill: 'both' });
  animation.onfinish = () => animal.remove();
  animation.oncancel = () => animal.remove();
  return animation;
}

// Hops: barely moves while its feet are on the ground (crouch, landing), covers
// most of each hop in the air along an arc, and may stop once to stand up.
// Movement and frames are built on one timeline, so they never drift apart.
const HOP = { crouch: 0.25, air: 0.5, land: 0.25 }; // share of a hop's time
const GROUND_SHARE = 0.12; // share of a hop's distance covered in each ground phase

function createHopper(layer, { species, direction, top, size, delay, pause }) {
  const { animal, sprite } = createSprite(layer, species, size, direction);
  const { crouch, air, land, stand } = species.hop;
  const period = rand(...species.cadence) * 1000;
  const hopLength = size * species.stride * direction;
  const lift = (size / species.ratio) * rand(0.14, 0.2);

  const width = window.innerWidth;
  const startX = direction > 0 ? -size - 20 : width + 20;
  const endX = direction > 0 ? width + 20 : -size - 20;
  const hops = Math.ceil(Math.abs(endX - startX) / Math.abs(hopLength));
  const stopAfter = pause ? Math.floor(hops * rand(0.3, 0.65)) : -1;

  const path = [];
  const poses = [];
  let t = 0;
  let x = startX;
  const point = (dx = 0, dy = 0) => path.push({ t, x: x + dx, y: dy });
  const pose = (frame) => poses.push({ t, frame });

  for (let i = 0; i < hops; i++) {
    if (i === stopAfter) {
      pose(stand);
      point();
      t += pause;
      point();
    }
    pose(crouch);
    point();
    t += period * HOP.crouch;
    x += hopLength * GROUND_SHARE;
    pose(air);
    point();
    const flight = hopLength * (1 - 2 * GROUND_SHARE);
    for (let k = 1; k < 6; k++) {
      const step = k / 6;
      path.push({ t: t + period * HOP.air * step, x: x + flight * step, y: -Math.sin(step * Math.PI) * lift });
    }
    t += period * HOP.air;
    x += flight;
    pose(land);
    point();
    t += period * HOP.land;
    x += hopLength * GROUND_SHARE;
  }
  point();
  pose(land);

  const duration = t;
  const move = path.map((p) => ({ offset: p.t / duration, transform: `translate(${p.x}px, ${top + p.y}px)` }));
  const frames = poses.map((p) => ({
    offset: p.t / duration,
    backgroundPosition: framePosition(species, p.frame),
    easing: 'steps(1, end)',
  }));

  sprite.animate(frames, { duration, delay, fill: 'both' });
  const animation = animal.animate(move, { duration, delay, easing: 'linear', fill: 'both' });
  animation.onfinish = () => animal.remove();
  animation.oncancel = () => animal.remove();
  return animation;
}

function sendWalkers(layer, species, room) {
  const direction = Math.random() < 0.5 ? 1 : -1;
  const count = Math.min(room, Math.floor(rand(species.pack[0], species.pack[1] + 1)));
  const height = window.innerHeight;
  const phone = isPhone();
  const maxSize = (phone ? window.innerWidth * 0.6 : Math.min(360, window.innerWidth * 0.4)) * (species.scale ?? 1);
  const minSize = maxSize * 0.7;
  // The whole mob stops together, if it stops at all.
  const pause = species.hop && Math.random() < 0.6 ? rand(1400, 2800) : 0;
  const create = species.hop ? createHopper : createWalker;

  let delay = 0;
  for (let i = 0; i < count; i++) {
    const size = rand(minSize, maxSize);
    create(layer, {
      species,
      direction,
      top: height - size / species.ratio - rand(6, phone ? 30 : 60),
      size,
      delay,
      pause,
    });
    delay += rand(700, 1600);
  }
}

function sendFlock(layer) {
  const room = MAX_BIRDS - layer.childElementCount;
  if (room <= 0) return;
  const species = nextAnimal();
  if (WALKERS.includes(species)) {
    sendWalkers(layer, species, room);
    return;
  }
  const direction = Math.random() < 0.5 ? 1 : -1;
  const count = Math.min(room, Math.random() < 0.3 ? 1 : Math.floor(rand(3, 6)));
  const height = window.innerHeight;
  // Phones: bigger birds that cross faster, with more time between them.
  const phone = isPhone();
  const maxSize = phone ? window.innerWidth * 0.5 : Math.min(240, window.innerWidth * 0.34);
  const minSize = maxSize * 0.5;
  const baseTop = rand(height * 0.1, height * 0.5);
  const baseDuration = phone ? rand(4500, 7000) : rand(8000, 13000);

  let delay = 0;
  for (let i = 0; i < count; i++) {
    // Each bird gets its own scale. Spacing grows with every bird, and
    // neighbours alternate above/below the flock's line so they never stack.
    const side = i % 2 === 0 ? 1 : -1;
    const size = rand(minSize, maxSize);
    createBird(layer, {
      species,
      direction,
      top: Math.max(10, Math.min(height - size / species.ratio - 10, baseTop + side * rand(20, 70) + rand(-15, 15))),
      size,
      duration: baseDuration * rand(0.94, 1.06),
      delay,
    });
    delay += phone ? rand(900, 1700) : rand(380, 800);
  }
}

export function mountAmbience() {
  if (document.querySelector('.ambience-toggle')) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'bird-layer';
  layer.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ambience-toggle';
  button.innerHTML = `
    <svg class="amb-icon amb-icon-off" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9v6h4l5 4V5L7 9z"/><path d="M16 9l5 6M21 9l-5 6" class="amb-x"/>
    </svg>
    <svg class="amb-icon amb-icon-on" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9v6h4l5 4V5L7 9z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" class="amb-x"/>
    </svg>`;

  document.body.append(layer, button);

  let on = false;
  let flockTimer = null;
  let stopTimer = null;
  // Web Audio, not <audio loop>: it loops the decoded clip with no gap at the seam.
  let ctx = null;
  let gain = null;
  let source = null;
  let buffer = null;
  let loading = null;

  const setButtonState = () => {
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    const label = on ? 'Turn outback sounds off' : 'Turn outback sounds on';
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  const loadBuffer = () => {
    loading ??= fetch(AUDIO_SRC)
      .then((res) => {
        if (!res.ok) throw new Error('audio missing');
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((decoded) => (buffer = decoded))
      .catch((error) => {
        loading = null;
        throw error;
      });
    return loading;
  };

  const fadeGain = (target) => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + FADE_MS / 1000);
  };

  const playSound = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctx) {
      ctx = new AudioCtx();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
    }
    clearTimeout(stopTimer);
    ctx.resume();
    loadBuffer()
      .then(() => {
        if (!on) return;
        if (!source) {
          source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(gain);
          source.start();
        }
        fadeGain(VOLUME);
      })
      .catch(() => {
        // Missing or unsupported audio: the birds can still fly.
      });
  };

  const stopSound = () => {
    if (!ctx) return;
    fadeGain(0);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      if (on) return;
      source?.stop();
      source = null;
      ctx.suspend();
    }, FADE_MS + 100);
  };

  const scheduleFlock = (range) => {
    clearTimeout(flockTimer);
    flockTimer = setTimeout(() => {
      if (!on) return;
      if (!document.hidden && !reduceMotion?.matches) sendFlock(layer);
      scheduleFlock(isPhone() ? NEXT_FLOCK_DELAY_PHONE : NEXT_FLOCK_DELAY);
    }, rand(range[0], range[1]));
  };

  // The choice lives in sessionStorage so it follows you from page to page in this tab.
  const remember = (value) => {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the sound just won't carry over between pages.
    }
  };

  const start = ({ resumed = false } = {}) => {
    on = true;
    remember(true);
    setButtonState();
    playSound();
    scheduleFlock(resumed ? RESUME_FLOCK_DELAY : FIRST_FLOCK_DELAY);
    if (resumed) armGestureResume();
  };

  const stop = () => {
    on = false;
    remember(false);
    setButtonState();
    clearTimeout(flockTimer);
    stopSound();
  };

  // Browsers may refuse to start audio on a new page without a click. When that
  // happens the button already reads "on", and the next tap or key press anywhere
  // lets the sound through.
  const armGestureResume = () => {
    const events = ['pointerdown', 'keydown'];
    const resume = (event) => {
      if (!on || !ctx || event.target.closest?.('.ambience-toggle')) return;
      ctx.resume();
      if (ctx.state === 'running') events.forEach((name) => window.removeEventListener(name, resume, true));
    };
    events.forEach((name) => window.addEventListener(name, resume, true));
  };

  button.addEventListener('click', () => {
    // Button reads "on" but the browser is still holding the audio back: a tap
    // on the button should let it through, not switch it off.
    if (on && ctx?.state === 'suspended') {
      ctx.resume();
      return;
    }
    on ? stop() : start();
  });
  setButtonState();

  let wasOn = false;
  try {
    wasOn = sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage blocked: start off.
  }
  if (wasOn) start({ resumed: true });
}

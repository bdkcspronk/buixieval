// Outback ambience: a floating sound toggle. While it is on, the bird-call loop
// plays and the occasional bird or small flock flies across the screen.

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

// Each sheet holds the 4 flap frames side by side (width/height = ratio of one frame).
const SPECIES = [
  { sheet: '/images/cockatoo-sheet.webp', ratio: 300 / 258 },
  { sheet: '/images/galah-sheet.webp', ratio: 300 / 362 },
];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function createBird(layer, { species, direction, top, size, duration, delay }) {
  const bird = document.createElement('div');
  bird.className = 'bird';
  bird.style.width = `${size}px`;
  const sprite = document.createElement('div');
  sprite.className = 'bird-sprite';
  sprite.style.backgroundImage = `url(${species.sheet})`;
  sprite.style.aspectRatio = String(species.ratio);
  // Own flap speed and starting phase per bird, so a flock never flaps in unison.
  sprite.style.setProperty('--flap', `${rand(0.4, 0.58).toFixed(2)}s`);
  sprite.style.animationDelay = `-${rand(0, 0.6).toFixed(2)}s`;
  sprite.style.transform = direction < 0 ? 'scaleX(-1)' : 'none';
  bird.appendChild(sprite);
  layer.appendChild(bird);

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

function sendFlock(layer) {
  const species = pick(SPECIES);
  const direction = Math.random() < 0.5 ? 1 : -1;
  const room = MAX_BIRDS - layer.childElementCount;
  if (room <= 0) return;
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

export function startCountdown(targetDate, el) {
  const target = new Date(targetDate).getTime();

  function tick() {
    const now = Date.now();
    const diff = Math.max(0, target - now);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    el.querySelector('[data-days]').textContent = String(days).padStart(2, '0');
    el.querySelector('[data-hours]').textContent = String(hours).padStart(2, '0');
    el.querySelector('[data-minutes]').textContent = String(minutes).padStart(2, '0');
    el.querySelector('[data-seconds]').textContent = String(seconds).padStart(2, '0');

    if (diff <= 0) clearInterval(interval);
  }

  tick();
  const interval = setInterval(tick, 1000);
}

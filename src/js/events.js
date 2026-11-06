import '../css/style.css';
import { schedule } from './schedule-data.js';
import { mountDotArt } from './dot-art.js';
import { isConfigured } from './firebase.js';
import { watchPublic } from './store.js';
import { accountLinks } from './account.js';

mountDotArt();

const listEl = document.querySelector('#events-list');
if (listEl) {
  listEl.innerHTML = schedule.map((ev, i) => `
    <article class="label-panel event-card" id="day-${i + 1}">
      <div class="event-side">
        <span class="day-badge">${ev.day.slice(0, 3)}<small>${ev.date}</small></span>
        <span class="event-emoji" aria-hidden="true">${ev.emoji}</span>
      </div>
      <div class="event-body">
        <h2>${ev.title}</h2>
        <p class="time">${ev.day} · ${ev.time}</p>
        <p class="blurb">${ev.blurb}</p>
        <div class="tag-row">
          ${ev.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
          <span class="tag going" data-going="${ev.key}" hidden></span>
        </div>
      </div>
    </article>
  `).join('');

  if (isConfigured) {
    const refreshLinks = accountLinks();
    watchPublic((stats) => {
      refreshLinks(stats);
      listEl.querySelectorAll('[data-going]').forEach((el) => {
        const n = stats.going[el.dataset.going] || 0;
        el.textContent = `${n} going`;
        el.hidden = n === 0;
      });
    }, () => {});
  }
}

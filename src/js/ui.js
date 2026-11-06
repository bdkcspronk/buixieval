const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const euroFormat = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euro = (amount) => euroFormat.format(amount);

export const teamColorClass = (team) => (team?.id === 'blue' ? 'team-blue' : team?.id === 'pink' ? 'team-pink' : '');

export const revolutLink = (username) => `https://revolut.me/${encodeURIComponent(username)}`;

export function closedNotice(what) {
  return `
    <div class="jar-panel notice-panel">
      <p class="script">${escapeHtml(what)} opens soon!</p>
      <p>Check back soon — this bit isn't switched on yet.</p>
    </div>`;
}

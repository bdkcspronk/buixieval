import '../css/style.css';
import { startCountdown } from './countdown.js';
import { mountDotArt } from './dot-art.js';
import { mountAmbience } from './ambience.js';
import { isConfigured } from './firebase.js';
import { watchPublic } from './store.js';
import { renderTally } from './tally.js';
import { closedNotice } from './ui.js';
import { accountLinks } from './account.js';

mountDotArt();
mountAmbience();

const countdownEl = document.querySelector('#countdown');
if (countdownEl) {
  startCountdown('2027-04-12T16:00:00', countdownEl);
}

const tallyRoot = document.querySelector('#tally-root');
if (tallyRoot) {
  if (!isConfigured) {
    tallyRoot.innerHTML = closedNotice('The live tally');
  } else {
    const refreshLinks = accountLinks();
    watchPublic(
      (stats) => { renderTally(tallyRoot, stats); refreshLinks(stats); },
      () => { tallyRoot.innerHTML = closedNotice('The live tally'); },
    );
  }
}

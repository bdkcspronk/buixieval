import { defineConfig } from 'vite';
import { resolve } from 'path';

const tunnelHosts = ['.loca.lt', '.trycloudflare.com'];

// The site is served on buixieval.xyz, but Firebase also serves the same files on
// buixieval.web.app / .firebaseapp.com. Hosting redirect rules can't tell those
// apart, so each page sends visitors on the old hostnames to buixieval.xyz itself,
// before anything renders. (The default buixieval-9c293 site redirects in firebase.json.)
const canonicalRedirect = {
  name: 'canonical-redirect',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children:
        "if(['buixieval.web.app','buixieval.firebaseapp.com'].includes(location.hostname))" +
        "location.replace('https://buixieval.xyz'+location.pathname+location.search+location.hash);",
    },
  ],
};

export default defineConfig({
  plugins: [canonicalRedirect],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        events: resolve(__dirname, 'events.html'),
        signup: resolve(__dirname, 'signup.html'),
        donate: resolve(__dirname, 'donate.html'),
        admin: resolve(__dirname, 'admin.html'),
        team: resolve(__dirname, 'team.html'),
      },
    },
  },
  preview: { allowedHosts: tunnelHosts },
  server: { allowedHosts: tunnelHosts },
});

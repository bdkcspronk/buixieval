import { defineConfig } from 'vite';
import { resolve } from 'path';

const tunnelHosts = ['.loca.lt', '.trycloudflare.com'];

export default defineConfig({
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

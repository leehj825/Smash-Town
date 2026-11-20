import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset URLs so a built copy works from any path or static host
  server: { host: true },
  build: { chunkSizeWarningLimit: 1200 },
});

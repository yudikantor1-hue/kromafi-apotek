import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Worker API runs under `npm run dev:api` (wrangler dev) on port 8787.
// Vite serves the PWA shell on 5173 and proxies API calls so the browser sees
// a single origin, matching the deployed Cloudflare Pages + Worker setup.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

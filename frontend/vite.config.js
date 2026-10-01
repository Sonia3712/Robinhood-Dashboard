import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';

import path from 'path';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  root: __dirname,

  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    host: '0.0.0.0',
    allowedHosts: ['dexscreener.coinduck.io'],
  },

  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
}));
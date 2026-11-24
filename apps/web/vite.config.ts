import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const backend = process.env.WEFT_BACKEND_URL ?? 'http://localhost:8080';
// VITE_STANDALONE=true builds the static demo for GitHub Pages (served under VITE_BASE, e.g. /weft/).
const standalone = process.env.VITE_STANDALONE === 'true';
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [{ name: 'weft-offline-shell', apply: (_config, { command }) => command === 'build' && !standalone, generateBundle(_options, bundle) {
    const assets = ['/', '/index.html', ...Object.keys(bundle).filter(path => /\.(js|css)$/.test(path)).map(path => `/${path}`)];
    const template = readFileSync(new URL('./src/offline/worker.js', import.meta.url), 'utf8');
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('"__WEFT_MANIFEST__"', JSON.stringify(assets)) });
  } }],
  server: { proxy: { '/ws': { target: backend.replace(/^http/, 'ws'), ws: true }, '/api': backend } },
});

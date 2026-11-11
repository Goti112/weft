import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const backend = process.env.WEFT_BACKEND_URL ?? 'http://localhost:8080';
export default defineConfig({
  plugins: [{ name: 'weft-offline-shell', apply: 'build', generateBundle(_options, bundle) {
    const assets = ['/', '/index.html', ...Object.keys(bundle).filter(path => /\.(js|css)$/.test(path)).map(path => `/${path}`)];
    const template = readFileSync(new URL('./src/offline/worker.js', import.meta.url), 'utf8');
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('"__WEFT_MANIFEST__"', JSON.stringify(assets)) });
  } }],
  server: { proxy: { '/ws': { target: backend.replace(/^http/, 'ws'), ws: true }, '/api': backend } },
});

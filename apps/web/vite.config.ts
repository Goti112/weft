import { defineConfig } from 'vite';
const backend = process.env.WEFT_BACKEND_URL ?? 'http://localhost:8080';
export default defineConfig({ server: { proxy: { '/ws': { target: backend.replace(/^http/, 'ws'), ws: true }, '/api': backend } } });

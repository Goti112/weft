import { createRoot } from 'react-dom/client';
import { App } from './App';
import { STANDALONE } from './standalone';
import './style.css';
createRoot(document.getElementById('root')!).render(<App />);
// The static demo keeps its state in memory, so it has no offline shell to cache.
if (import.meta.env.PROD && !STANDALONE && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => { /* The document remains usable; offline readiness is not announced. */ });
}

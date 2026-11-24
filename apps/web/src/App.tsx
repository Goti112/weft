import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DocPage } from './pages/DocPage';
import { DemoPage } from './demo/DemoPage';
import { STANDALONE } from './standalone';

// GitHub Pages serves the static demo under /weft/; the full app is served at /.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return <BrowserRouter basename={basename}><Routes>
    <Route path="/" element={<DemoPage />} />
    {!STANDALONE && <Route path="/d/:id" element={<DocPage />} />}
    <Route path="*" element={<main><h1>Página no encontrada</h1><Link to="/">Volver al inicio</Link></main>} />
  </Routes></BrowserRouter>;
}

import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DocPage } from './pages/DocPage';
export function App() {
  return <BrowserRouter><Routes><Route path="/" element={<main className="document-page"><h1>weft</h1><Link to="/d/new">Abrir un documento compartible →</Link></main>} /><Route path="/d/:id" element={<DocPage />} /><Route path="*" element={<main><h1>Página no encontrada</h1><Link to="/">Volver al inicio</Link></main>} /></Routes></BrowserRouter>;
}

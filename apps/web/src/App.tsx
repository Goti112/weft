import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DocPage } from './pages/DocPage';
import { DemoPage } from './demo/DemoPage';
export function App() {
  return <BrowserRouter><Routes><Route path="/" element={<DemoPage />} /><Route path="/d/:id" element={<DocPage />} /><Route path="*" element={<main><h1>Página no encontrada</h1><Link to="/">Volver al inicio</Link></main>} /></Routes></BrowserRouter>;
}

import { Link } from 'react-router-dom';
import { REPO_URL, STANDALONE } from '../standalone';

export function SiteHeader() {
  return <header className="site-header">
    <Link className="site-name" to="/">Weft</Link>
    <nav className="site-nav" aria-label="Principal">
      {!STANDALONE && <Link to="/d/new">Nuevo documento</Link>}
      <a href={REPO_URL}>Código en GitHub</a>
    </nav>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    Weft, de Miquel Manzano. Código abierto con licencia MIT en <a href={REPO_URL}>GitHub</a>.
  </footer>;
}

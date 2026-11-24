import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Replica } from '../replica/Replica';
import { demoBackend, REPO_URL, STANDALONE } from '../standalone';
import { MemoryStore } from '../storage/MemoryStore';
import { NetworkSim } from '../sync/NetworkSim';
import { runGuidedScenario } from './GuidedScenario';
import { NetworkControls } from './NetworkControls';
import { Panel } from './Panel';
import { EventLog, summarize } from './eventLog';
import { Inspector } from './inspector/Inspector';
import './demo.css';

export function DemoPage() {
  const [network] = useState(() => new NetworkSim());
  const [log] = useState(() => new EventLog());
  const [replicas, setReplicas] = useState<Replica[]>([]);
  const [running, setRunning] = useState(false); const [converged, setConverged] = useState(false);
  const [error, setError] = useState(''); const [, render] = useState(0);
  const controller = useRef<AbortController>();
  useEffect(() => {
    let active = true; const owned: Replica[] = []; const unsubscribe: (() => void)[] = [];
    void (async () => {
      const backend = await demoBackend(); if (!active) return;
      for (const name of ['Ana', 'Bea', 'Carles']) {
        const replica = await Replica.create({ doc: backend.doc, name, store: new MemoryStore(), socketFactory: network.wrap(backend.socketFactory), url: backend.url });
        owned.push(replica); if (!active) { replica.destroy(); return; }
        for (const event of ['change', 'pending', 'status'] as const) unsubscribe.push(replica.on(event, () => { if (event === 'change') setConverged(false); render(n => n + 1); }));
        unsubscribe.push(replica.on('error', () => setError('No se han podido guardar los cambios de la demo.')));
        unsubscribe.push(replica.on('message', ({ dir, msg }) => log.push({ at: Date.now(), replica: name, dir, t: msg.t, summary: summarize(msg) })));
      }
      owned[2].insert(0, 'Escribid aquí: []'); setReplicas([...owned]);
    })().catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se ha podido conectar con la demo.'); });
    return () => { active = false; controller.current?.abort(); unsubscribe.forEach(fn => fn()); owned.forEach(r => r.destroy()); };
  }, [network, log]);

  async function guide() {
    if (replicas.length !== 3 || running) return;
    setRunning(true); setConverged(false); setError(''); controller.current = new AbortController();
    try {
      await runGuidedScenario({ ana: replicas[0], bea: replicas[1], carles: replicas[2] }, { signal: controller.current.signal });
      setConverged(true);
    } catch (err) { if (!controller.current.signal.aborted) setError(err instanceof Error ? err.message : 'No se ha podido completar el escenario.'); }
    finally { if (!controller.current.signal.aborted) setRunning(false); }
  }

  return <main className="document-page demo-page">
    <header className="topbar"><Link className="wordmark" to="/">weft<span>↗</span></Link><span>EL TEXTO NOS UNE. CON O SIN RED.</span>{STANDALONE
      ? <a className="nav-link" href={REPO_URL}>Ver el código ↗</a>
      : <Link className="nav-link" to="/d/new">Crear un documento ↗</Link>}</header>
    {STANDALONE && <p className="standalone-note" role="note">Versión estática: el servidor de sincronización se ejecuta en tu navegador y habla el mismo protocolo que el <a href={`${REPO_URL}/tree/main/server`}>servidor Java</a> del repositorio. Las réplicas, el CRDT y la red simulada son los de verdad.</p>}
    <section className="hero"><div><p className="eyebrow"><span className="live-dot" /> LOCAL-FIRST. DE VERDAD.</p><h1>Desconéctate. Escribe.<br />Vuelve.<br /><span>Nunca pierdes nada.</span></h1><p className="hero-copy">Tres editores independientes, cada uno con su propia réplica. Corta la red, escribe en varios a la vez y mira cómo se fusiona todo, operación a operación.</p></div><aside className="how-to"><span className="eyebrow">PRUÉBALO EN 30 SEGUNDOS</span>{[['01', 'Corta la conexión', 'Ana y Bea se quedan sin red.'], ['02', 'Sigue escribiendo', 'Cada una tiene algo que añadir.'], ['03', 'Vuelve a conectar', 'Todos los cambios encuentran su lugar.']].map(([n, title, copy]) => <div className="how-step" key={n}><span>{n}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}<div className="woven" aria-hidden="true">╱╱╱╱╱╱<br />╲╲╲╲╲╲<br />╱╱╱╱╱╱</div></aside></section>
    <section className={`live-demo ${converged ? 'converged' : ''}`} aria-label="Demo colaborativa">
      <div className="demo-heading"><div><p className="eyebrow">EL MISMO DOCUMENTO. TRES RÉPLICAS.</p><h2>Haz que la red falle.</h2></div><button className="primary-button" disabled={replicas.length !== 3 || running} onClick={() => void guide()}>{running ? 'Sincronizando el escenario…' : '▶ Escenario guiado'}</button></div>
      {error && <p role="alert" className="warning">{error}</p>}
      {replicas.length === 0 && !error && <p className="loading" role="status">Preparando tres editores independientes…</p>}
      <div className="panels">{replicas.map((replica, index) => <Panel key={replica.replicaId} replica={replica} index={index} />)}</div>
      <div className="demo-caption" role="status"><span>{converged ? '✓ Los tres documentos coinciden. Ningún cambio se ha perdido.' : 'Escribe en cualquier panel. Cada uno conserva sus propios cambios.'}</span><span>{STANDALONE ? 'Protocolo de Weft · Fugue' : 'WebSocket · PostgreSQL · Fugue'}</span></div>
      <NetworkControls network={network} />
    </section>
    {replicas.length === 3 && <Inspector replicas={replicas} log={log} />}
    {STANDALONE
      ? <div className="share-prompt"><span>¿Quieres ver cómo está hecho?</span><a href={REPO_URL}>Código, tests y decisiones de diseño en GitHub →</a></div>
      : <div className="share-prompt"><span>¿Y si lo pruebas con alguien de verdad?</span><Link to="/d/new">Abrir un documento compartible →</Link></div>}
    <footer><span>weft / Cada cambio cuenta.</span><span>Un CRDT propio. Cero conflictos. Sin registro.</span></footer>
  </main>;
}

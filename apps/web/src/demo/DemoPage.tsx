import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/Site';
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

  return <main className="page">
    <SiteHeader />
    <section className="intro">
      <h1>Un editor de texto colaborativo que funciona sin conexión</h1>
      <p>Abajo tienes tres editores del mismo documento: Ana, Bea y Carles. Cada uno guarda su propia copia y se sincroniza con un servidor. Si desconectas uno y escribes en él, sus cambios se quedan pendientes. Al reconectarlo, se fusionan con los de los demás: nadie pierde nada y las palabras escritas a la vez en el mismo sitio no se mezclan.</p>
      <p>Para verlo de una vez, pulsa <strong>Escenario guiado</strong>. Ana y Bea se desconectan, escriben a la vez en la misma posición y vuelven a conectarse.</p>
      {STANDALONE
        ? <p>En esta versión, el servidor de sincronización se ejecuta dentro de la propia página y sigue el mismo protocolo que el <a href={`${REPO_URL}/tree/main/server`}>servidor Java</a> del repositorio. Los editores, el CRDT y la red simulada son los mismos que en la aplicación completa.</p>
        : <p>También puedes <Link to="/d/new">crear un documento</Link> y abrirlo en otro navegador o dispositivo.</p>}
    </section>

    <section className={`section ${converged ? 'converged' : ''}`} aria-labelledby="demo-title">
      <h2 id="demo-title">Tres copias del mismo documento</h2>
      <div className="demo-toolbar">
        <button className="button" disabled={replicas.length !== 3 || running} onClick={() => void guide()}>{running ? 'Ejecutando el escenario…' : 'Escenario guiado'}</button>
        <span className={`demo-result ${converged ? 'converged' : ''}`} role="status">{converged ? 'Los tres documentos coinciden.' : 'Puedes escribir en cualquiera de los tres.'}</span>
      </div>
      {error && <p role="alert" className="notice">{error}</p>}
      {replicas.length === 0 && !error && <p role="status">Preparando los editores…</p>}
      <div className="panels">{replicas.map(replica => <Panel key={replica.replicaId} replica={replica} />)}</div>
      <NetworkControls network={network} />
    </section>

    {replicas.length === 3 && <Inspector replicas={replicas} log={log} />}
    <SiteFooter />
  </main>;
}

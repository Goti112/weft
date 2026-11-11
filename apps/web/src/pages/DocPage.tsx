import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createDoc, tabId, wsUrl } from '../api';
import { Editor } from '../editor/Editor';
import { Replica } from '../replica/Replica';
import { openStore } from '../storage/IdbStore';
import { Status } from '../components/Status';

export function DocPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const [replica, setReplica] = useState<Replica>();
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState(''); const [, render] = useState(0);
  useEffect(() => {
    let active = true; let current: Replica | undefined; let unsubscribers: (() => void)[] = [];
    setReplica(undefined); setError('');
    void (async () => {
      if (id === 'new') {
        const created = await createDoc(); if (active) navigate(`/d/${created}`, { replace: true }); return;
      }
      const opened = await openStore(`weft-v1-${tabId()}`);
      if (!active || !id) return;
      current = await Replica.create({ doc: id, name: 'tu documento', store: opened.store, socketFactory: url => new WebSocket(url), url: wsUrl() });
      if (!active) { current.destroy(); return; }
      setPersistent(opened.persistent); setReplica(current);
      for (const event of ['status', 'pending', 'change'] as const) unsubscribers.push(current.on(event, () => render(n => n + 1)));
      unsubscribers.push(current.on('error', () => setError('No se han podido guardar los cambios. Mantén esta página abierta.')));
      unsubscribers.push(current.on('message', ({ msg }) => { if (msg.t === 'error') setError(msg.code === 'DOC_NOT_FOUND' ? 'Este documento no existe o ha caducado.' : 'No se ha podido sincronizar el documento.'); }));
    })().catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se ha podido abrir el documento.'); });
    return () => { active = false; unsubscribers.forEach(fn => fn()); current?.destroy(); };
  }, [id, navigate]);
  return <main className="document-page">
    <header className="topbar"><Link className="wordmark" to="/">weft<span>↗</span></Link><span>UN DOCUMENTO. TODOS LOS CAMBIOS.</span></header>
    <div className="document-heading"><div><p className="eyebrow">ESPACIO COMPARTIDO</p><h1>Escribe. Lo demás se une.</h1><p>Comparte esta dirección y escribe desde otro navegador.</p></div>{replica && <Status replica={replica} />}</div>
    {error && <p className="warning" role="alert">{error}</p>}
    {!persistent && <p className="warning" role="alert">Este navegador no permite guardar en local: si recargas sin conexión perderás los cambios.</p>}
    {replica ? <section className="document-editor"><div className="editor-bar"><span>Documento / {id}</span><span>{replica.pendingCount} ops pendientes</span></div><Editor replica={replica} /></section> : !error && <p role="status">Abriendo documento…</p>}
    <footer>Texto plano. Sin cuentas. Cada cambio cuenta.</footer>
  </main>;
}

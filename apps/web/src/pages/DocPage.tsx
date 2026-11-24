import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createDoc, wsUrl } from '../api';
import { SiteFooter, SiteHeader } from '../components/Site';
import { Editor } from '../editor/Editor';
import { Replica } from '../replica/Replica';
import { openStore } from '../storage/IdbStore';
import { Status } from '../components/Status';

export function DocPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const [replica, setReplica] = useState<Replica>();
  const [persistent, setPersistent] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [error, setError] = useState(''); const [, render] = useState(0);
  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (active) setOfflineReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; let current: Replica | undefined; let unsubscribers: (() => void)[] = [];
    setReplica(undefined); setError('');
    void (async () => {
      if (id === 'new') {
        const created = await createDoc(); if (active) navigate(`/d/${created}`, { replace: true }); return;
      }
      const opened = await openStore();
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
  return <main className="page">
    <SiteHeader />
    <div className="doc-header">
      <div><h1>Documento compartido</h1><p>Abre esta misma dirección en otro navegador o dispositivo para editar a la vez. Si pierdes la conexión puedes seguir escribiendo: los cambios se envían al volver.</p></div>
      {replica && <Status replica={replica} />}
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {!persistent && <p className="notice" role="alert">Este navegador no permite guardar en local: si recargas la página sin conexión perderás los cambios.</p>}
    {persistent && offlineReady && <p className="local-ready">Listo para trabajar sin conexión</p>}
    {replica
      ? <section className="doc-editor"><div className="doc-editor-bar"><span>Documento <code>{id}</code></span><span>{replica.pendingCount} ops pendientes</span></div><Editor replica={replica} /></section>
      : !error && <p role="status">Abriendo el documento…</p>}
    <SiteFooter />
  </main>;
}

import { useEffect, useState } from 'react';
import type { Replica } from '../../replica/Replica';
import type { EventLog } from '../eventLog';
import { Timeline } from './Timeline';
import { TreeView } from './TreeView';
import { Versions } from './Versions';

const tabs = ['Mensajes', 'Árbol Fugue', 'Vectores de versión'] as const;

export function Inspector({ replicas, log }: { replicas: Replica[]; log: EventLog }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Mensajes');
  const [selected, setSelected] = useState(0); const [, update] = useState(0);
  useEffect(() => log.subscribe(() => update(n => n + 1)), [log]);
  return <section className="section inspector" aria-labelledby="inspector-title">
    <h2 id="inspector-title">Inspector</h2>
    <p className="section-lead">Lo que ocurre por debajo: los mensajes del protocolo entre cada editor y el servidor, el árbol del CRDT de cada réplica y lo que cada una sabe de las demás.</p>
    <div className="inspector-tabs" role="group" aria-label="Vistas del inspector">{tabs.map(name =>
      <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="inspector-body">
      {tab === 'Mensajes' && <Timeline events={log.list()} />}
      {tab === 'Árbol Fugue' && <>
        <label className="replica-select">Réplica
          <select aria-label="Réplica del árbol" value={selected} onChange={e => setSelected(Number(e.target.value))}>{replicas.map((r, index) => <option key={r.replicaId} value={index}>{r.name}</option>)}</select>
        </label>
        {replicas[selected] && <TreeView tree={replicas[selected].doc.inspect()} />}
      </>}
      {tab === 'Vectores de versión' && <Versions replicas={replicas} />}
    </div>
    {tab === 'Mensajes' && <p className="inspector-meta">{log.list().length} mensajes. Se muestran los 500 más recientes, del más nuevo al más antiguo.</p>}
  </section>;
}

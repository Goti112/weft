import { useEffect, useState } from 'react';
import type { Replica } from '../../replica/Replica';
import type { EventLog } from '../eventLog';
import { Timeline } from './Timeline';
import { TreeView } from './TreeView';
import { Versions } from './Versions';

export function Inspector({ replicas, log }: { replicas: Replica[]; log: EventLog }) {
  const [tab, setTab] = useState('Mensajes'); const [selected, setSelected] = useState(0); const [, update] = useState(0);
  useEffect(() => log.subscribe(() => update(n => n + 1)), [log]);
  return <section className="inspector" aria-label="Inspector de sincronización"><div className="inspector-heading"><div><p className="eyebrow">NO ES MAGIA. ES SINCRONIZACIÓN.</p><h2>Mira lo que hay debajo.</h2></div><span className="inspector-counter">{log.list().length} / 500 mensajes</span></div>
    <div className="inspector-tabs" role="group" aria-label="Vistas del inspector">{['Mensajes', 'Árbol Fugue', 'Vectores de versión'].map(name => <button key={name} className={tab === name ? 'selected' : ''} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="inspector-body">{tab === 'Mensajes' && <Timeline events={log.list()} />}{tab === 'Árbol Fugue' && <><label className="replica-select">Réplica <select aria-label="Réplica del árbol" value={selected} onChange={e => setSelected(Number(e.target.value))}>{replicas.map((r, index) => <option key={r.replicaId} value={index}>{r.name}</option>)}</select></label>{replicas[selected] && <TreeView tree={replicas[selected].doc.inspect()} />}</>}{tab === 'Vectores de versión' && <Versions replicas={replicas} />}</div>
  </section>;
}

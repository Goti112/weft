import type { Replica } from '../../replica/Replica';

export function Versions({ replicas }: { replicas: Replica[] }) {
  const versions = replicas.map(r => r.doc.version());
  const origins = [...new Set(versions.flatMap(v => Object.keys(v)))].sort();
  return <div className="versions"><p className="view-explanation">El contador más alto que conoce cada editor de cada réplica. Al converger, las columnas coinciden.</p><table aria-label="Vectores de versión"><thead><tr><th>Réplica de origen</th>{replicas.map(r => <th key={r.replicaId}>{r.name}</th>)}</tr></thead><tbody>{origins.map(id => <tr key={id}><th>{replicas.find(r => r.replicaId === id)?.name ?? id}<code>{id}</code></th>{versions.map((version, index) => <td key={index}>{version[id] ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}

import type { Replica } from '../replica/Replica';
export function Status({ replica }: { replica: Replica }) {
  return <span className={`status ${replica.status}`}><i />{({ connected: 'Conectado', offline: 'Sin red', syncing: 'Sincronizando' })[replica.status]}</span>;
}

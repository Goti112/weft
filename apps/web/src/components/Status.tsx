import type { Replica } from '../replica/Replica';

const labels = { connected: 'Conectado', offline: 'Sin red', syncing: 'Sincronizando' } as const;

export function Status({ replica }: { replica: Replica }) {
  return <span className={`status ${replica.status}`}>{labels[replica.status]}</span>;
}

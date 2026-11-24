import type { Replica } from '../replica/Replica';
import { Editor } from '../editor/Editor';
import { Status } from '../components/Status';

export function Panel({ replica }: { replica: Replica }) {
  const paused = replica.status === 'offline';
  return <article className="panel" data-testid={`panel-${replica.name.toLowerCase()}`} aria-label={`Editor de ${replica.name}`}>
    <div className="panel-heading"><h3>{replica.name}</h3><Status replica={replica} /></div>
    <Editor replica={replica} />
    <div className="panel-footer">
      <span>{replica.pendingCount} ops pendientes</span>
      <button className="button-secondary" onClick={() => replica.setPaused(!paused)}>{paused ? 'Reconectar' : 'Desconectar'}</button>
    </div>
  </article>;
}

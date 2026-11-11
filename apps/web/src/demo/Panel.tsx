import type { Replica } from '../replica/Replica';
import { Editor } from '../editor/Editor';
import { Status } from '../components/Status';

export function Panel({ replica, index }: { replica: Replica; index: number }) {
  const paused = replica.status === 'offline';
  return <article className={`panel panel-${index}`} data-testid={`panel-${replica.name.toLowerCase()}`}>
    <div className="panel-heading"><div className="person"><span className="avatar">{replica.name[0]}</span><h3>{replica.name}</h3></div><Status replica={replica} /></div>
    <Editor replica={replica} />
    <div className="panel-footer"><span>{replica.pendingCount} ops pendientes</span><button className={paused ? 'reconnect' : ''} onClick={() => replica.setPaused(!paused)}>{paused ? 'Reconectar' : '✂ Cortar red'}</button></div>
  </article>;
}

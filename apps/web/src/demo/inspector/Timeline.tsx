import type { LogEvent } from '../eventLog';

export function Timeline({ events }: { events: LogEvent[] }) {
  const columns = ['Ana', 'Servidor', 'Bea', 'Carles'];
  return <div className="timeline"><table aria-label="Mensajes"><thead><tr><th>Hora</th>{columns.map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{events.slice().reverse().map((event, index) => <tr key={`${event.at}-${index}`}><td className="log-time">{new Date(event.at).toLocaleTimeString('es-ES', { hour12: false })}</td>{columns.map(name => {
    const direction = event.replica === 'Ana' ? event.dir === 'out' ? '→' : '←' : event.dir === 'out' ? '←' : '→';
    return <td key={name} className={name === 'Servidor' ? 'server-column' : ''}>{name === event.replica && <span className={`message-arrow ${event.dir}`} aria-label={`${event.dir === 'out' ? 'De' : 'Hacia'} ${event.replica}`}>{direction} <small>{event.t}</small></span>}{name === 'Servidor' && <span className="message-chip" title={event.summary}>{event.summary}</span>}</td>;
  })}</tr>)}</tbody></table>{events.length === 0 && <p className="inspector-empty">Los mensajes aparecerán aquí en cuanto escribas.</p>}</div>;
}

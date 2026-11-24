import type { LogEvent } from '../eventLog';

const columns = ['Ana', 'Servidor', 'Bea', 'Carles'];

export function Timeline({ events }: { events: LogEvent[] }) {
  if (events.length === 0) return <p className="inspector-note">Todavía no hay mensajes. Aparecerán en cuanto escribas en un editor.</p>;
  return <div className="timeline"><table aria-label="Mensajes">
    <thead><tr><th>Hora</th>{columns.map(name => <th key={name}>{name}</th>)}</tr></thead>
    <tbody>{events.slice().reverse().map((event, index) => <tr key={`${event.at}-${index}`}>
      <td className="log-time">{new Date(event.at).toLocaleTimeString('es-ES', { hour12: false })}</td>
      {columns.map(name => <td key={name}>
        {name === event.replica && <span className={`message-arrow ${event.dir}`}>{event.dir === 'out' ? 'envía' : 'recibe'} {event.t}</span>}
        {name === 'Servidor' && <span className="message-chip">{event.summary}</span>}
      </td>)}
    </tr>)}</tbody>
  </table></div>;
}

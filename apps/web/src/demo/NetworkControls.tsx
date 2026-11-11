import { useState } from 'react';
import type { NetworkSim } from '../sync/NetworkSim';

export function NetworkControls({ network }: { network: NetworkSim }) {
  const [, update] = useState(0);
  const fields = [
    { label: 'Latencia', key: 'latencyMs', max: 2000, step: 50, scale: 1, unit: 'ms' },
    { label: 'Duplicar mensajes', key: 'duplicateProb', max: 50, step: 1, scale: 100, unit: '%' },
    { label: 'Reordenar mensajes', key: 'reorderProb', max: 50, step: 1, scale: 100, unit: '%' },
  ] as const;
  return <div className="network-controls"><div className="network-label"><span>⌁</span><div><strong>Pon la red a prueba</strong><small>La conexión perfecta no existe.</small></div></div><div className="sliders">{fields.map(field => <label key={field.key}><span>{field.label}<output>{Math.round(network[field.key] * field.scale)} {field.unit}</output></span><input aria-label={field.label} type="range" min={0} max={field.max} step={field.step} value={network[field.key] * field.scale} onChange={event => { network[field.key] = Number(event.target.value) / field.scale; update(n => n + 1); }} /></label>)}</div></div>;
}

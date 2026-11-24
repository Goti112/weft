import { useState } from 'react';
import type { NetworkSim } from '../sync/NetworkSim';

const fields = [
  { label: 'Latencia', key: 'latencyMs', max: 2000, step: 50, scale: 1, unit: 'ms' },
  { label: 'Mensajes duplicados', key: 'duplicateProb', max: 50, step: 1, scale: 100, unit: '%' },
  { label: 'Mensajes desordenados', key: 'reorderProb', max: 50, step: 1, scale: 100, unit: '%' },
] as const;

export function NetworkControls({ network }: { network: NetworkSim }) {
  const [, update] = useState(0);
  return <fieldset className="network">
    <legend>Red simulada</legend>
    <p>Se aplica a los mensajes que reciben los tres editores. Con valores altos la sincronización tarda más, pero el resultado final es el mismo.</p>
    <div className="sliders">{fields.map(field => <label key={field.key}>
      <span className="slider-label">{field.label}<output>{Math.round(network[field.key] * field.scale)} {field.unit}</output></span>
      <input aria-label={field.label} type="range" min={0} max={field.max} step={field.step} value={network[field.key] * field.scale}
        onChange={event => { network[field.key] = Number(event.target.value) / field.scale; update(n => n + 1); }} />
    </label>)}</div>
  </fieldset>;
}

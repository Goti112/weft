export async function createDoc(): Promise<string> {
  const response = await fetch('/api/docs', { method: 'POST' });
  if (!response.ok) throw new Error('No se ha podido crear el documento. Comprueba tu conexión.');
  const data = await response.json() as { id: string };
  return data.id;
}
export function wsUrl(): string { return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`; }

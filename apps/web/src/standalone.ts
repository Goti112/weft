import { createDoc, wsUrl } from './api';
import { LocalServer } from './sync/LocalServer';
import type { SocketFactory } from './sync/SyncClient';

/**
 * Static build for GitHub Pages (`VITE_STANDALONE=true`): the demo talks to an
 * in-browser LocalServer instead of the Java server, and shareable documents are hidden.
 */
export const STANDALONE = import.meta.env.VITE_STANDALONE === 'true';
export const REPO_URL = 'https://github.com/Goti112/weft';

export type DemoBackend = { doc: string; url: string; socketFactory: SocketFactory };

/** Where the demo's three replicas sync: the real server, or one running in this tab. */
export async function demoBackend(): Promise<DemoBackend> {
  if (STANDALONE) {
    const server = new LocalServer();
    return { doc: server.createDoc(), url: 'local', socketFactory: server.connect };
  }
  return { doc: await createDoc(), url: wsUrl(), socketFactory: url => new WebSocket(url) };
}

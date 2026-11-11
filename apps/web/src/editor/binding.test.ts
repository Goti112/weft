import { afterEach, expect, test } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { FugueDoc } from '@weft/crdt';
import { Replica } from '../replica/Replica';
import { MemoryStore } from '../storage/MemoryStore';
import { FakeServer } from '../sync/testing';
import { weftBinding } from './binding';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); });
async function make(text = '') {
  const store = new MemoryStore();
  const replica = await Replica.create({ doc: 'doc', store, socketFactory: new FakeServer().factory, url: 'ws://test' });
  replica.setPaused(true); if (text) replica.insert(0, text);
  const parent = document.createElement('div'); document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc: replica.doc.text(), extensions: [basicSetup, weftBinding(replica)] }) });
  cleanup.push(() => { view.destroy(); replica.destroy(); parent.remove(); });
  return { replica, view, store };
}

test('typing in editor produces crdt ops', async () => {
  const { replica, view } = await make();
  view.dispatch({ changes: { from: 0, insert: 'hola' } });
  expect(replica.doc.text()).toBe('hola'); expect(replica.pendingCount).toBe(1);
});

test('remote edits do not enter local undo history', async () => {
  const { replica, view } = await make();
  new FugueDoc('remote').insert(0, 'REMOTE').forEach(op => replica.doc.apply(op));
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  expect(view.state.doc.toString()).toBe('REMOTE');
  expect(replica.doc.text()).toBe('REMOTE'); expect(replica.pendingCount).toBe(0);
  view.dispatch({ changes: { from: 6, insert: ' local' } });
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  expect(view.state.doc.toString()).toBe('REMOTE'); expect(replica.doc.text()).toBe('REMOTE');
  expect(replica.pendingCount).toBe(2);
});
test('remote ops update editor without echo', async () => {
  const { replica, view } = await make(); const pending = replica.pendingCount;
  new FugueDoc('remote').insert(0, 'hola').forEach(op => replica.doc.apply(op));
  expect(view.state.doc.toString()).toBe('hola'); expect(replica.pendingCount).toBe(pending);
});
test('remote insert before cursor shifts cursor', async () => {
  const { replica, view, store } = await make('hello world');
  const remote = new FugueDoc('remote'); (await store.load('doc')).ops.forEach(op => remote.apply(op));
  view.dispatch({ selection: { anchor: 5 } });
  remote.insert(0, 'XX').forEach(op => replica.doc.apply(op));
  expect(view.state.selection.main.head).toBe(7);
  expect(view.state.doc.toString()).toBe('XXhello world');
});
test('replacing a selection = delete + insert', async () => {
  const { replica, view } = await make('hello world');
  view.dispatch({ changes: { from: 6, to: 11, insert: 'Weft' } });
  expect(replica.doc.text()).toBe('hello Weft'); expect(replica.pendingCount).toBe(3);
});

test('programmatic local edits update editor without echo', async () => {
  const { replica, view } = await make();
  replica.insert(0, 'escenario');
  await Promise.resolve();
  expect(view.state.doc.toString()).toBe('escenario');
  expect(replica.pendingCount).toBe(1);
});

import { Annotation, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { Replica } from '../replica/Replica';

export const remoteAnnotation = Annotation.define<boolean>();
export function weftBinding(replica: Replica): Extension {
  return ViewPlugin.fromClass(class {
    private readonly unsubscribe: () => void;
    private readonly unsubscribeLocal: () => void;
    private destroyed = false;
    constructor(view: EditorView) {
      this.unsubscribe = replica.doc.onChange(changes => {
        view.dispatch({ changes, annotations: remoteAnnotation.of(true) });
      });
      this.unsubscribeLocal = replica.on('change', () => queueMicrotask(() => {
        if (this.destroyed) return;
        const before = view.state.doc.toString(), after = replica.doc.text();
        if (before === after) return;
        let from = 0, suffix = 0;
        while (from < before.length && from < after.length && before[from] === after[from]) from++;
        while (suffix < before.length - from && suffix < after.length - from && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
        view.dispatch({ changes: { from, to: before.length - suffix, insert: after.slice(from, after.length - suffix) }, annotations: remoteAnnotation.of(true) });
      }));
    }
    update(update: ViewUpdate): void {
      for (const transaction of update.transactions) {
        if (!transaction.docChanged || transaction.annotation(remoteAnnotation)) continue;
        const changes: { from: number; to: number; insert: string }[] = [];
        transaction.changes.iterChanges((from, to, _fromB, _toB, text) => changes.push({ from, to, insert: text.toString() }));
        for (const change of changes.reverse()) {
          if (change.to > change.from) replica.delete(change.from, change.to - change.from);
          if (change.insert) replica.insert(change.from, change.insert);
        }
      }
    }
    destroy(): void { this.destroyed = true; this.unsubscribe(); this.unsubscribeLocal(); }
  });
}

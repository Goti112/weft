import { Annotation, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { Replica } from '../replica/Replica';

export const remoteAnnotation = Annotation.define<boolean>();
export function weftBinding(replica: Replica): Extension {
  return ViewPlugin.fromClass(class {
    private readonly unsubscribe: () => void;
    constructor(view: EditorView) {
      this.unsubscribe = replica.doc.onChange(changes => {
        view.dispatch({ changes, annotations: remoteAnnotation.of(true) });
      });
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
    destroy(): void { this.unsubscribe(); }
  });
}

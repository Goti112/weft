import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import type { Replica } from '../replica/Replica';
import { weftBinding } from './binding';

export function Editor({ replica }: { replica: Replica }) {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = new EditorView({ parent: parent.current!, state: EditorState.create({ doc: replica.doc.text(), extensions: [
      basicSetup, EditorView.lineWrapping, weftBinding(replica),
      EditorView.contentAttributes.of({ 'aria-label': `Editor de ${replica.name}`, 'aria-multiline': 'true', role: 'textbox' }),
      EditorView.theme({ '&': { minHeight: '240px', background: 'transparent' }, '.cm-scroller': { fontFamily: 'monospace', lineHeight: '1.7' }, '.cm-content': { padding: '20px 0' }, '.cm-gutters': { background: 'transparent', border: 'none', color: '#aaa79e' }, '&.cm-focused': { outline: 'none' } }),
    ] }) });
    return () => view.destroy();
  }, [replica]);
  return <div className="editor" ref={parent} />;
}

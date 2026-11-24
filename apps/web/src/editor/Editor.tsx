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
      EditorView.theme({
        '&': { background: 'transparent', fontSize: '15px' },
        '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
        '.cm-content': { padding: '10px 0' },
        '.cm-gutters': { background: 'transparent', border: 'none', color: '#8a8a8a' },
        '.cm-activeLine, .cm-activeLineGutter': { background: '#f3f6fc' },
        '&.cm-focused': { outline: 'none' },
      }),
    ] }) });
    return () => view.destroy();
  }, [replica]);
  return <div className="editor" ref={parent} />;
}

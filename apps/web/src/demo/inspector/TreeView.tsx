import { idKey, type TreeSnapshot } from '@weft/crdt';

function NodeView({ node }: { node: TreeSnapshot }) {
  const children = [...node.left, ...node.right];
  return <li><span className="node-side">{node.side ?? '●'}</span><span className={node.deleted ? 'tree-char tombstone' : 'tree-char'} title={node.id ? idKey(node.id) : 'raíz'}>{node.id === null ? 'raíz' : node.char === ' ' ? '␣' : node.char === '\n' ? '↵' : node.char}</span>{children.length > 0 && <ul>{children.map(child => <NodeView key={idKey(child.id!)} node={child} />)}</ul>}</li>;
}

export function TreeView({ tree }: { tree: TreeSnapshot }) {
  return <div className="fugue-tree"><p className="view-explanation">Cada carácter tiene su lugar. Borrar lo convierte en una lápida; su identidad permanece. Pasa el cursor para ver cada id.</p><ul><NodeView node={tree} /></ul></div>;
}

import { idKey, type TreeSnapshot } from '@weft/crdt';

function NodeView({ node }: { node: TreeSnapshot }) {
  const children = [...node.left, ...node.right];
  return <li><span className="node-side">{node.side ?? '●'}</span><span className={node.deleted ? 'tree-char tombstone' : 'tree-char'} title={node.id ? idKey(node.id) : 'raíz'}>{node.id === null ? 'raíz' : node.char === ' ' ? '␣' : node.char === '\n' ? '↵' : node.char}</span>{children.length > 0 && <ul>{children.map(child => <NodeView key={idKey(child.id!)} node={child} />)}</ul>}</li>;
}

export function TreeView({ tree }: { tree: TreeSnapshot }) {
  return <div className="fugue-tree"><p className="inspector-note">Cada carácter es un nodo del árbol; el texto es su recorrido en orden (L = hijo izquierdo, R = derecho). Un carácter borrado queda como lápida, tachado, para que siga sirviendo de referencia a otras inserciones. Pasa el ratón por encima de un nodo para ver su id.</p><ul><NodeView node={tree} /></ul></div>;
}

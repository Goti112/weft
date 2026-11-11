import { expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { FugueDoc } from '@weft/crdt';
import { TreeView } from './TreeView';

test('TreeView renders deleted nodes with tombstone class', () => {
  const doc = new FugueDoc('a'); doc.insert(0, 'ab'); doc.delete(0, 1);
  const { container } = render(<TreeView tree={doc.inspect()} />);
  expect(container.querySelector('.tombstone')?.textContent).toBe('a');
  expect(container.querySelector('.tombstone')?.getAttribute('title')).toBe('a:0');
});

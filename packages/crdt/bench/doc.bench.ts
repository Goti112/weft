import { bench, describe } from 'vitest';
import { FugueDoc } from '../src/index';

describe('100,000 UTF-16 units', () => {
  function documentBenchmark(name: string, edit: (doc: FugueDoc) => void) {
    let doc: FugueDoc;
    bench(name, () => edit(doc), {
      time: 0, iterations: 100, warmupIterations: 10, warmupTime: 0,
      setup() {
        doc = new FugueDoc('a');
        doc.insert(0, 'x'.repeat(100_000));
      },
    });
  }
  documentBenchmark('insert in middle', doc => { doc.insert(50_000, 'x'); });
  documentBenchmark('delete in middle', doc => { doc.delete(50_000, 1); });
  let counter = 0;
  documentBenchmark('remote apply in middle', doc => {
    doc.apply({ type: 'insert', opId: { replica: 'b', counter: counter++ }, parent: { replica: 'a', counter: 50_000 }, side: 'L', text: 'r' });
  });
});

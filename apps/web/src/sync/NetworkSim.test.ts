import { afterEach, expect, test, vi } from 'vitest';
import { NetworkSim } from './NetworkSim';
import { FakeSocket } from './testing';

afterEach(() => vi.useRealTimers());
test('NetworkSim delays by latencyMs', () => {
  vi.useFakeTimers(); const sim = new NetworkSim(); sim.latencyMs = 100;
  const socket = new FakeSocket(); const wrapped = sim.wrap(() => socket)('ws://test');
  const receive = vi.fn(); wrapped.onmessage = receive;
  socket.receive({ t: 'ack', opIds: [] });
  vi.advanceTimersByTime(99); expect(receive).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(receive).toHaveBeenCalledTimes(1); wrapped.close();
});
test('NetworkSim duplicates when duplicateProb=1', () => {
  vi.useFakeTimers(); const sim = new NetworkSim(); sim.duplicateProb = 1;
  const socket = new FakeSocket(); const wrapped = sim.wrap(() => socket)('ws://test');
  const receive = vi.fn(); wrapped.onmessage = receive;
  socket.receive({ t: 'ack', opIds: [] }); vi.advanceTimersByTime(0);
  expect(receive).toHaveBeenCalledTimes(2); wrapped.close();
});

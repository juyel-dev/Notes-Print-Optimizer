import { describe, expect, it, vi } from 'vitest';
import { linkedAbortController } from '../../lib/optimizer/engine/v2/linkedAbortController';

describe('linkedAbortController', () => {
  it('forwards an external abort only to the controller linked to that request', () => {
    const oldRequest = new AbortController();
    const firstRun = linkedAbortController(oldRequest.signal);
    const secondRun = linkedAbortController();

    oldRequest.abort();

    expect(firstRun.controller.signal.aborted).toBe(true);
    expect(secondRun.controller.signal.aborted).toBe(false);

    firstRun.dispose();
    secondRun.dispose();
  });

  it('creates an already-aborted run controller when the caller was already cancelled', () => {
    const caller = new AbortController();
    caller.abort();

    const linked = linkedAbortController(caller.signal);

    expect(linked.controller.signal.aborted).toBe(true);
    linked.dispose();
  });

  it('removes the external listener when the run has settled', () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const linked = linkedAbortController(caller.signal);

    linked.dispose();

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

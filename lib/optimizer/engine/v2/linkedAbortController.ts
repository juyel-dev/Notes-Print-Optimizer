/**
 * Links one caller-owned AbortSignal to a run-local controller.
 *
 * A processing engine instance is shared across workflow runs. The linked
 * callback must capture this run's controller, never a mutable engine field;
 * otherwise an old request's abort event can cancel a newer run.
 */
export function linkedAbortController(externalSignal?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  if (!externalSignal) {
    return { controller, dispose: () => undefined };
  }

  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return { controller, dispose: () => undefined };
  }

  const forwardAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', forwardAbort, { once: true });

  return {
    controller,
    dispose: () => externalSignal.removeEventListener('abort', forwardAbort),
  };
}

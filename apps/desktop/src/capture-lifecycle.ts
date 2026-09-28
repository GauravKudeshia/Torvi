// Stop invalidates callbacks immediately, then waits for outstanding native starts
// before tearing down. A late permission/device response cannot restart capture.
export class CaptureLifecycle {
  private controller = new AbortController();
  private pending = new Set<Promise<unknown>>();
  private stopping: Promise<void> | null = null;

  get cancelled() { return this.controller.signal.aborted; }

  begin() {
    if (this.stopping || this.pending.size) throw new Error('Audio is still stopping. Please retry in a moment.');
    this.controller.abort();
    this.controller = new AbortController();
  }

  run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopping || this.controller.signal.aborted) return Promise.reject(new DOMException('Capture stopped', 'AbortError'));
    const task = operation(this.controller.signal);
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }

  stop(cleanup: () => Promise<void>): Promise<void> {
    if (this.stopping) return this.stopping;
    this.controller.abort();
    const task = (async () => {
      await Promise.allSettled([...this.pending]);
      await cleanup();
    })();
    this.stopping = task;
    void task.then(() => { this.stopping = null; }, () => { this.stopping = null; });
    return task;
  }
}

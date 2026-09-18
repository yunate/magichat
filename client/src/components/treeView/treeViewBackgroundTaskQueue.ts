export class TreeViewBackgroundTaskQueue {
  public enqueue(task: () => Promise<void> | void): void {
    if (this._isDisposed) return;
    this._tasks.push(task);
    this._schedule();
  }

  public start(): void {
    if (this._isDisposed || this._isStarted) return;
    this._isStarted = true;
    this._schedule();
  }

  public pause(): void {
    this._isStarted = false;
    if (this._timer === null) return;
    clearTimeout(this._timer);
    this._timer = null;
  }

  public clear(): void {
    this._tasks.length = 0;
  }

  public dispose(): void {
    if (this._isDisposed) return;
    this.pause();
    this.clear();
    this._isDisposed = true;
  }

  private _schedule(): void {
    if (!this._isStarted
      || this._isDisposed
      || this._isRunning
      || this._timer !== null
      || this._tasks.length === 0) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._runNext();
    }, 0);
  }

  private async _runNext(): Promise<void> {
    const task = this._tasks.shift();
    if (task === undefined || this._isDisposed) return;
    this._isRunning = true;
    try {
      await task();
    } catch (reason: unknown) {
      console.warn("[treeView] background task failed", reason);
    } finally {
      this._isRunning = false;
      this._schedule();
    }
  }

  private readonly _tasks: Array<() => Promise<void> | void> = [];
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _isStarted = false;
  private _isRunning = false;
  private _isDisposed = false;
}
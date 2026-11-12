export class TaskQueue {
  public pushTask(task: () => Promise<void> | void): void {
    if (this._isDisposed) return;
    this._pendingTasks.push(task);
    this._ensureRun();
  }

  public getPendingCount(): number {
    return this._pendingTasks.length;
  }

  public async cancel(): Promise<void> {
    this._pendingTasks.length = 0;
    await this._runningTask;
  }

  public async dispose(): Promise<void> {
    this._isDisposed = true;
    await this.cancel();
  }

  private _ensureRun(): void {
    if (this._runningTask !== null || this._pendingTasks.length === 0) return;
    this._runningTask = new Promise<void>((resolve) => {
      setTimeout(async () => {
        try {
          const task = this._pendingTasks.shift();
          if (task !== undefined) await task();
        } finally {
          this._runningTask = null;
          resolve();
          this._ensureRun();
        }
      }, 0);
    });
  }

  private readonly _pendingTasks: Array<() => Promise<void> | void> = [];
  private _runningTask: Promise<void> | null = null;
  private _isDisposed = false;
}
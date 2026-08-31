type FunnelTaskCallback<Result> = () => Result;

export class FunnelTask<Result = void> {
  public constructor(callback: FunnelTaskCallback<Result>, delayMs: number) {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("Funnel task delay must be a non-negative finite number");
    }
    this._callback = callback;
    this._delayMs = delayMs;
  }

  public schedule(): void {
    if (this._timer !== null) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._callback();
    }, this._delayMs);
  }

  public runNow(): Result {
    this.cancel();
    return this._callback();
  }

  public cancel(): void {
    if (this._timer === null) return;
    clearTimeout(this._timer);
    this._timer = null;
  }

  private readonly _callback: FunnelTaskCallback<Result>;
  private readonly _delayMs: number;
  private _timer: ReturnType<typeof setTimeout> | null = null;
}
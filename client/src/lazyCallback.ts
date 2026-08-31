type Callback<Arguments extends readonly unknown[], Result> = (...args: Arguments) => Result;

export class LazyCallback<Arguments extends readonly unknown[], Result> {
  public register(callback: Callback<Arguments, Result>): () => void {
    if (this._callback !== null) throw new Error("Lazy callback is already registered");
    this._callback = callback;
    return () => {
      if (this._callback === callback) this._callback = null;
    };
  }

  public invoke(...args: Arguments): Result | undefined {
    return this._callback?.(...args);
  }

  private _callback: Callback<Arguments, Result> | null = null;
}

class LazyCallbackManager {
  public getLazyCallback<Arguments extends readonly unknown[], Result>(
    key: string,
  ): LazyCallback<Arguments, Result> {
    const existing = this._lazyCallbacks.get(key);
    if (existing !== undefined) {
      return existing as LazyCallback<Arguments, Result>;
    }
    const lazyCallback = new LazyCallback<Arguments, Result>();
    this._lazyCallbacks.set(key, lazyCallback);
    return lazyCallback;
  }

  private readonly _lazyCallbacks = new Map<string, unknown>();
}

export const gLazyCallbackManager = new LazyCallbackManager();
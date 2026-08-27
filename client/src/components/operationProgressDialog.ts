import { shallowRef } from "vue";

export type OperationProgressRequest = Readonly<{
  id: number;
  label: string;
  delayMs: number;
}>;

class OperationProgressDialogController {
  public async run<TResult>(
    label: string,
    operation: () => Promise<TResult>,
    delayMs: number,
  ): Promise<TResult> {
    if (this._request.value !== null) {
      throw new Error("An operation progress dialog is already active");
    }
    const request: OperationProgressRequest = {
      id: this._nextRequestId += 1,
      label,
      delayMs,
    };
    this._request.value = request;
    try {
      return await operation();
    } finally {
      if (this._request.value?.id === request.id) this._request.value = null;
    }
  }

  public getRequest(): OperationProgressRequest | null {
    return this._request.value;
  }

  private readonly _request = shallowRef<OperationProgressRequest | null>(null);
  private _nextRequestId = 0;
}

const gOperationProgressDialogController = new OperationProgressDialogController();

export function runWithOperationProgress<TResult>(
  label: string,
  operation: () => Promise<TResult>,
  delayMs = 300,
): Promise<TResult> {
  return gOperationProgressDialogController.run(label, operation, delayMs);
}

export function getOperationProgressRequest(): OperationProgressRequest | null {
  return gOperationProgressDialogController.getRequest();
}

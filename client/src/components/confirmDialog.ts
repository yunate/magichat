import { shallowRef } from "vue";
import type { ConfirmDialogAction, ConfirmDialogOptions } from "./confirmDialogTypes";

type ConfirmDialogRequest = ConfirmDialogOptions<string> & Readonly<{
  complete: (actionId: string) => void;
}>;

class ConfirmDialogController {
  public confirm<TActionId extends string>(options: ConfirmDialogOptions<TActionId>): Promise<TActionId> {
    if (this._request.value !== null) {
      throw new Error("A confirm dialog is already open");
    }
    return new Promise<TActionId>((resolve) => {
      this._request.value = {
        ...options,
        complete: (actionId) => {
          if (!this._isActionId(actionId, options.actions)) {
            throw new Error("Confirm dialog returned an invalid action");
          }
          resolve(actionId);
        },
      };
    });
  }

  public getRequest(): ConfirmDialogRequest | null {
    return this._request.value;
  }

  public hasRequest(): boolean {
    return this._request.value !== null;
  }

  public resolve(actionId: string): void {
    const request = this._request.value;
    if (request === null) return;
    this._request.value = null;
    request.complete(actionId);
  }

  public cancel(): void {
    const request = this._request.value;
    if (request === null) return;
    this._request.value = null;
    request.complete(request.cancelActionId);
  }

  private _isActionId<TActionId extends string>(
    actionId: string,
    actions: readonly ConfirmDialogAction<TActionId>[],
  ): actionId is TActionId {
    return actions.some((action) => action.id === actionId);
  }

  private readonly _request = shallowRef<ConfirmDialogRequest | null>(null);
}

const gConfirmDialogController = new ConfirmDialogController();

export function confirmDialog<TActionId extends string>(
  options: ConfirmDialogOptions<TActionId>,
): Promise<TActionId> {
  return gConfirmDialogController.confirm(options);
}

export function getConfirmDialogRequest(): ConfirmDialogRequest | null {
  return gConfirmDialogController.getRequest();
}

export function hasConfirmDialogRequest(): boolean {
  return gConfirmDialogController.hasRequest();
}

export function resolveConfirmDialog(actionId: string): void {
  gConfirmDialogController.resolve(actionId);
}

export function cancelConfirmDialog(): void {
  gConfirmDialogController.cancel();
}
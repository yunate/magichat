import type { TreeViewDataNotifierClientRpcApi } from "../../../../common/treeView";
import { ValidateUtils } from "../../../../common/validator";
import { gMessageStore } from "../../messages/messageStore";
import type { TreeViewController } from "./TreeView";

export class TreeViewDataNotifierRpcObject implements TreeViewDataNotifierClientRpcApi {
  public constructor(controller: TreeViewController) {
    this._controller = controller;
  }

  public async storageChanged(): Promise<void> {
    await this._controller.emitStorageChanged();
  }

  public operationCompleted(operationId: string, errorMessage: string | null): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(operationId)) {
      throw new Error("TreeView operation ID is invalid");
    }
    if (errorMessage !== null) {
      ValidateUtils.ensureNonBlankString(errorMessage, "TreeView operation error is invalid");
    }
    this._controller.emitOperationCompleted(operationId, errorMessage);
  }

  public storageWarning(message: string): void {
    ValidateUtils.ensureNonBlankString(message, "TreeView storage warning is invalid");
    gMessageStore.pushMessage("warning", message);
  }

  private readonly _controller: TreeViewController;
}
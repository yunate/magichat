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

  public storageWarning(message: string): void {
    ValidateUtils.ensureNonBlankString(message, "TreeView storage warning is invalid");
    gMessageStore.pushMessage("warning", message);
  }

  private readonly _controller: TreeViewController;
}
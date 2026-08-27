import type { TreeViewDataNotifierClientRpcApi } from "../../../../common/treeView";
import type { TreeViewController } from "./TreeView";

export class TreeViewDataNotifierRpcObject implements TreeViewDataNotifierClientRpcApi {
  public constructor(controller: TreeViewController) {
    this._controller = controller;
  }

  public async storageChanged(): Promise<void> {
    await this._controller.emitStorageChanged();
  }

  private readonly _controller: TreeViewController;
}
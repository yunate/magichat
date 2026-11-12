import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type { TreeViewDataProvider } from "../../../../common/treeView";
import { createTreeViewDataProvider } from "../../bridge/remote_rpc_objects/treeViewDataProvider";
import { gMainApplication } from "../../windows/main/main";
import type { TreeViewController } from "./TreeView";
import { TreeViewDataNotifierRpcObject } from "./treeViewDataNotifierRpcObject";

export async function createDefaultTreeViewDataProvider(
  controller: TreeViewController,
): Promise<RemoteObject<TreeViewDataProvider>> {
  return createTreeViewDataProvider(
    gMainApplication.window.getBackendPeer(),
    new TreeViewDataNotifierRpcObject(controller),
  );
}

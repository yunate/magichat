import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type { TreeViewDataProvider } from "../../../../common/treeView";
import {
  createTreeViewDataProvider,
  initializeTreeViewDataNotifier,
} from "../../bridge/remote_rpc_objects/treeViewDataProvider";
import { gMainApplication } from "../../windows/main/main";
import type { TreeViewController } from "./TreeView";
import { TreeViewDataNotifierRpcObject } from "./treeViewDataNotifierRpcObject";

export async function createDefaultTreeViewDataProvider(
  controller: TreeViewController,
): Promise<RemoteObject<TreeViewDataProvider>> {
  const provider = await createTreeViewDataProvider(gMainApplication.window.getPeer());
  await initializeTreeViewDataNotifier(
    provider,
    new TreeViewDataNotifierRpcObject(controller),
  );
  return provider;
}

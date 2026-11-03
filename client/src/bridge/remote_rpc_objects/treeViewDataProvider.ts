import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type {
  TreeViewDataNotifierClientRpcApi,
  TreeViewDataProvider,
} from "../../../../common/treeView";

export async function createTreeViewDataProvider(
  peer: BridgePeer,
  notifier: TreeViewDataNotifierClientRpcApi,
): Promise<RemoteObject<TreeViewDataProvider>> {
  const provider = await BridgeRouter.createRemoteObj<TreeViewDataProvider>(peer, "TreeViewDataProvider");
  await provider.init(BridgeRouter.returnRemoteObj(notifier));
  return provider;
}

export async function destroyTreeViewDataProvider(
  provider: RemoteObject<TreeViewDataProvider>,
): Promise<void> {
  await provider.dispose();
  await BridgeRouter.destroyRemoteObj(provider);
}

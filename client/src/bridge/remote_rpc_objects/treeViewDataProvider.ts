import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type {
  TreeViewDataNotifierClientRpcApi,
  TreeViewDataProvider,
} from "../../../../common/treeView";

export function createTreeViewDataProvider(
  peer: BridgePeer,
): Promise<RemoteObject<TreeViewDataProvider>> {
  return BridgeRouter.createRemoteObj<TreeViewDataProvider>(peer, "TreeViewDataProvider");
}

export async function initializeTreeViewDataNotifier(
  provider: RemoteObject<TreeViewDataProvider>,
  notifier: TreeViewDataNotifierClientRpcApi,
): Promise<void> {
  const registerName = crypto.randomUUID();
  const router = BridgeRouter.getRouter();
  router.registerRemoteObj(registerName, (): TreeViewDataNotifierClientRpcApi => notifier);
  try {
    await provider.init(registerName);
  } finally {
    router.unregisterRemoteObj(registerName);
  }
}

export async function destroyTreeViewDataProvider(
  provider: RemoteObject<TreeViewDataProvider>,
): Promise<void> {
  await provider.dispose();
  await BridgeRouter.destroyRemoteObj(provider);
}

import type { BackendLifecycleServerRpcApi, BackendServerRpcApi } from "../../../../../common/backend/backendRpcApi";
import type { BridgePeer } from "../../../../../common/ipc_bridge/peer";
import type { BridgeRouter } from "../../../../../common/ipc_bridge/rpc";
import type { TreeViewDataProvider } from "../../../../../common/treeView";
import type { Backend } from "../../backend";
import { gLocalTreeViewDataProvider } from "../../services/treeView/localTreeViewDataProvider";

export class BackendRpcObjectRegistry {
  public static register(
    router: BridgeRouter,
    backend: Backend,
    mainPeer: BridgePeer,
  ): void {
    router.registerRemoteObj("BackendLifecycleServerRpcApi", (peer): BackendLifecycleServerRpcApi => {
      if (peer !== mainPeer) throw new Error("Backend lifecycle access is restricted to Main");
      return backend;
    });
    router.registerRemoteObj("BackendServerRpcApi", (): BackendServerRpcApi => ({
      getProcessId: () => backend.getProcessId(),
    }));
    router.registerRemoteObj("TreeViewDataProvider", (): TreeViewDataProvider => gLocalTreeViewDataProvider);
  }
}
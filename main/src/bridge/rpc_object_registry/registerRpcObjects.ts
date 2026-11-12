import type { WindowServerRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgeRouter } from "../../../../common/ipc_bridge/rpc";
import type { PlatformServerRpcApi } from "../../../../common/platform/platformRpcApi";
import { PlatformRpcObject } from "../../platform/platformRpcObject";
import { gBackendProcess } from "../../backendProcess";
import { getWindow } from "../../window/windowManager";

export class RpcObjectRegistry {
  public static register(router: BridgeRouter): void {
    router.registerRemoteObj("PlatformServerRpcApi", (peer): PlatformServerRpcApi => {
      if (!gBackendProcess.isControlPeer(peer)) throw new Error("Platform access is restricted to Backend");
      return new PlatformRpcObject();
    });
    router.registerRemoteObj(
      "WindowServerRpcApi",
      (peer): WindowServerRpcApi => getWindow(peer),
    );
  }
}
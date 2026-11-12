import type { BackendLifecycleServerRpcApi } from "../../../../common/backend/backendRpcApi";
import type { ConfigServerRpcApi } from "../../../../common/config/configRpcApi";
import type { ThemeServerRpcApi } from "../../../../common/theme/themeRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createBackendLifecycleServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<BackendLifecycleServerRpcApi>> {
  return BridgeRouter.createRemoteObj<BackendLifecycleServerRpcApi>(peer, "BackendLifecycleServerRpcApi");
}

export function createConfigServerRpcObject(peer: BridgePeer): Promise<RemoteObject<ConfigServerRpcApi>> {
  return BridgeRouter.createRemoteObj<ConfigServerRpcApi>(peer, "ConfigServerRpcApi");
}

export function createThemeServerRpcObject(peer: BridgePeer): Promise<RemoteObject<ThemeServerRpcApi>> {
  return BridgeRouter.createRemoteObj<ThemeServerRpcApi>(peer, "ThemeServerRpcApi");
}
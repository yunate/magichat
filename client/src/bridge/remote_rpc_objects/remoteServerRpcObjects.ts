import type { ConfigServerRpcApi } from "../../../../common/config/configRpcApi";
import type { TasksServerRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { TerminalRuntimeServiceApi } from "../../../../common/terminal";
import type { ThemeServerRpcApi } from "../../../../common/theme/themeRpcApi";
import type { UpdateServerRpcApi } from "../../../../common/update/updateRpcApi";
import type { WindowServerRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createConfigServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<ConfigServerRpcApi>> {
  return BridgeRouter.createRemoteObj<ConfigServerRpcApi>(peer, "ConfigServerRpcApi");
}

export function createTasksServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<TasksServerRpcApi>> {
  return BridgeRouter.createRemoteObj<TasksServerRpcApi>(peer, "TasksServerRpcApi");
}

export function getTerminalRuntimeService(
  peer: BridgePeer,
): Promise<RemoteObject<TerminalRuntimeServiceApi>> {
  return BridgeRouter.createRemoteObj<TerminalRuntimeServiceApi>(peer, "TerminalRuntimeServiceApi");
}

export function createThemeServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<ThemeServerRpcApi>> {
  return BridgeRouter.createRemoteObj<ThemeServerRpcApi>(peer, "ThemeServerRpcApi");
}

export function createWindowServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<WindowServerRpcApi>> {
  return BridgeRouter.createRemoteObj<WindowServerRpcApi>(peer, "WindowServerRpcApi");
}

export function createUpdateServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<UpdateServerRpcApi>> {
  return BridgeRouter.createRemoteObj<UpdateServerRpcApi>(peer, "UpdateServerRpcApi");
}

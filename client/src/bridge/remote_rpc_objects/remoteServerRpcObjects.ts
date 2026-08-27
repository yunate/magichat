import type { ConfigServerRpcApi } from "../../../../common/config/configRpcApi";
import type { TasksServerRpcApi } from "../../../../common/tasks/tasksRpcApi";
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

export function createWindowServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<WindowServerRpcApi>> {
  return BridgeRouter.createRemoteObj<WindowServerRpcApi>(peer, "WindowServerRpcApi");
}

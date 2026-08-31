import type { CommandClientRpcApi } from "../../../../common/command";
import type { TaskEventsClientRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { WindowClientRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createCommandClientRpcObject(
  peer: BridgePeer,
  registerName: string,
): Promise<RemoteObject<CommandClientRpcApi>> {
  return BridgeRouter.createRemoteObj<CommandClientRpcApi>(peer, registerName);
}

export function createTaskEventsClientRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<TaskEventsClientRpcApi>> {
  return BridgeRouter.createRemoteObj<TaskEventsClientRpcApi>(
    peer,
    "TaskEventsClientRpcApi",
  );
}

export function createWindowClientRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<WindowClientRpcApi>> {
  return BridgeRouter.createRemoteObj<WindowClientRpcApi>(
    peer,
    "WindowClientRpcApi",
  );
}
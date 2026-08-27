import type { TaskEventsClientRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createTaskEventsClientRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<TaskEventsClientRpcApi>> {
  return BridgeRouter.createRemoteObj<TaskEventsClientRpcApi>(
    peer,
    "TaskEventsClientRpcApi",
  );
}
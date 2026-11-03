import type {
  CommandStorageServerRpcApi,
} from "../../../../common/command";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createCommandStorageServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<CommandStorageServerRpcApi>> {
  return BridgeRouter.createRemoteObj<CommandStorageServerRpcApi>(
    peer,
    "CommandStorageServerRpcApi",
  );
}

export function disposeCommandClient(
  commandStorage: RemoteObject<CommandStorageServerRpcApi>,
): Promise<void> {
  return commandStorage.dispose();
}
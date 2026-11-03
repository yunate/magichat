import type {
  FileOccupancyClientRpcApi,
  FileOccupancyServerRpcApi,
} from "../../../../common/fileOccupancy";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export async function createFileOccupancyServerRpcObject(
  peer: BridgePeer,
  notifier: FileOccupancyClientRpcApi,
): Promise<RemoteObject<FileOccupancyServerRpcApi>> {
  const remoteObject = await BridgeRouter.createRemoteObj<FileOccupancyServerRpcApi>(
    peer,
    "FileOccupancyServerRpcApi",
  );
  await remoteObject.init(BridgeRouter.returnRemoteObj(notifier));
  return remoteObject;
}

export function destroyFileOccupancyServerRpcObject(
  remoteObject: RemoteObject<FileOccupancyServerRpcApi>,
): Promise<boolean> {
  return BridgeRouter.destroyRemoteObj(remoteObject);
}
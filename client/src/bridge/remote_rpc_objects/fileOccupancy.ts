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
  const notifierRegisterName = globalThis.crypto.randomUUID();
  const router = BridgeRouter.getRouter();
  router.registerRemoteObj(
    notifierRegisterName,
    (): FileOccupancyClientRpcApi => notifier,
  );
  try {
    await remoteObject.init(notifierRegisterName);
  } finally {
    router.unregisterRemoteObj(notifierRegisterName);
  }
  return remoteObject;
}

export function destroyFileOccupancyServerRpcObject(
  remoteObject: RemoteObject<FileOccupancyServerRpcApi>,
): Promise<boolean> {
  return BridgeRouter.destroyRemoteObj(remoteObject);
}
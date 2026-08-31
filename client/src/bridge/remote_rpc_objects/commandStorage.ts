import type {
  CommandClientRpcApi,
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

export async function initializeCommandClient(
  commandStorage: RemoteObject<CommandStorageServerRpcApi>,
  client: CommandClientRpcApi,
): Promise<void> {
  const registerName = crypto.randomUUID();
  const router = BridgeRouter.getRouter();
  router.registerRemoteObj(registerName, (): CommandClientRpcApi => client);
  try {
    await commandStorage.init(registerName);
  } finally {
    router.unregisterRemoteObj(registerName);
  }
}

export function disposeCommandClient(
  commandStorage: RemoteObject<CommandStorageServerRpcApi>,
): Promise<void> {
  return commandStorage.dispose();
}
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type {
  TerminalClientRpcApi,
  TerminalServerRpcApi,
} from "../../../../common/terminal";

export async function createTerminalRuntime(
  peer: BridgePeer,
  notifier: TerminalClientRpcApi,
): Promise<RemoteObject<TerminalServerRpcApi>> {
  const runtime = await BridgeRouter.createRemoteObj<TerminalServerRpcApi>(
    peer,
    "TerminalServerRpcApi",
  );
  await runtime.init(BridgeRouter.returnRemoteObj(notifier));
  return runtime;
}

export async function destroyTerminalRuntime(
  runtime: RemoteObject<TerminalServerRpcApi>,
): Promise<void> {
  await runtime.dispose();
  await BridgeRouter.destroyRemoteObj(runtime);
}

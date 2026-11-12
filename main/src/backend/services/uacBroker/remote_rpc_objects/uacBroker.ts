import type { BridgePeer } from "../../../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../../../common/ipc_bridge/rpc";
import type { UacBrokerServerRpcApi } from "../../../../../../common/uac/uacBrokerRpcApi";

export function createUacBrokerServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<UacBrokerServerRpcApi>> {
  return BridgeRouter.createRemoteObj<UacBrokerServerRpcApi>(
    peer,
    "UacBrokerServerRpcApi",
  );
}
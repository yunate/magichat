import type { FileOccupancyUacServerRpcApi } from "../../../../../common/fileOccupancy";
import type { UacBrokerServerRpcApi } from "../../../../../common/uac/uacBrokerRpcApi";
import { BridgeRouter } from "../../../../../common/ipc_bridge/rpc";

export class UacBrokerRpcObjectRegistry {
  public static register(
    brokerApi: UacBrokerServerRpcApi,
    fileOccupancyApi: FileOccupancyUacServerRpcApi,
  ): void {
    const router = BridgeRouter.getRouter();
    router.registerRemoteObj(
      "UacBrokerServerRpcApi",
      (): UacBrokerServerRpcApi => brokerApi,
    );
    router.registerRemoteObj(
      "FileOccupancyUacServerRpcApi",
      (): FileOccupancyUacServerRpcApi => fileOccupancyApi,
    );
  }
}
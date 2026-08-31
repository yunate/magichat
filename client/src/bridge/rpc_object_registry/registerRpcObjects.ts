import type { TaskEventsClientRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { WindowClientRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgeRouter } from "../../../../common/ipc_bridge/rpc";
import { gWindowClientRpcObject } from "../../windows/main/windowClientRpcObject";
import { TaskEventsClientRpcObject } from "../../windows/main/pages/taskCenter/taskEventsClientRpcObject";

export class RpcObjectRegistry {
  public static register(router: BridgeRouter): void {
    router.registerRemoteObj(
      "TaskEventsClientRpcApi",
      (): TaskEventsClientRpcApi => new TaskEventsClientRpcObject(),
    );
    router.registerRemoteObj(
      "WindowClientRpcApi",
      (): WindowClientRpcApi => gWindowClientRpcObject,
    );
  }
}
import type { TaskEventsClientRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { BridgeRouter } from "../../../../common/ipc_bridge/rpc";
import { TaskEventsClientRpcObject } from "../../windows/main/pages/taskCenter/taskEventsClientRpcObject";

export class RpcObjectRegistry {
  public static register(router: BridgeRouter): void {
    router.registerRemoteObj(
      "TaskEventsClientRpcApi",
      (): TaskEventsClientRpcApi => new TaskEventsClientRpcObject(),
    );
  }
}
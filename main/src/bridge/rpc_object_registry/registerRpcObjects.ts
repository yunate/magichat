import type { CommandTreeViewDataProvider } from "../../../../common/command";
import type { ConfigServerRpcApi } from "../../../../common/config/configRpcApi";
import type { TasksServerRpcApi } from "../../../../common/tasks/tasksRpcApi";
import type { TerminalServerRpcApi } from "../../../../common/terminal";
import type { WindowServerRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgeRouter } from "../../../../common/ipc_bridge/rpc";
import { gConfigManager } from "../../infra/configManager";
import { CommandTreeViewDataProviderObject } from "../../services/command/commandTreeViewDataProviderObject";
import { gTaskManager } from "../../services/tasks/taskManager";
import { TerminalRuntimeService } from "../../services/terminal/terminalRuntimeService";
import { getWindow } from "../../window/windowManager";

export class RpcObjectRegistry {
  public static register(router: BridgeRouter): void {
    router.registerRemoteObj(
      "CommandTreeViewDataProvider",
      (peer): CommandTreeViewDataProvider => new CommandTreeViewDataProviderObject(peer),
    );
    router.registerRemoteObj(
      "ConfigServerRpcApi",
      (): ConfigServerRpcApi => gConfigManager,
    );
    router.registerRemoteObj(
      "TasksServerRpcApi",
      (): TasksServerRpcApi => gTaskManager,
    );
    router.registerRemoteObj(
      "TerminalServerRpcApi",
      (peer): TerminalServerRpcApi => new TerminalRuntimeService(peer),
    );
    router.registerRemoteObj(
      "WindowServerRpcApi",
      (peer): WindowServerRpcApi => getWindow(peer),
    );
  }
}
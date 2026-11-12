import type { BridgeRouter } from "../../../../../common/ipc_bridge/rpc";
import type { CommandStorageServerRpcApi } from "../../../../../common/command";
import type { ConfigServerRpcApi } from "../../../../../common/config/configRpcApi";
import type { FileOccupancyServerRpcApi } from "../../../../../common/fileOccupancy";
import type { TasksServerRpcApi } from "../../../../../common/tasks/tasksRpcApi";
import type { TerminalRuntimeServiceApi } from "../../../../../common/terminal";
import type { ThemeServerRpcApi } from "../../../../../common/theme/themeRpcApi";
import type { UpdateServerRpcApi } from "../../../../../common/update/updateRpcApi";
import { gConfigManager } from "../../infra/configManager";
import { gCommandService } from "../../services/command/commandService";
import { FileOccupancyRpcObject } from "../../services/fileOccupancy/fileOccupancyRpcObject";
import { gTaskManager } from "../../services/tasks/taskManager";
import { gTerminalRuntimeService } from "../../services/terminal/terminalRuntimeService";
import { gThemeManager } from "../../services/theme/themeManager";
import { gUpdateService } from "../../services/update/updateService";

export class BackendBusinessRpcObjectRegistry {
  public static register(router: BridgeRouter): void {
    router.registerRemoteObj("CommandStorageServerRpcApi", (peer): CommandStorageServerRpcApi => gCommandService.createRpcObject(peer));
    router.registerRemoteObj("FileOccupancyServerRpcApi", (peer): FileOccupancyServerRpcApi => new FileOccupancyRpcObject(peer));
    router.registerRemoteObj("ConfigServerRpcApi", (): ConfigServerRpcApi => gConfigManager);
    router.registerRemoteObj("TasksServerRpcApi", (): TasksServerRpcApi => gTaskManager);
    router.registerRemoteObj("ThemeServerRpcApi", (): ThemeServerRpcApi => gThemeManager);
    router.registerRemoteObj("UpdateServerRpcApi", (): UpdateServerRpcApi => gUpdateService);
    router.registerRemoteObj("TerminalRuntimeServiceApi", (): TerminalRuntimeServiceApi => gTerminalRuntimeService);
  }
}
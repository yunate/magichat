import { COMMAND_CONFIG_KEY } from "../../../common/config/command";
import { BridgeRouter } from "../../../common/ipc_bridge/rpc";
import { gApplicationPaths } from "../infra/applicationPaths";
import { gConfigManager } from "./infra/configManager";
import { gCliBridge } from "./services/cli/cliBridge";
import { gTaskManager } from "./services/tasks/taskManager";
import { gPtyFactory } from "./services/terminal/ptyFactory";
import { gTerminalRuntimeService } from "./services/terminal/terminalRuntimeService";
import { gUacBrokerService } from "./services/uacBroker/uacBrokerService";
import { gLocalTreeViewDataProvider } from "./services/treeView/localTreeViewDataProvider";
import { BackendBusinessRpcObjectRegistry } from "./bridge/rpc_object_registry/registerBusinessRpcObjects";
import { gUpdateService } from "./services/update/updateService";

export class BackendApplication {
  public async start(): Promise<void> {
    BackendBusinessRpcObjectRegistry.register(BridgeRouter.getRouter());
    gUacBrokerService.onDisconnect(() => gTerminalRuntimeService.onUacBrokerDisconnect());
    await gCliBridge.start(gApplicationPaths.userDataDir);
    await this._updateTerminalInitialPath();
    this._unsubscribeConfigChanges = gConfigManager.onChange((configKey) => {
      if (configKey === COMMAND_CONFIG_KEY) void this._updateTerminalInitialPath();
    });
    gTaskManager.startQueuedTasks();
  }

  public async dispose(): Promise<void> {
    this._unsubscribeConfigChanges?.();
    this._unsubscribeConfigChanges = null;
    await gPtyFactory.dispose();
    await gCliBridge.stop();
    await gTerminalRuntimeService.disposeAll();
    gTaskManager.disposeAll();
    await gUacBrokerService.dispose();
    await gTerminalRuntimeService.clearTemporaryDirectory();
    await gLocalTreeViewDataProvider.dispose();
  }

  public getRestartExecutablePath(): Promise<string> {
    return gUpdateService.getRestartExecutablePath();
  }

  private async _updateTerminalInitialPath(): Promise<void> {
    try {
      const config = gConfigManager.get(COMMAND_CONFIG_KEY);
      gPtyFactory.setInitialPath(config.terminalInitialPath);
      await gUacBrokerService.setTerminalInitialPath(config.terminalInitialPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[terminal] prewarming configuration failed: ${message}`);
    }
  }

  private _unsubscribeConfigChanges: (() => void) | null = null;
}

export const gBackendApplication = new BackendApplication();
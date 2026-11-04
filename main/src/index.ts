import "./infra/initializeApplicationPaths";
import { app, BrowserWindow, Menu, Tray } from "electron";
import fs from "node:fs";
import { COMMAND_CONFIG_KEY } from "../../common/config/command";
import { BridgeRouter } from "../../common/ipc_bridge/rpc";
import { RpcObjectRegistry } from "./bridge/rpc_object_registry/registerRpcObjects";
import { gApplicationPaths } from "./infra/applicationPaths";
import { gConfigManager } from "./infra/configManager";
import { gLogger } from "./infra/logger";
import { gCliBridge } from "./services/cli/cliBridge";
import { gTaskManager } from "./services/tasks/taskManager";
import { gPtyFactory } from "./services/terminal/ptyFactory";
import { gTerminalRuntimeService } from "./services/terminal/terminalRuntimeService";
import { gUacBrokerService } from "./services/uacBroker/uacBrokerService";
import { WindowFactory } from "./window/windowFactory";
import { WindowManager } from "./window/windowManager";

let gIsShutdownStarted = false;
let gIsShutdownComplete = false;
let gTray: Tray | null = null;
let gUnsubscribeConfigChanges: (() => void) | null = null;

function configureChromiumScheduling(): void {
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

function bringPrimaryWindowToFront(): void {
  if (gIsShutdownStarted) return;
  const browserWindow = BrowserWindow.getAllWindows()[0];
  if (browserWindow === undefined) return;
  if (browserWindow.isMinimized()) browserWindow.restore();
  if (!browserWindow.isVisible()) browserWindow.show();
  browserWindow.moveTop();
  browserWindow.focus();
}

function showPrimaryWindow(): void {
  const browserWindow = BrowserWindow.getAllWindows()[0];
  if (browserWindow === undefined) return;
  if (browserWindow.isMinimized()) browserWindow.restore();
  browserWindow.show();
  browserWindow.moveTop();
  browserWindow.focus();
}

async function shutdown(): Promise<void> {
  console.log("[main] Shutdown started.");
  gUnsubscribeConfigChanges?.();
  gUnsubscribeConfigChanges = null;
  gTray?.destroy();
  gTray = null;
  await gPtyFactory.dispose();
  await gCliBridge.stop();
  await WindowManager.getInstance().forEachWindow((window) => window.browserWindow.hide());
  await gTerminalRuntimeService.disposeAll();
  gTaskManager.disposeAll();
  await gUacBrokerService.dispose();
  await gTerminalRuntimeService.clearTemporaryDirectory();
  await WindowManager.getInstance().disposeAll();
  console.log("[main] Shutdown completed.");
  await gLogger.dispose();
}

function createTray(): void {
  const tray = new Tray(gApplicationPaths.appIconPath);
  tray.setToolTip("MagicHat");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open", click: showPrimaryWindow },
    {
      label: "Close",
      click: () => {
        void WindowManager.getInstance().forEachWindow((window) => window.requestClose());
      },
    },
  ]));
  tray.on("double-click", showPrimaryWindow);
  gTray = tray;
}

async function updateTerminalInitialPath(): Promise<void> {
  try {
    const config = gConfigManager.get(COMMAND_CONFIG_KEY);
    gPtyFactory.setInitialPath(config.terminalInitialPath);
    await gUacBrokerService.setTerminalInitialPath(config.terminalInitialPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[terminal] prewarming configuration failed: ${message}`);
  }
}

configureChromiumScheduling();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", bringPrimaryWindowToFront);

  void app.whenReady().then(async () => {
    await gLogger.start();
    const buildVersion = fs.readFileSync(gApplicationPaths.buildVersionPath, "utf8").trim();
    console.log(`[main] Application started. Version: ${buildVersion}.`);
    RpcObjectRegistry.register(BridgeRouter.getRouter());
    gUacBrokerService.onDisconnect(() => gTerminalRuntimeService.onUacBrokerDisconnect());
    await gCliBridge.start(app.getPath("userData"));
    await updateTerminalInitialPath();
    gUnsubscribeConfigChanges = gConfigManager.onChange((configKey) => {
      if (configKey === COMMAND_CONFIG_KEY) void updateTerminalInitialPath();
    });
    gTaskManager.startQueuedTasks();
    await WindowFactory.createWindow();
    createTray();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void WindowFactory.createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (gIsShutdownComplete) return;
    event.preventDefault();
    if (gIsShutdownStarted) return;
    gIsShutdownStarted = true;
    void shutdown().then(
      () => {
        gIsShutdownComplete = true;
        app.quit();
      },
      (error: unknown) => {
        const message = error instanceof Error
          ? `${error.name}: ${error.message}`
          : `Unknown exception: ${String(error)}`;
        console.error(`[main] ${message}`);
      },
    );
  });
}

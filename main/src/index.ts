import { app, BrowserWindow, Menu, Tray } from "electron";
import path from "node:path";
import { BridgeRouter } from "../../common/ipc_bridge/rpc";
import { RpcObjectRegistry } from "./bridge/rpc_object_registry/registerRpcObjects";
import { gApplicationPaths } from "./infra/applicationPaths";
import { gCliBridge } from "./services/cli/cliBridge";
import { gTaskManager } from "./services/tasks/taskManager";
import { gTerminalRuntimeManager } from "./services/terminal/terminalRuntimeManager";
import { gUacBrokerService } from "./services/uacBroker/uacBrokerService";
import { WindowFactory } from "./window/windowFactory";
import { WindowManager } from "./window/windowManager";

let gIsShutdownStarted = false;
let gIsShutdownComplete = false;
let gTray: Tray | null = null;

function configureInstanceScope(): void {
  if (app.isPackaged) return;
  app.setPath("userData", path.join(app.getPath("appData"), "magichat-development"));
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

async function shutdown(): Promise<void> {
  gTray?.destroy();
  gTray = null;
  await gCliBridge.stop();
  await WindowManager.getInstance().forEachWindow((window) => window.browserWindow.hide());
  await gTerminalRuntimeManager.disposeAll();
  gTaskManager.disposeAll();
  await gUacBrokerService.dispose();
  await gTerminalRuntimeManager.clearTemporaryDirectory();
  await WindowManager.getInstance().disposeAll();
}

function showPrimaryWindow(): void {
  const browserWindow = BrowserWindow.getAllWindows()[0];
  if (browserWindow === undefined) return;
  if (browserWindow.isMinimized()) browserWindow.restore();
  browserWindow.show();
  browserWindow.moveTop();
  browserWindow.focus();
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

configureInstanceScope();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", bringPrimaryWindowToFront);

  void app.whenReady().then(async () => {
    RpcObjectRegistry.register(BridgeRouter.getRouter());
    await gCliBridge.start(app.getPath("userData"));
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
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[main] shutdown failed: ${message}`);
      },
    );
  });
}

import { app, BrowserWindow } from "electron";
import path from "node:path";
import { BridgeRouter } from "../../common/ipc_bridge/rpc";
import { RpcObjectRegistry } from "./bridge/rpc_object_registry/registerRpcObjects";
import { gTaskManager } from "./services/tasks/taskManager";
import { gTerminalRuntimeManager } from "./services/terminal/terminalRuntimeManager";
import { WindowFactory } from "./window/windowFactory";
import { WindowManager } from "./window/windowManager";

let gIsShutdownStarted = false;
let gIsShutdownComplete = false;

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
  await WindowManager.getInstance().forEachWindow((window) => window.browserWindow.hide());
  await gTerminalRuntimeManager.disposeAll();
  gTaskManager.disposeAll();
  await gTerminalRuntimeManager.clearTemporaryDirectory();
  await WindowManager.getInstance().disposeAll();
}

configureInstanceScope();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", bringPrimaryWindowToFront);

  void app.whenReady().then(() => {
    RpcObjectRegistry.register(BridgeRouter.getRouter());
    void WindowFactory.createWindow();
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

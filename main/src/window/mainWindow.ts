import { BrowserWindow } from "electron";
import { gApplicationPaths } from "../infra/applicationPaths";
import { Window } from "./window";

export class MainWindow extends Window {
  protected createWindow(): BrowserWindow {
    const browserWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 560,
      frame: false,
      icon: gApplicationPaths.appIconPath,
      backgroundColor: "#0f172a",
      webPreferences: {
        preload: gApplicationPaths.preloadEntryPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    browserWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    browserWindow.webContents.on("will-navigate", (event, url) => {
      if (url !== browserWindow.webContents.getURL()) event.preventDefault();
    });
    browserWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
    return browserWindow;
  }
}
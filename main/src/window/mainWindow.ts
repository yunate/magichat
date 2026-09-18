import { BrowserWindow } from "electron";
import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import {
  GLOBAL_CONFIG_KEY,
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
} from "../../../common/config/global";
import { gApplicationPaths } from "../infra/applicationPaths";
import { gConfigManager } from "../infra/configManager";
import { gThemeManager } from "../services/theme/themeManager";
import { Window } from "./window";

export class MainWindow extends Window {
  public constructor(peer: BridgePeer) {
    super(peer);
    this.browserWindow.on("resize", this._scheduleSaveBounds);
    this.browserWindow.on("move", this._scheduleSaveBounds);
    this.browserWindow.on("closed", this._clearSaveTimer);
  }

  protected createWindow(): BrowserWindow {
    const config = gConfigManager.get(GLOBAL_CONFIG_KEY);
    const bounds = config.mainWindow;
    const theme = gThemeManager.resolveTheme(config.theme.name);
    const browserWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      ...(bounds.x === null || bounds.y === null ? {} : { x: bounds.x, y: bounds.y }),
      minWidth: MAIN_WINDOW_MIN_WIDTH,
      minHeight: MAIN_WINDOW_MIN_HEIGHT,
      show: false,
      frame: false,
      icon: gApplicationPaths.appIconPath,
      backgroundColor: theme.name === "light" ? "#ffffff" : "#181818",
      webPreferences: {
        preload: gApplicationPaths.preloadEntryPath,
        backgroundThrottling: false,
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
    browserWindow.maximize();
    browserWindow.show();
    return browserWindow;
  }

  private _saveBounds(): void {
    this._saveTimer = null;
    if (this.browserWindow.isDestroyed()
      || this.browserWindow.isMaximized()
      || this.browserWindow.isMinimized()
      || this.browserWindow.isFullScreen()) return;
    const { width, height, x, y } = this.browserWindow.getBounds();
    try {
      const config = gConfigManager.get(GLOBAL_CONFIG_KEY);
      gConfigManager.set(GLOBAL_CONFIG_KEY, {
        ...config,
        mainWindow: { width, height, x, y },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mainWindow] failed to save window bounds: ${message}`);
    }
  }

  private static readonly _SAVE_DELAY_MS = 250;

  private readonly _scheduleSaveBounds = (): void => {
    this._clearSaveTimer();
    this._saveTimer = setTimeout(() => this._saveBounds(), MainWindow._SAVE_DELAY_MS);
  };

  private readonly _clearSaveTimer = (): void => {
    if (this._saveTimer === null) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
  };
  private _saveTimer: NodeJS.Timeout | null = null;
}
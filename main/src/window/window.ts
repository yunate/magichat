import { app, shell, type BrowserWindow } from "electron";
import path from "node:path";
import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { RemoteObject } from "../../../common/ipc_bridge/rpc";
import type { TaskEventsClientRpcApi } from "../../../common/tasks/tasksRpcApi";
import type {
  WindowClientRpcApi,
  WindowServerRpcApi,
} from "../../../common/window/windowRpcApi";
import {
  createTaskEventsClientRpcObject,
  createWindowClientRpcObject,
} from "../bridge/remote_rpc_objects/remoteClientRpcObjects";
import { gApplicationPaths } from "../infra/applicationPaths";

const LATEST_RELEASE_URL = "https://github.com/ddmagichat/magichat-release/releases/tag/latest";
const ISSUES_URL = "https://github.com/ddmagichat/magichat-release/issues";
const DISCUSSIONS_URL = "https://github.com/ddmagichat/magichat-release/discussions";

export abstract class Window implements WindowServerRpcApi {
  public constructor(peer: BridgePeer) {
    this.peer = peer;
    this.browserWindow = this.createWindow();
    this.taskEventsClientRpcObject = createTaskEventsClientRpcObject(peer);
    this._windowClientRpcObject = createWindowClientRpcObject(peer);
    this.browserWindow.on("close", this._handleClose);
  }

  // implement WindowServerRpcApi's methods
  public rendererReady(): void {
    this._isRendererReady = true;
    for (const listener of this._rendererReadyListeners.splice(0)) listener();
  }

  public getApplicationDirectoryPath(): string {
    return gApplicationPaths.isPackaged
      ? path.dirname(process.execPath)
      : gApplicationPaths.appPath;
  }

  public async openApplicationDirectory(): Promise<void> {
    const errorMessage = await shell.openPath(this.getApplicationDirectoryPath());
    if (errorMessage.length > 0) throw new Error("Application directory could not be opened.");
  }

  public getLogDirectoryPath(): string {
    return gApplicationPaths.logDirectoryPath;
  }

  public async openLogDirectory(): Promise<void> {
    const errorMessage = await shell.openPath(this.getLogDirectoryPath());
    if (errorMessage.length > 0) throw new Error("Log directory could not be opened.");
  }

  public async openLatestReleasePage(): Promise<void> {
    await shell.openExternal(LATEST_RELEASE_URL);
  }

  public async openIssuesPage(): Promise<void> {
    await shell.openExternal(ISSUES_URL);
  }

  public async openDiscussionsPage(): Promise<void> {
    await shell.openExternal(DISCUSSIONS_URL);
  }

  // implement WindowServerRpcApi's methods
  public minimize(): void {
    this.browserWindow.minimize();
  }

  // implement WindowServerRpcApi's methods
  public hide(): void {
    this.browserWindow.hide();
  }

  // implement WindowServerRpcApi's methods
  public show(): void {
    if (this.browserWindow.isMinimized()) this.browserWindow.restore();
    this.browserWindow.show();
    this.browserWindow.moveTop();
    this.browserWindow.focus();
  }

  // implement WindowServerRpcApi's methods
  public toggleMaximize(): void {
    if (this.browserWindow.isMaximized()) {
      this.browserWindow.unmaximize();
      return;
    }
    this.browserWindow.maximize();
  }

  // implement WindowServerRpcApi's methods
  public close(): void {
    this.browserWindow.removeListener("close", this._handleClose);
    setImmediate(() => app.quit());
  }

  public async requestClose(): Promise<void> {
    await (await this._windowClientRpcObject).requestClose();
  }

  public waitForRendererReady(): Promise<void> {
    if (this._isRendererReady) return Promise.resolve();
    return new Promise((resolve) => this._rendererReadyListeners.push(resolve));
  }

  public async dispose(): Promise<void> {
    await this.peer.close();
  }

  protected abstract createWindow(): BrowserWindow;

  private readonly _handleClose = (event: Electron.Event): void => {
    event.preventDefault();
    this.browserWindow.hide();
  };

  public readonly peer: BridgePeer;
  public readonly browserWindow: BrowserWindow;
  public readonly taskEventsClientRpcObject: Promise<RemoteObject<TaskEventsClientRpcApi>>;

  private readonly _windowClientRpcObject: Promise<RemoteObject<WindowClientRpcApi>>;
  private readonly _rendererReadyListeners: (() => void)[] = [];
  private _isRendererReady = false;
}
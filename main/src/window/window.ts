import { app, type BrowserWindow } from "electron";
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
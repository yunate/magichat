import { app, type BrowserWindow } from "electron";
import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { RemoteObject } from "../../../common/ipc_bridge/rpc";
import type { TaskEventsClientRpcApi } from "../../../common/tasks/tasksRpcApi";
import type { WindowServerRpcApi } from "../../../common/window/windowRpcApi";
import { createTaskEventsClientRpcObject } from "../bridge/remote_rpc_objects/remoteClientRpcObjects";

export abstract class Window implements WindowServerRpcApi {
  public constructor(peer: BridgePeer) {
    this.peer = peer;
    this.browserWindow = this.createWindow();
    this.taskEventsClientRpcObject = createTaskEventsClientRpcObject(peer);
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
  public toggleMaximize(): void {
    if (this.browserWindow.isMaximized()) {
      this.browserWindow.unmaximize();
      return;
    }
    this.browserWindow.maximize();
  }

  // implement WindowServerRpcApi's methods
  public close(): void {
    setImmediate(() => app.quit());
  }

  public waitForRendererReady(): Promise<void> {
    if (this._isRendererReady) return Promise.resolve();
    return new Promise((resolve) => this._rendererReadyListeners.push(resolve));
  }

  public async dispose(): Promise<void> {
    await this.peer.close();
  }

  protected abstract createWindow(): BrowserWindow;

  public readonly peer: BridgePeer;
  public readonly browserWindow: BrowserWindow;
  public readonly taskEventsClientRpcObject: Promise<RemoteObject<TaskEventsClientRpcApi>>;

  private readonly _rendererReadyListeners: (() => void)[] = [];
  private _isRendererReady = false;
}
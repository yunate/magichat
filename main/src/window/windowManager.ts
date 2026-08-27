import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { Window } from "./window";

export class WindowManager {
  public static getInstance(): WindowManager {
    WindowManager._instance ??= new WindowManager();
    return WindowManager._instance;
  }

  public add(window: Window): void {
    if (this._windows.has(window.peer)) {
      throw new Error("Window peer is already registered");
    }
    this._windows.set(window.peer, window);
  }

  public require(peer: BridgePeer): Window {
    const window = this._windows.get(peer);
    if (!window) throw new Error("Window not found or disconnected");
    return window;
  }

  public remove(peer: BridgePeer): void {
    this._windows.delete(peer);
  }

  public async forEachWindow(handler: (window: Window) => void | Promise<void>): Promise<void> {
    for (const window of [...this._windows.values()]) await handler(window);
  }

  public async disposeAll(): Promise<void> {
    const windows = [...this._windows.values()];
    this._windows.clear();
    await Promise.allSettled(windows.map((window) => window.dispose()));
  }

  private static _instance: WindowManager | null = null;
  private readonly _windows = new Map<BridgePeer, Window>();
}

export function getWindow(peer: BridgePeer): Window {
  return WindowManager.getInstance().require(peer);
}
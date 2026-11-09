import { MessageChannelMain, type MessagePortMain } from "electron";
import { randomUUID } from "node:crypto";
import { createMessagePortPeer } from "../../../common/ipc_bridge/messagePortPeer";
import { BRIDGE_CONNECT_ACCEPT } from "../../../common/ipc_bridge/messagePortProtocol";
import { BridgeRouter } from "../../../common/ipc_bridge/rpc";
import { gApplicationPaths } from "../infra/applicationPaths";
import { MainWindow } from "./mainWindow";
import type { Window } from "./window";
import { WindowManager } from "./windowManager";

export class WindowFactory {
  public static async createWindow(): Promise<Window> {
    const connectId = randomUUID();
    const { port1, port2 } = new MessageChannelMain();
    const peer = createMessagePortPeer(port1, connectId);
    BridgeRouter.getRouter().startDispatchMessage(peer);
    const window = new MainWindow(peer);

    WindowManager.getInstance().add(window);
    peer.onDisconnect(() => {
      WindowManager.getInstance().remove(peer);
      console.log(`[main] ${connectId} disconnected`);
    });
    window.browserWindow.webContents.once("did-finish-load", () => {
      const ports: MessagePortMain[] = [port2];
      window.browserWindow.webContents.postMessage(
        BRIDGE_CONNECT_ACCEPT,
        { type: BRIDGE_CONNECT_ACCEPT, connectId },
        ports,
      );
    });
    void window.browserWindow.loadFile(gApplicationPaths.rendererEntryPath);
    await window.waitForRendererReady();
    console.log(`[main] ${connectId} connected`);
    return window;
  }
}
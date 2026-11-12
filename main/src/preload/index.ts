import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import {
  BRIDGE_CONNECT_ACCEPT,
  parseBridgeConnectAccept,
  type BridgeConnectAccept,
} from "../../../common/ipc_bridge/messagePortProtocol";

contextBridge.exposeInMainWorld("electronFileSystem", {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});

ipcRenderer.on(BRIDGE_CONNECT_ACCEPT, (event: IpcRendererEvent, payload: BridgeConnectAccept) => {
  const accept = parseBridgeConnectAccept(payload);
  if (event.ports.length !== 2) return;
  window.postMessage(accept, "*", event.ports);
});
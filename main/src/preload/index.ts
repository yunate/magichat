import { ipcRenderer, type IpcRendererEvent } from "electron";
import {
  BRIDGE_CONNECT_ACCEPT,
  parseBridgeConnectAccept,
  type BridgeConnectAccept,
} from "../../../common/ipc_bridge/messagePortProtocol";

ipcRenderer.on(BRIDGE_CONNECT_ACCEPT, (event: IpcRendererEvent, payload: BridgeConnectAccept) => {
  const accept = parseBridgeConnectAccept(payload);
  if (event.ports.length !== 1) return;
  window.postMessage(accept, "*", event.ports);
});
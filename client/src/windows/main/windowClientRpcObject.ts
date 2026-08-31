import type { WindowClientRpcApi } from "../../../../common/window/windowRpcApi";

export const WINDOW_CLOSE_REQUEST_EVENT = "magichat:window-close-request";

export class WindowClientRpcObject implements WindowClientRpcApi {
  public requestClose(): void {
    window.dispatchEvent(new Event(WINDOW_CLOSE_REQUEST_EVENT));
  }
}

export const gWindowClientRpcObject = new WindowClientRpcObject();

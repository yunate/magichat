import net from "node:net";
import {
  CLI_BRIDGE_MESSAGE_MAX_LENGTH,
  decodeCliBridgeRequest,
  encodeCliBridgeResponse,
  getCliBridgePipePath,
  type CliBridgeRequest,
  type CliBridgeResponse,
} from "../../../../../common/cli";
import { gCliService } from "./cliService";

export class CliBridge {
  public start(instanceScope: string): Promise<void> {
    if (this._server !== null) throw new Error("CLI Bridge is already started");
    const server = net.createServer((socket) => this._handleConnection(socket));
    this._server = server;
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(getCliBridgePipePath(instanceScope), () => {
        server.off("error", reject);
        server.on("error", (reason) => console.error(`[cli] bridge error: ${reason.message}`));
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    const server = this._server;
    if (server === null) return Promise.resolve();
    this._server = null;
    for (const socket of this._connections) socket.destroy();
    this._connections.clear();
    return new Promise((resolve, reject) => {
      server.close((reason) => reason === undefined ? resolve() : reject(reason));
    });
  }

  private _handleConnection(socket: net.Socket): void {
    this._connections.add(socket);
    let requestData = Buffer.alloc(0);
    let isHandled = false;
    socket.on("data", (chunk) => {
      if (isHandled) return;
      requestData = Buffer.concat([requestData, chunk]);
      if (requestData.length > CLI_BRIDGE_MESSAGE_MAX_LENGTH) {
        isHandled = true;
        this._sendResponse(socket, { successful: false, error: "CLI Bridge request is too large" });
        return;
      }
      try {
        const request = decodeCliBridgeRequest(requestData);
        if (request === null) return;
        isHandled = true;
        void this._handleRequest(socket, request);
      } catch (reason: unknown) {
        isHandled = true;
        const message = reason instanceof Error ? reason.message : String(reason);
        this._sendResponse(socket, { successful: false, error: message });
      }
    });
    socket.on("error", (reason) => console.error(`[cli] connection error: ${reason.message}`));
    socket.on("close", () => this._connections.delete(socket));
  }

  private async _handleRequest(socket: net.Socket, request: CliBridgeRequest): Promise<void> {
    try {
      const response = await gCliService.handle(request.arguments, request.environment);
      this._sendResponse(socket, { successful: true, response });
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      this._sendResponse(socket, { successful: false, error: message });
    }
  }

  private _sendResponse(socket: net.Socket, response: CliBridgeResponse): void {
    socket.end(encodeCliBridgeResponse(response));
  }

  private readonly _connections = new Set<net.Socket>();
  private _server: net.Server | null = null;
}

export const gCliBridge = new CliBridge();
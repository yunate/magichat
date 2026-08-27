import { BridgePeer, type BridgeSocket, type PeerOptions } from "./peer";
import {
  parseBridgeTransportMessage,
  type BridgeTransportMessage,
} from "./messagePortProtocol";

type MainMessageEvent = {
  readonly data: unknown;
};

type MainMessagePort = {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  on(event: "message", listener: (event: MainMessageEvent) => void): void;
  on(event: "close", listener: () => void): void;
};

export type BridgeMessagePort = MessagePort | MainMessagePort;

function isDomMessagePort(port: BridgeMessagePort): port is MessagePort {
  return "addEventListener" in port;
}

class MessagePortBridge implements BridgeSocket {
  public constructor(port: BridgeMessagePort) {
    this._port = port;
    if (isDomMessagePort(port)) {
      port.addEventListener("message", this._handleMessage);
      port.addEventListener("messageerror", this._handleMessageError);
    } else {
      port.on("message", this._handleMessage);
      port.on("close", this._finishClose);
    }
  }

  public start(): void {
    if (this._isConnected) return;
    this._isConnected = true;
    this._port.start();
    for (const handler of this._connectHandlers) handler();
  }

  public send(data: string): void {
    if (!this._isConnected) throw new Error("MessagePort is closed");
    const message: BridgeTransportMessage = { kind: "message", data };
    this._port.postMessage(message);
  }

  public close(): void {
    if (!this._isConnected) return;
    const message: BridgeTransportMessage = { kind: "close" };
    this._port.postMessage(message);
    this._finishClose();
  }

  public onMessage(handler: (data: string) => void): void {
    this._messageHandlers.push(handler);
  }

  public onClose(handler: () => void): void {
    this._closeHandlers.push(handler);
  }

  public onConnected(handler: () => void): void {
    this._connectHandlers.push(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this._errorHandlers.push(handler);
  }

  public isConnected(): boolean {
    return this._isConnected;
  }

  private readonly _handleMessage = (event: MainMessageEvent): void => {
    const message = parseBridgeTransportMessage(event.data);
    if (message.kind === "close") {
      this._finishClose();
      return;
    }
    for (const handler of this._messageHandlers) handler(message.data);
  };

  private readonly _handleMessageError = (): void => {
    this._emitError(new Error("MessagePort deserialization failed"));
  };

  private readonly _finishClose = (): void => {
    if (!this._isConnected) return;
    this._isConnected = false;
    this._port.close();
    for (const handler of this._closeHandlers) handler();
  };

  private _emitError(error: Error): void {
    for (const handler of this._errorHandlers) handler(error);
  }

  private readonly _port: BridgeMessagePort;
  private _isConnected = false;
  private readonly _messageHandlers: Array<(data: string) => void> = [];
  private readonly _closeHandlers: Array<() => void> = [];
  private readonly _connectHandlers: Array<() => void> = [];
  private readonly _errorHandlers: Array<(error: Error) => void> = [];
}

export function createMessagePortPeer(
  port: BridgeMessagePort,
  connectId: string,
  options: PeerOptions = {},
): BridgePeer {
  const peer = new BridgePeer(options);
  const bridge = new MessagePortBridge(port);
  peer.setSocket(bridge, connectId);
  bridge.start();
  return peer;
}
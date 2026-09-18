import type { Socket } from "node:net";
import type { BridgeSocket } from "./peer";

const MAX_MESSAGE_LENGTH = 64 * 1024 * 1024;
const MESSAGE_LENGTH_SIZE = 4;

export class PipeBridgeSocket implements BridgeSocket {
  public constructor(socket: Socket) {
    this._socket = socket;
    socket.on("data", (chunk) => this._receive(chunk));
    socket.once("error", (error) => this._emitError(error));
    socket.once("close", () => this._finishClose());
  }

  public start(): void {
    if (this._isConnected) return;
    if (this._socket.connecting) {
      this._socket.once("connect", () => this._finishConnect());
      return;
    }
    this._finishConnect();
  }

  public send(data: string): void {
    if (!this._isConnected) throw new Error("Pipe is closed");
    const encodedData = Buffer.from(data, "utf8");
    if (encodedData.length > MAX_MESSAGE_LENGTH) throw new Error("Pipe message is too large");
    const message = Buffer.allocUnsafe(MESSAGE_LENGTH_SIZE + encodedData.length);
    message.writeUInt32LE(encodedData.length, 0);
    encodedData.copy(message, MESSAGE_LENGTH_SIZE);
    this._socket.write(message);
  }

  public close(): void {
    if (!this._isConnected) return;
    this._socket.end();
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

  private _finishConnect(): void {
    if (this._isConnected) return;
    this._isConnected = true;
    for (const handler of this._connectHandlers) handler();
  }

  private _receive(chunk: Buffer): void {
    try {
      this._receiveBuffer = Buffer.concat([this._receiveBuffer, chunk]);
      while (true) {
        if (this._receiveBuffer.length < MESSAGE_LENGTH_SIZE) return;
        const dataLength = this._receiveBuffer.readUInt32LE(0);
        if (dataLength > MAX_MESSAGE_LENGTH) throw new Error("Pipe message is too large");
        const messageLength = MESSAGE_LENGTH_SIZE + dataLength;
        if (this._receiveBuffer.length < messageLength) return;
        const encodedData = this._receiveBuffer.subarray(MESSAGE_LENGTH_SIZE, messageLength);
        const data = encodedData.toString("utf8");
        if (!Buffer.from(data, "utf8").equals(encodedData)) {
          throw new Error("Pipe message encoding is invalid");
        }
        this._receiveBuffer = Buffer.from(this._receiveBuffer.subarray(messageLength));
        for (const handler of this._messageHandlers) handler(data);
      }
    } catch (error) {
      this._emitError(error instanceof Error ? error : new Error(String(error)));
      this._socket.destroy();
    }
  }

  private _finishClose(): void {
    if (!this._isConnected) return;
    this._isConnected = false;
    for (const handler of this._closeHandlers) handler();
  }

  private _emitError(error: Error): void {
    for (const handler of this._errorHandlers) handler(error);
  }

  private readonly _socket: Socket;
  private _isConnected = false;
  private _receiveBuffer = Buffer.alloc(0);
  private readonly _messageHandlers: Array<(data: string) => void> = [];
  private readonly _closeHandlers: Array<() => void> = [];
  private readonly _connectHandlers: Array<() => void> = [];
  private readonly _errorHandlers: Array<(error: Error) => void> = [];
}
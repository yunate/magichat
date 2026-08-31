import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import type { Server, Socket } from "node:net";
import { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { PipeBridgeSocket } from "../../../../common/ipc_bridge/pipeBridgeSocket";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type {
  UacBrokerReadyInfo,
  UacBrokerServerRpcApi,
} from "../../../../common/uac/uacBrokerRpcApi";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { FileOccupancyService } from "../fileOccupancy/fileOccupancyService";
import { createUacBrokerServerRpcObject } from "./remote_rpc_objects/uacBroker";

type UacBrokerConnection = Readonly<{
  broker: RemoteObject<UacBrokerServerRpcApi>;
  peer: BridgePeer;
}>;

export class UacBrokerService {
  public async getFileOccupancyService(): Promise<FileOccupancyService> {
    await this._ensureInitialized();
    if (this._fileOccupancyService === null) {
      throw new Error("File occupancy service is not initialized");
    }
    return this._fileOccupancyService;
  }

  public getExistingFileOccupancyService(): FileOccupancyService {
    if (this._fileOccupancyService === null) {
      throw new Error("File occupancy service is not initialized");
    }
    return this._fileOccupancyService;
  }

  public async dispose(): Promise<void> {
    const initializationAbortController = this._initializationAbortController;
    if (initializationAbortController !== null) {
      initializationAbortController.abort();
      return;
    }
    const connection = this._connection;
    if (connection === null) return;
    await connection.broker.shutdown();
    await connection.peer.waitForDisconnect();
    this._resetConnection(connection.peer);
  }

  private async _ensureInitialized(): Promise<void> {
    this._initializationPromise ??= (async (): Promise<UacBrokerConnection> => {
      const pipeName = `magichat-uac-${process.pid}-${randomUUID().replaceAll("-", "")}`;
      const token = randomUUID().replaceAll("-", "");
      const server = net.createServer();
      const initializationAbortController = new AbortController();
      this._initializationAbortController = initializationAbortController;
      try {
        const socketPromise = this._listenForBroker(server, pipeName, initializationAbortController.signal);
        const [brokerProcessId, socket] = await Promise.all([
          this._launchBroker(pipeName, token, initializationAbortController.signal),
          socketPromise,
        ]);
        initializationAbortController.signal.throwIfAborted();
        server.close();
        const peer = new BridgePeer();
        const bridgeSocket = new PipeBridgeSocket(socket);
        this._peer = peer;
        peer.setSocket(bridgeSocket, "uac-broker");
        initializationAbortController.signal.addEventListener(
          "abort",
          () => void peer.close(),
          { once: true },
        );
        peer.onDisconnect(() => this._resetConnection(peer));
        BridgeRouter.getRouter().startDispatchMessage(peer);
        bridgeSocket.start();
        const broker = await createUacBrokerServerRpcObject(peer);
        const readyInfo: unknown = await broker.getReadyInfo();
        UacBrokerService._validateReadyInfo(readyInfo);
        if (readyInfo.processId !== brokerProcessId) {
          throw new Error("UAC Broker process identity is invalid");
        }
        if (readyInfo.token !== token) {
          throw new Error("UAC Broker authentication failed");
        }

        this._fileOccupancyService = await FileOccupancyService.create(peer);
        const connection = { broker, peer };
        this._connection = connection;
        return connection;
      } catch (error) {
        server.close();
        void this._peer?.close();
        this._resetConnection(this._peer);
        throw error;
      } finally {
        if (this._initializationAbortController === initializationAbortController) {
          this._initializationAbortController = null;
        }
      }
    })();
    try {
      await this._initializationPromise;
    } catch (error) {
      this._initializationPromise = null;
      this._fileOccupancyService = null;
      throw error;
    }
  }

  private _launchBroker(pipeName: string, token: string, signal: AbortSignal): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(gApplicationPaths.jsLauncherExecutablePath, [
        gApplicationPaths.uacBrokerEntryPath,
        "true",
        "--pipe-name",
        pipeName,
        "--main-pid",
        process.pid.toString(),
        "--token",
        token,
        "--native-tools-path",
        gApplicationPaths.nativeToolsDirectoryPath,
      ], {
        signal,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputError: Error | null = null;
      const appendOutput = (target: Buffer[], chunk: Buffer): void => {
        if (outputError !== null) return;
        try {
          UacBrokerService._appendOutput(target, chunk);
        } catch (error) {
          outputError = error instanceof Error ? error : new Error(String(error));
          child.kill();
        }
      };
      child.stdout.on("data", (chunk: Buffer) => appendOutput(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => appendOutput(stderr, chunk));
      child.once("error", (error) => reject(new Error(`Failed to start UAC Broker: ${error.message}`)));
      child.once("close", (exitCode) => {
        if (outputError !== null) {
          reject(outputError);
          return;
        }
        if (exitCode !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(detail.length > 0
            ? `Failed to start UAC Broker: ${detail}`
            : "UAC Broker elevation was canceled or failed"));
          return;
        }
        try {
          resolve(UacBrokerService._parseBrokerProcessId(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private _listenForBroker(server: Server, pipeName: string, signal: AbortSignal): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(new Error(`Failed to create UAC Broker pipe: ${error.message}`));
      };
      const onAbort = (): void => {
        reject(new Error("UAC Broker startup canceled because the application is shutting down"));
      };
      server.once("error", onError);
      signal.addEventListener("abort", onAbort, { once: true });
      server.once("connection", (socket) => {
        server.removeListener("error", onError);
        signal.removeEventListener("abort", onAbort);
        resolve(socket);
      });
      server.listen({ path: `\\\\.\\pipe\\${pipeName}`, signal });
    });
  }

  private _resetConnection(peer: BridgePeer | null): void {
    if (this._peer !== peer) return;
    this._peer = null;
    this._connection = null;
    this._initializationPromise = null;
    this._fileOccupancyService = null;
  }

  private static _appendOutput(target: Buffer[], chunk: Buffer): void {
    const currentLength = target.reduce((length, item) => length + item.length, 0);
    if (currentLength + chunk.length > UacBrokerService._MAX_LAUNCH_OUTPUT_LENGTH) {
      throw new Error("UAC Broker launcher output is too large");
    }
    target.push(chunk);
  }

  private static _parseBrokerProcessId(output: string): number {
    const normalized = output.trim();
    if (!/^\d+$/.test(normalized)) throw new Error("UAC Broker launcher output is invalid");
    const processId = Number(normalized);
    if (!Number.isSafeInteger(processId) || processId <= 0 || processId > 0xffff_ffff) {
      throw new Error("UAC Broker process ID is invalid");
    }
    return processId;
  }

  private static _validateReadyInfo(value: unknown): asserts value is UacBrokerReadyInfo {
    if (value === null
      || typeof value !== "object"
      || !("processId" in value)
      || !("token" in value)
      || !Number.isSafeInteger(value.processId)
      || typeof value.processId !== "number"
      || value.processId <= 0
      || value.processId > 0xffff_ffff
      || typeof value.token !== "string"
      || !/^[a-f0-9]{32}$/.test(value.token)) {
      throw new Error("UAC Broker ready info is invalid");
    }
  }

  private static readonly _MAX_LAUNCH_OUTPUT_LENGTH = 4096;
  private _peer: BridgePeer | null = null;
  private _connection: UacBrokerConnection | null = null;
  private _initializationPromise: Promise<UacBrokerConnection> | null = null;
  private _initializationAbortController: AbortController | null = null;
  private _fileOccupancyService: FileOccupancyService | null = null;
}

export const gUacBrokerService = new UacBrokerService();
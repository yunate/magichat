import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import type { BackendLifecycleServerRpcApi } from "../../common/backend/backendRpcApi";
import type { ConfigServerRpcApi } from "../../common/config/configRpcApi";
import type { ThemeServerRpcApi } from "../../common/theme/themeRpcApi";
import { createMessagePortPeer } from "../../common/ipc_bridge/messagePortPeer";
import { BRIDGE_CONNECT_ACCEPT, type BackendBridgeConnectAccept } from "../../common/ipc_bridge/messagePortProtocol";
import type { BridgePeer } from "../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../common/ipc_bridge/rpc";
import { createBackendLifecycleServerRpcObject, createConfigServerRpcObject, createThemeServerRpcObject } from "./bridge/remote_rpc_objects/backend";
import { gApplicationPaths } from "./infra/applicationPaths";

export class BackendProcess {
  public async start(): Promise<void> {
    if (this._process !== null) throw new Error("Backend is already started");
    const child = utilityProcess.fork(gApplicationPaths.backendEntryPath, [], {
      serviceName: "MagicHat Backend",
      stdio: "inherit",
    });
    this._process = child;
    const { port1, port2 } = new MessageChannelMain();
    const connectId = randomUUID();
    const peer = createMessagePortPeer(port1, connectId);
    this._peer = peer;
    this._exit = new Promise((resolve) => {
      child.once("exit", (code) => {
        console.log(`[backend] Process exited with code ${code}.`);
        void peer.close();
        resolve(code);
      });
    });
    BridgeRouter.getRouter().startDispatchMessage(peer);
    child.postMessage({
      type: BRIDGE_CONNECT_ACCEPT,
      connectId,
      source: "main",
    } satisfies BackendBridgeConnectAccept, [port2]);
    this._lifecycle = createBackendLifecycleServerRpcObject(peer);
    const lifecycle = await this._lifecycle;
    const processId = await lifecycle.getProcessId();
    if (processId !== child.pid) throw new Error("Backend process identity does not match");
    await lifecycle.init(gApplicationPaths.getOptions());
    console.log(`[backend] Process ${processId} connected.`);
  }

  public isControlPeer(peer: BridgePeer): boolean {
    return this._peer === peer;
  }

  public getPeer(): BridgePeer {
    if (this._peer?.isConnected() !== true) throw new Error("Backend is not connected");
    return this._peer;
  }

  public getConfigServerRpcObject(): Promise<RemoteObject<ConfigServerRpcApi>> {
    this._config ??= createConfigServerRpcObject(this.getPeer());
    return this._config;
  }

  public getThemeServerRpcObject(): Promise<RemoteObject<ThemeServerRpcApi>> {
    this._theme ??= createThemeServerRpcObject(this.getPeer());
    return this._theme;
  }

  public async getRestartExecutablePath(): Promise<string> {
    if (this._lifecycle === null) throw new Error("Backend lifecycle is not initialized");
    return (await this._lifecycle).getRestartExecutablePath();
  }

  public createRendererPort(connectId: string): MessagePortMain {
    if (this._process === null || this._peer?.isConnected() !== true) {
      throw new Error("Backend is not connected");
    }
    const { port1, port2 } = new MessageChannelMain();
    this._process.postMessage({
      type: BRIDGE_CONNECT_ACCEPT,
      connectId,
      source: "renderer",
    } satisfies BackendBridgeConnectAccept, [port2]);
    return port1;
  }

  public async dispose(): Promise<void> {
    if (this._process === null) return;
    if (this._lifecycle === null || this._exit === null) {
      throw new Error("Backend lifecycle is not initialized");
    }
    await (await this._lifecycle).shutdown();
    const exitCode = await this._exit;
    if (exitCode !== 0) throw new Error(`Backend exited with code ${exitCode}`);
    await this._peer?.close();
    this._process = null;
    this._peer = null;
    this._lifecycle = null;
    this._exit = null;
    this._config = null;
    this._theme = null;
  }

  private _process: UtilityProcess | null = null;
  private _peer: BridgePeer | null = null;
  private _lifecycle: Promise<RemoteObject<BackendLifecycleServerRpcApi>> | null = null;
  private _exit: Promise<number> | null = null;
  private _config: Promise<RemoteObject<ConfigServerRpcApi>> | null = null;
  private _theme: Promise<RemoteObject<ThemeServerRpcApi>> | null = null;
}

export const gBackendProcess = new BackendProcess();
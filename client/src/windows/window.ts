import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { BackendServerRpcApi } from "../../../common/backend/backendRpcApi";
import { createMessagePortPeer } from "../../../common/ipc_bridge/messagePortPeer";
import {
  BRIDGE_CONNECT_ACCEPT,
  parseBridgeConnectAccept,
} from "../../../common/ipc_bridge/messagePortProtocol";
import type { ConfigServerRpcApi } from "../../../common/config/configRpcApi";
import type { CommandStorageServerRpcApi } from "../../../common/command";
import type { TasksServerRpcApi } from "../../../common/tasks/tasksRpcApi";
import type { TerminalRuntimeServiceApi } from "../../../common/terminal";
import type { ThemeServerRpcApi } from "../../../common/theme/themeRpcApi";
import type { UpdateServerRpcApi } from "../../../common/update/updateRpcApi";
import type { WindowServerRpcApi } from "../../../common/window/windowRpcApi";
import { BridgeRouter, type RemoteObject } from "../../../common/ipc_bridge/rpc";
import {
  createConfigServerRpcObject,
  createTasksServerRpcObject,
  getTerminalRuntimeService,
  createThemeServerRpcObject,
  createUpdateServerRpcObject,
  createWindowServerRpcObject,
} from "../bridge/remote_rpc_objects/remoteServerRpcObjects";
import { createCommandStorageServerRpcObject } from "../bridge/remote_rpc_objects/commandStorage";
import { createBackendServerRpcObject } from "../bridge/remote_rpc_objects/backend";
import { RpcObjectRegistry } from "../bridge/rpc_object_registry/registerRpcObjects";

export class Window {
  public async init(): Promise<BridgePeer> {
    const router = BridgeRouter.getRouter();
    RpcObjectRegistry.register(router);

    const { port, backendPort, connectId } = await this._waitForBridgePort();
    const instance = createMessagePortPeer(port, connectId);
    this._peer = instance;
    router.startDispatchMessage(instance);
    const backendPeer = createMessagePortPeer(backendPort, connectId);
    this._backendPeer = backendPeer;
    router.startDispatchMessage(backendPeer);
    this._backendServerRpcObject = createBackendServerRpcObject(backendPeer);
    await (await this._backendServerRpcObject).getProcessId();

    this._configServerRpcObject = createConfigServerRpcObject(backendPeer);
    this._commandStorageServerRpcObject = createCommandStorageServerRpcObject(backendPeer);
    this._tasksServerRpcObject = createTasksServerRpcObject(backendPeer);
    this._themeServerRpcObject = createThemeServerRpcObject(backendPeer);
    this._updateServerRpcObject = createUpdateServerRpcObject(backendPeer);
    this._windowServerRpcObject = createWindowServerRpcObject(instance);
    await (await this._windowServerRpcObject).rendererReady();
    return instance;
  }

  public getConfigServerRpcObject(): Promise<RemoteObject<ConfigServerRpcApi>> {
    if (!this._configServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._configServerRpcObject;
  }

  public getCommandStorageServerRpcObject(): Promise<RemoteObject<CommandStorageServerRpcApi>> {
    if (!this._commandStorageServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._commandStorageServerRpcObject;
  }

  public getTasksServerRpcObject(): Promise<RemoteObject<TasksServerRpcApi>> {
    if (!this._tasksServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._tasksServerRpcObject;
  }

  public getTerminalRuntimeService(): Promise<RemoteObject<TerminalRuntimeServiceApi>> {
    this._terminalRuntimeService ??= getTerminalRuntimeService(this.getBackendPeer());
    return this._terminalRuntimeService;
  }

  public getThemeServerRpcObject(): Promise<RemoteObject<ThemeServerRpcApi>> {
    if (!this._themeServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._themeServerRpcObject;
  }

  public getWindowServerRpcObject(): Promise<RemoteObject<WindowServerRpcApi>> {
    if (!this._windowServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._windowServerRpcObject;
  }

  public getUpdateServerRpcObject(): Promise<RemoteObject<UpdateServerRpcApi>> {
    if (!this._updateServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._updateServerRpcObject;
  }

  public getPeer(): BridgePeer {
    if (this._peer === null) throw new Error("Window bridge is not initialized");
    return this._peer;
  }

  public getBackendPeer(): BridgePeer {
    if (this._backendPeer === null) throw new Error("Backend bridge is not initialized");
    return this._backendPeer;
  }

  public getBackendServerRpcObject(): Promise<RemoteObject<BackendServerRpcApi>> {
    if (this._backendServerRpcObject === null) throw new Error("Backend bridge is not initialized");
    return this._backendServerRpcObject;
  }

  private _waitForBridgePort(): Promise<{
    readonly port: MessagePort;
    readonly backendPort: MessagePort;
    readonly connectId: string;
  }> {
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent<unknown>): void => {
        if (event.source !== window
          || event.data === null
          || typeof event.data !== "object"
          || !("type" in event.data)
          || event.data.type !== BRIDGE_CONNECT_ACCEPT) {
          return;
        }
        const accept = parseBridgeConnectAccept(event.data);
        const [port, backendPort] = event.ports;
        if (event.ports.length !== 2 || port === undefined || backendPort === undefined) return;
        window.removeEventListener("message", handleMessage);
        resolve({ port, backendPort, connectId: accept.connectId });
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private _configServerRpcObject: Promise<RemoteObject<ConfigServerRpcApi>> | null = null;
  private _commandStorageServerRpcObject: Promise<RemoteObject<CommandStorageServerRpcApi>> | null = null;
  private _tasksServerRpcObject: Promise<RemoteObject<TasksServerRpcApi>> | null = null;
  private _terminalRuntimeService: Promise<RemoteObject<TerminalRuntimeServiceApi>> | null = null;
  private _themeServerRpcObject: Promise<RemoteObject<ThemeServerRpcApi>> | null = null;
  private _updateServerRpcObject: Promise<RemoteObject<UpdateServerRpcApi>> | null = null;
  private _windowServerRpcObject: Promise<RemoteObject<WindowServerRpcApi>> | null = null;
  private _peer: BridgePeer | null = null;
  private _backendPeer: BridgePeer | null = null;
  private _backendServerRpcObject: Promise<RemoteObject<BackendServerRpcApi>> | null = null;
}
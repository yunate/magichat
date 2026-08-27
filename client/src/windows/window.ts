import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import { createMessagePortPeer } from "../../../common/ipc_bridge/messagePortPeer";
import {
  BRIDGE_CONNECT_ACCEPT,
  parseBridgeConnectAccept,
} from "../../../common/ipc_bridge/messagePortProtocol";
import type { ConfigServerRpcApi } from "../../../common/config/configRpcApi";
import type { TasksServerRpcApi } from "../../../common/tasks/tasksRpcApi";
import type { WindowServerRpcApi } from "../../../common/window/windowRpcApi";
import { BridgeRouter, type RemoteObject } from "../../../common/ipc_bridge/rpc";
import {
  createConfigServerRpcObject,
  createTasksServerRpcObject,
  createWindowServerRpcObject,
} from "../bridge/remote_rpc_objects/remoteServerRpcObjects";
import { RpcObjectRegistry } from "../bridge/rpc_object_registry/registerRpcObjects";

export class Window {
  public async init(): Promise<BridgePeer> {
    const router = BridgeRouter.getRouter();
    RpcObjectRegistry.register(router);

    const { port, connectId } = await this._waitForBridgePort();
    const instance = createMessagePortPeer(port, connectId);
    this._peer = instance;
    router.startDispatchMessage(instance);

    this._configServerRpcObject = createConfigServerRpcObject(instance);
    this._tasksServerRpcObject = createTasksServerRpcObject(instance);
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

  public getTasksServerRpcObject(): Promise<RemoteObject<TasksServerRpcApi>> {
    if (!this._tasksServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._tasksServerRpcObject;
  }

  public getWindowServerRpcObject(): Promise<RemoteObject<WindowServerRpcApi>> {
    if (!this._windowServerRpcObject) {
      throw new Error("Window bridge is not initialized");
    }
    return this._windowServerRpcObject;
  }

  public getPeer(): BridgePeer {
    if (this._peer === null) throw new Error("Window bridge is not initialized");
    return this._peer;
  }

  private _waitForBridgePort(): Promise<{ readonly port: MessagePort; readonly connectId: string }> {
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
        if (event.ports.length !== 1) return;
        window.removeEventListener("message", handleMessage);
        resolve({ port: event.ports[0], connectId: accept.connectId });
      };

      window.addEventListener("message", handleMessage);
    });
  }

  private _configServerRpcObject: Promise<RemoteObject<ConfigServerRpcApi>> | null = null;
  private _tasksServerRpcObject: Promise<RemoteObject<TasksServerRpcApi>> | null = null;
  private _windowServerRpcObject: Promise<RemoteObject<WindowServerRpcApi>> | null = null;
  private _peer: BridgePeer | null = null;
}
import {
  commandParamSerializer,
  type CommandEnvTarget,
  type CommandEnvUpdate,
  type CommandStorageServerRpcApi,
} from "../../../../common/command";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { CommandStorageRpcObject } from "./commandStorageRpcObject";
import { gTerminalRuntimeManager } from "../terminal/terminalRuntimeManager";

export class CommandService {
  public createRpcObject(peer: BridgePeer): CommandStorageServerRpcApi {
    const current = this._rpcObject;
    if (current !== null) {
      if (!current.isOwnedBy(peer)) throw new Error("Command storage object is already created");
      return current;
    }
    const rpcObject = new CommandStorageRpcObject(peer);
    this._rpcObject = rpcObject;
    this._peer = peer;
    peer.onDisconnect(() => {
      if (this._rpcObject === rpcObject) {
        this._rpcObject = null;
        this._peer = null;
      }
    });
    return rpcObject;
  }

  public async setEnv(
    updates: readonly CommandEnvUpdate[],
    targetPath: string | null,
    sourceCommandPath: string | null,
  ): Promise<void> {
    if (updates.length === 0) throw new Error("At least one environment variable is required");
    for (const update of updates) {
      commandParamSerializer.validate({ ...update, enabled: true });
    }
    const rpcObject = this._rpcObject;
    if (rpcObject === null) throw new Error("Command storage object is not initialized");
    const client = rpcObject.getCommandClientRpcApi();
    const target: CommandEnvTarget | null = targetPath === null
      ? null
      : { path: targetPath, sourceCommandPath };
    await client.setEnv(updates, target);
  }

  public async getEnv(
    key: string,
    targetPath: string | null,
    sourceCommandPath: string | null,
  ): Promise<string> {
    commandParamSerializer.validate({ key, value: "", enabled: true });
    const rpcObject = this._rpcObject;
    if (rpcObject === null) throw new Error("Command storage object is not initialized");
    const client = rpcObject.getCommandClientRpcApi();
    const target: CommandEnvTarget | null = targetPath === null
      ? null
      : { path: targetPath, sourceCommandPath };
    return client.getEnv(key, target);
  }

  public async prepare(
    terminalId: string,
    path: string,
    sourceCommandPath: string | null,
  ): Promise<string> {
    const runtime = gTerminalRuntimeManager.get(terminalId);
    if (runtime === null) throw new Error("Terminal runtime does not exist");
    const peer = this._peer;
    if (peer === null || !runtime.isOwnedBy(peer)) {
      throw new Error("Terminal runtime does not belong to the Command Client");
    }
    const rpcObject = this._rpcObject;
    if (rpcObject === null) throw new Error("Command storage object is not initialized");
    const request = await rpcObject.getCommandClientRpcApi().call(path, sourceCommandPath);
    return runtime.prepareRun(request);
  }

  private _peer: BridgePeer | null = null;
  private _rpcObject: CommandStorageRpcObject | null = null;
}

export const gCommandService = new CommandService();
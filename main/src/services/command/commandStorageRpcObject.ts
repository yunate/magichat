import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import type {
  CommandClientRpcApi,
  CommandStorageServerRpcApi,
} from "../../../../common/command";
import {
  COMMAND_CONFIG_KEY,
  DEFAULT_COMMAND_ROOT_PATH,
  type CommandRootConfig,
} from "../../../../common/config/command";
import { TreeViewPath, type TreeViewStorageRoot } from "../../../../common/treeView";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { gConfigManager } from "../../infra/configManager";
import { gPtyFactory } from "../terminal/ptyFactory";

export class CommandStorageRpcObject implements CommandStorageServerRpcApi {
  public constructor(peer: BridgePeer) {
    this._peer = peer;
  }

  public async init(client: RemoteObject<CommandClientRpcApi>): Promise<void> {
    if (this._client !== null) throw new Error("Command Client is already initialized");
    this._client = client;
  }

  public async dispose(): Promise<void> {
    const client = this._client;
    if (client === null) return;
    this._client = null;
    await BridgeRouter.destroyRemoteObj(client);
  }

  public getCommandClientRpcApi(): RemoteObject<CommandClientRpcApi> {
    const client = this._client;
    if (client === null) throw new Error("Command Client is not initialized");
    return client;
  }

  public isOwnedBy(peer: BridgePeer): boolean {
    return this._peer === peer;
  }

  public resolveRoots(roots: readonly CommandRootConfig[]): TreeViewStorageRoot[] {
    return roots.map((root) => ({
      key: root.key,
      path: root.path === DEFAULT_COMMAND_ROOT_PATH
        ? path.join(gApplicationPaths.dataDir, "command")
        : TreeViewPath.normalize(root.path, "Command storage root"),
    }));
  }

  public resolveTerminalInitialPath(initialPath: string): string {
    return gPtyFactory.resolveInitialPath(initialPath);
  }

  public revealStorage(rootPath: string): void {
    shell.showItemInFolder(this._validateStorageRoot(rootPath));
  }

  public deleteStorage(rootPath: string): void {
    const root = this._validateStorageRoot(rootPath);
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
  }

  private _validateStorageRoot(rootPath: string): string {
    const candidate = path.resolve(TreeViewPath.normalize(rootPath, "Command storage root"));
    const config = gConfigManager.get(COMMAND_CONFIG_KEY);
    const roots = this.resolveRoots(config.roots);
    if (!roots.some((root) => path.resolve(root.path) === candidate)) {
      throw new Error("Command storage root is not authorized");
    }
    return candidate;
  }

  private readonly _peer: BridgePeer;
  private _client: RemoteObject<CommandClientRpcApi> | null = null;
}
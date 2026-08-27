import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  type CommandTreeViewDataProvider,
} from "../../../../common/command";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { LocalTreeViewDataProvider } from "../treeView/localTreeViewDataProvider";

export class CommandTreeViewDataProviderObject
  extends LocalTreeViewDataProvider
  implements CommandTreeViewDataProvider {
  public constructor(peer: BridgePeer) {
    const storageRoot = path.join(gApplicationPaths.dataDir, "command");
    super(peer, {
      storageRoot,
      folderDataSerializer: commandFolderDataSerializer,
      itemDataSerializer: commandItemDataSerializer,
    });
    this._commandStorageRoot = storageRoot;
  }

  public revealStorage(): Promise<void> {
    return this._enqueue(() => {
      shell.showItemInFolder(this._commandStorageRoot);
    });
  }

  public deleteStorage(): Promise<void> {
    return this._enqueue(() => {
      fs.rmSync(this._commandStorageRoot, { recursive: true, force: true });
      fs.mkdirSync(this._commandStorageRoot, { recursive: true });
    });
  }

  private readonly _commandStorageRoot: string;
}
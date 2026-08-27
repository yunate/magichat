import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import type { ISerializer } from "../../../../common/serializer";
import {
  getTreeViewParentPath,
  ensureTreeViewNestedPath,
  ensureTreeViewPath,
  ensureTreeViewWorkspaceName,
  TreeViewFolderPropertiesSerializer,
  TreeViewFolderSerializer,
  TreeViewItemPropertiesSerializer,
  TreeViewItemSerializer,
  treeViewWorkspaceSerializer,
  type TreeViewCloneParams,
  type TreeViewCreateItemProperties,
  type TreeViewDataNotifierClientRpcApi,
  type TreeViewDataProvider,
  type TreeViewFolder,
  type TreeViewFolderProperties,
  type TreeViewItem,
  type TreeViewItemProperties,
  type TreeViewMoveParams,
  type TreeViewTab,
  type TreeViewWorkspace,
} from "../../../../common/treeView";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import { readStrictJsonFile, writeStrictJsonFileAtomic } from "../../infra/strictJsonFile";

export type LocalTreeViewDataProviderOptions = {
  storageRoot: string;
  folderDataSerializer: ISerializer<unknown>;
  itemDataSerializer: ISerializer<unknown>;
};

const WORKSPACE_FILE_NAME = "__workspace__.json";
const FOLDER_FILE_NAME = "__folder__.json";

export class LocalTreeViewDataProvider implements TreeViewDataProvider {
  public constructor(peer: BridgePeer, options: LocalTreeViewDataProviderOptions) {
    this._peer = peer;
    this._storageRoot = path.resolve(options.storageRoot);
    this._folderPropertiesSerializer = new TreeViewFolderPropertiesSerializer(
      options.folderDataSerializer,
    );
    this._itemPropertiesSerializer = new TreeViewItemPropertiesSerializer(
      options.itemDataSerializer,
    );
    this._itemSerializer = new TreeViewItemSerializer(this._itemPropertiesSerializer);
    this._folderSerializer = new TreeViewFolderSerializer(
      this._folderPropertiesSerializer,
      this._itemSerializer,
    );
    fs.mkdirSync(this._storageRoot, { recursive: true });
    this._ensurePlainDirectory(this._storageRoot);
  }

  public async init(notifierRegisterName: string): Promise<void> {
    return this._enqueue(async () => {
      if (this._notifier !== null) throw new Error("TreeView DataProvider is already initialized");
      this._notifier = await BridgeRouter.createRemoteObj<TreeViewDataNotifierClientRpcApi>(
        this._peer,
        notifierRegisterName,
      );
    });
  }

  public async dispose(): Promise<void> {
    return this._enqueue(async () => {
      const notifier = this._notifier;
      if (notifier === null) return;
      await BridgeRouter.destroyRemoteObj(notifier);
      this._notifier = null;
    });
  }

  public getWorkspaces(): Promise<string[]> {
    return this._enqueue(() => fs.readdirSync(this._storageRoot, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith("__") && entry.isDirectory())
        .map((entry) => {
          ensureTreeViewWorkspaceName(entry.name, "TreeView workspace name");
          this._ensurePlainDirectory(path.join(this._storageRoot, entry.name));
          return entry.name;
        })
        .filter((name) => fs.existsSync(path.join(this._storageRoot, name, WORKSPACE_FILE_NAME)))
        .sort((left, right) => left.localeCompare(right, "en-US")));
  }

  public getWorkspaceProperties(workspaceName: string): Promise<TreeViewWorkspace> {
    return this._enqueue(() => {
      const workspaceDirectory = this._resolveWorkspaceDirectory(workspaceName);
      this._ensureWorkspace(workspaceDirectory);
      return treeViewWorkspaceSerializer.fromValue(
        readStrictJsonFile(path.join(workspaceDirectory, WORKSPACE_FILE_NAME)),
      );
    });
  }

  public updateWorkspaceProperties(
    workspaceName: string,
    properties: TreeViewWorkspace,
  ): Promise<void> {
    return this._enqueue(() => {
      treeViewWorkspaceSerializer.validate(properties);
      const workspaceDirectory = this._resolveWorkspaceDirectory(workspaceName);
      this._ensureWorkspace(workspaceDirectory);
      writeStrictJsonFileAtomic(path.join(workspaceDirectory, WORKSPACE_FILE_NAME), properties);
      this._notifyChanged();
    });
  }

  public createWorkspace(workspaceName: string, isSelected: boolean): Promise<void> {
    return this._enqueue(() => {
      this._createWorkspace(workspaceName, isSelected);
      this._notifyChanged();
    });
  }

  public renameWorkspace(currentName: string, newName: string): Promise<void> {
    return this._enqueue(() => {
      const source = this._resolveWorkspaceDirectory(currentName);
      this._ensureWorkspace(source);
      ensureTreeViewWorkspaceName(newName, "TreeView workspace name");
      const target = this._resolveNewPath(newName);
      if (source !== target) this._ensureNameAvailable(this._storageRoot, newName, source);
      this._rename(source, target);
      this._notifyChanged();
    });
  }

  public deleteWorkspace(
    workspaceName: string,
    nextWorkspaceName: string | null,
  ): Promise<void> {
    return this._enqueue(() => {
      const workspaceDirectory = this._resolveWorkspaceDirectory(workspaceName);
      this._ensureWorkspace(workspaceDirectory);
      fs.rmSync(workspaceDirectory, { recursive: true });
      if (nextWorkspaceName !== null) {
        const nextDirectory = this._resolveWorkspaceDirectory(nextWorkspaceName);
        if (!fs.existsSync(nextDirectory)) {
          this._createWorkspace(nextWorkspaceName, true);
        } else {
          this._ensureWorkspace(nextDirectory);
          const metadataPath = path.join(nextDirectory, WORKSPACE_FILE_NAME);
          const workspace = treeViewWorkspaceSerializer.fromValue(
            readStrictJsonFile(metadataPath),
          );
          workspace.isSelected = true;
          writeStrictJsonFileAtomic(metadataPath, workspace);
        }
      }
      this._notifyChanged();
    });
  }

  public getFolder(folderPath: string): Promise<TreeViewFolder> {
    return this._enqueue(() => {
      const folderDirectory = this._resolveFolderDirectory(folderPath);
      this._ensureWorkspaceForPath(folderPath);
      const folder = this._readFolder(folderDirectory, folderPath);
      this._folderSerializer.validate(folder);
      return folder;
    });
  }

  public createFolder(folderPath: string): Promise<TreeViewFolder> {
    return this._enqueue(() => {
      ensureTreeViewNestedPath(folderPath, "TreeView folder path");
      const parentPath = getTreeViewParentPath(folderPath);
      if (parentPath === null) throw new Error("TreeView folder parent is missing");
      const parentDirectory = this._resolveFolderDirectory(parentPath);
      this._ensureFolder(parentDirectory);
      const name = this._pathName(folderPath);
      this._ensureNameAvailable(parentDirectory, name);
      const target = this._resolveNewPathFromParent(parentDirectory, name);
      const stage = this._stagePath(target);
      this._runStagedCreate(stage, target, () => {
        fs.mkdirSync(stage);
        writeStrictJsonFileAtomic(path.join(stage, FOLDER_FILE_NAME), this._createFolderProperties());
      });
      this._appendOrder(parentDirectory, "folder", name);
      this._notifyChanged();
      return this._readFolder(target, folderPath);
    });
  }

  public updateFolderProperties(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    return this._enqueue(() => {
      this._folderPropertiesSerializer.validate(properties);
      const folderDirectory = this._resolveFolderDirectory(folderPath);
      this._ensureFolder(folderDirectory);
      const metadataPath = path.join(folderDirectory, FOLDER_FILE_NAME);
      const current = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(metadataPath));
      if (current.id !== properties.id) throw new Error("TreeView folder id cannot change");
      this._validateOrder(folderDirectory, properties);
      writeStrictJsonFileAtomic(metadataPath, properties);
      this._notifyChanged();
    });
  }

  public deleteFolder(folderPath: string): Promise<void> {
    return this._enqueue(() => {
      ensureTreeViewNestedPath(folderPath, "TreeView folder path");
      const folderDirectory = this._resolveFolderDirectory(folderPath);
      this._ensureFolder(folderDirectory);
      const parentPath = getTreeViewParentPath(folderPath);
      if (parentPath === null) throw new Error("TreeView folder parent is missing");
      this._removeOrder(this._resolveFolderDirectory(parentPath), "folder", this._pathName(folderPath));
      fs.rmSync(folderDirectory, { recursive: true });
      this._notifyChanged();
    });
  }

  public getItem(itemPath: string): Promise<TreeViewItem> {
    return this._enqueue(() => {
      const itemFile = this._resolveItemFile(itemPath);
      this._ensurePlainFile(itemFile);
      return this._createItemView(itemPath, this._readItemProperties(itemFile));
    });
  }

  public createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    return this._enqueue(() => {
      ensureTreeViewNestedPath(itemPath, "TreeView item path");
      const parentPath = getTreeViewParentPath(itemPath);
      if (parentPath === null) throw new Error("TreeView item parent is missing");
      const parentDirectory = this._resolveFolderDirectory(parentPath);
      this._ensureFolder(parentDirectory);
      if (properties.isDraft && parentPath.includes("/")) {
        throw new Error("TreeView draft item must belong to a workspace root");
      }
      const persisted: TreeViewItemProperties = { ...properties, id: randomUUID() };
      this._itemPropertiesSerializer.validate(persisted);
      const name = this._pathName(itemPath);
      this._ensureNameAvailable(parentDirectory, name);
      const target = this._resolveNewPathFromParent(parentDirectory, `${name}.json`);
      const stage = this._stagePath(target);
      this._runStagedCreate(stage, target, () => writeStrictJsonFileAtomic(stage, persisted));
      if (!persisted.isDraft) this._appendOrder(parentDirectory, "item", name);
      this._notifyChanged();
      return this._createItemView(itemPath, persisted);
    });
  }

  public updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    return this._enqueue(() => {
      this._itemPropertiesSerializer.validate(properties);
      const itemFile = this._resolveItemFile(itemPath);
      this._ensurePlainFile(itemFile);
      const current = this._readItemProperties(itemFile);
      if (current.id !== properties.id) throw new Error("TreeView item id cannot change");
      const parentPath = getTreeViewParentPath(itemPath);
      if (properties.isDraft && parentPath?.includes("/")) {
        throw new Error("TreeView draft item must belong to a workspace root");
      }
      writeStrictJsonFileAtomic(itemFile, properties);
      if (parentPath === null) throw new Error("TreeView item parent is missing");
      const parentDirectory = this._resolveFolderDirectory(parentPath);
      const itemName = this._pathName(itemPath);
      if (properties.isDraft) {
        this._removeOrder(parentDirectory, "item", itemName);
      } else {
        this._appendOrder(parentDirectory, "item", itemName);
      }
      this._notifyChanged();
    });
  }

  public deleteItem(itemPath: string): Promise<void> {
    return this._enqueue(() => {
      const itemFile = this._resolveItemFile(itemPath);
      this._ensurePlainFile(itemFile);
      const item = this._readItemProperties(itemFile);
      const parentPath = getTreeViewParentPath(itemPath);
      if (parentPath === null) throw new Error("TreeView item parent is missing");
      if (!item.isDraft) {
        this._removeOrder(this._resolveFolderDirectory(parentPath), "item", this._pathName(itemPath));
      }
      fs.rmSync(itemFile);
      this._notifyChanged();
    });
  }

  public openInExplorer(kind: "folder" | "item", logicalPath: string): Promise<void> {
    return this._enqueue(() => {
      if (kind === "folder") {
        const folderDirectory = this._resolveFolderDirectory(logicalPath);
        this._ensureFolder(folderDirectory);
        shell.showItemInFolder(folderDirectory);
        return;
      }
      if (kind === "item") {
        const itemFile = this._resolveItemFile(logicalPath);
        this._ensurePlainFile(itemFile);
        shell.showItemInFolder(itemFile);
        return;
      }
      throw new Error("TreeView Explorer target kind is invalid");
    });
  }

  public clone(params: TreeViewCloneParams): Promise<void> {
    return this._enqueue(() => {
      if (params.kind === "workspace") {
        ensureTreeViewWorkspaceName(params.targetPath, "TreeView workspace clone target");
        const source = this._resolveWorkspaceDirectory(params.sourcePath);
        this._ensureWorkspace(source);
        const target = this._resolveNewPath(params.targetPath);
        this._ensureNameAvailable(this._storageRoot, params.targetPath);
        this._cloneDirectory(source, target, true);
      } else if (params.kind === "folder") {
        const source = this._resolveFolderDirectory(params.sourcePath);
        this._ensureFolder(source);
        const parentPath = getTreeViewParentPath(params.targetPath);
        if (parentPath === null) throw new Error("TreeView clone target parent is missing");
        const parent = this._resolveFolderDirectory(parentPath);
        this._ensureFolder(parent);
        this._ensureNameAvailable(parent, this._pathName(params.targetPath));
        this._cloneDirectory(source, this._resolveFolderDirectory(params.targetPath), false);
        this._appendOrder(parent, "folder", this._pathName(params.targetPath));
      } else {
        const source = this._resolveItemFile(params.sourcePath);
        this._ensurePlainFile(source);
        const target = this._resolveItemFile(params.targetPath);
        this._ensureNameAvailable(path.dirname(target), this._pathName(params.targetPath));
        const properties = this._readItemProperties(source);
        const stage = this._stagePath(target);
        this._runStagedCreate(stage, target, () => writeStrictJsonFileAtomic(
          stage,
          { ...properties, id: randomUUID() },
        ));
        if (!properties.isDraft) {
          this._appendOrder(path.dirname(target), "item", this._pathName(params.targetPath));
        }
      }
      this._notifyChanged();
    });
  }

  public move(params: TreeViewMoveParams): Promise<void> {
    return this._enqueue(() => {
      if (!Number.isInteger(params.targetOrder) || params.targetOrder < 0) {
        throw new Error("TreeView target order must be a nonnegative integer");
      }
      if (params.kind === "folder") {
        const source = this._resolveFolderDirectory(params.sourcePath);
        this._ensureFolder(source);
        const target = this._resolveFolderDirectory(params.targetPath);
        const sourceParent = path.dirname(source);
        const targetParent = path.dirname(target);
        const sourceName = path.basename(source);
        const targetName = path.basename(target);
        const insertionOrder = this._resolveInsertionOrder(
          sourceParent,
          targetParent,
          "folder",
          sourceName,
          params.targetOrder,
        );
        if (params.sourcePath === params.targetPath) {
          this._reorder(sourceParent, "folder", sourceName, insertionOrder);
          this._notifyChanged();
          return;
        }
        if (this._isContainedBy(source, target)) {
          throw new Error("TreeView folder cannot move into its own subtree");
        }
        this._ensureFolder(targetParent);
        this._ensureNameAvailable(targetParent, targetName, source);
        this._removeOrder(sourceParent, "folder", sourceName);
        this._rename(source, target);
        this._insertOrder(targetParent, "folder", targetName, insertionOrder);
      } else {
        const source = this._resolveItemFile(params.sourcePath);
        this._ensurePlainFile(source);
        const item = this._readItemProperties(source);
        const target = this._resolveItemFile(params.targetPath);
        const sourceParent = path.dirname(source);
        const targetParent = path.dirname(target);
        const sourceName = this._pathName(params.sourcePath);
        const targetName = this._pathName(params.targetPath);
        const insertionOrder = this._resolveInsertionOrder(
          sourceParent,
          targetParent,
          "item",
          sourceName,
          params.targetOrder,
        );
        if (params.sourcePath === params.targetPath) {
          if (!item.isDraft) this._reorder(sourceParent, "item", sourceName, insertionOrder);
          this._notifyChanged();
          return;
        }
        this._ensureFolder(targetParent);
        this._ensureNameAvailable(targetParent, targetName, source);
        if (!item.isDraft) this._removeOrder(sourceParent, "item", sourceName);
        this._rename(source, target);
        if (!item.isDraft) this._insertOrder(targetParent, "item", targetName, insertionOrder);
      }
      this._notifyChanged();
    });
  }

  private _readFolder(directory: string, logicalPath: string): TreeViewFolder {
    this._ensureFolder(directory);
    const properties = this._folderPropertiesSerializer.fromValue(
      readStrictJsonFile(path.join(directory, FOLDER_FILE_NAME)),
    );
    const childFolders: TreeViewFolder[] = [];
    const childItems: TreeViewItem[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === FOLDER_FILE_NAME || entry.name === WORKSPACE_FILE_NAME
        || entry.name.startsWith("__")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("TreeView storage cannot contain links");
      if (entry.isDirectory()) {
        childFolders.push(this._readFolder(entryPath, `${logicalPath}/${entry.name}`));
      } else if (entry.isFile() && path.extname(entry.name) === ".json") {
        const name = path.basename(entry.name, ".json");
        childItems.push(this._createItemView(
          `${logicalPath}/${name}`,
          this._readItemProperties(entryPath),
        ));
      } else {
        throw new Error("TreeView folder contains an invalid entry");
      }
    }
    const folders = this._sortByOrder(childFolders, properties.folderOrder);
    const items = this._sortByOrder(childItems, properties.itemOrder);
    this._ensureUniqueChildNames(folders, items);
    return { path: logicalPath, name: this._pathName(logicalPath), properties, folders, items };
  }

  private _readItemProperties(filePath: string): TreeViewItemProperties {
    return this._itemPropertiesSerializer.fromValue(readStrictJsonFile(filePath));
  }

  private _createItemView(pathValue: string, properties: TreeViewItemProperties): TreeViewItem {
    return { path: pathValue, name: this._pathName(pathValue), properties };
  }

  private _createFolderProperties(): TreeViewFolderProperties {
    const properties = this._folderPropertiesSerializer.getDefault();
    properties.id = randomUUID();
    properties.isExpanded = true;
    this._folderPropertiesSerializer.validate(properties);
    return properties;
  }

  private _createWorkspace(workspaceName: string, isSelected: boolean): void {
    ensureTreeViewWorkspaceName(workspaceName, "TreeView workspace name");
    const target = this._resolveNewPath(workspaceName);
    this._ensureNameAvailable(this._storageRoot, workspaceName);
    const stage = this._stagePath(target);
    this._runStagedCreate(stage, target, () => {
      fs.mkdirSync(stage);
      writeStrictJsonFileAtomic(
        path.join(stage, FOLDER_FILE_NAME),
        this._createFolderProperties(),
      );
      const workspace = treeViewWorkspaceSerializer.getDefault();
      workspace.isSelected = isSelected;
      writeStrictJsonFileAtomic(path.join(stage, WORKSPACE_FILE_NAME), workspace);
    });
  }

  private _cloneDirectory(source: string, target: string, isWorkspace: boolean): void {
    const stage = this._stagePath(target);
    this._runStagedCreate(stage, target, () => {
      fs.cpSync(source, stage, { recursive: true });
      const idMap = this._rewriteIds(stage);
      if (isWorkspace) {
        const workspacePath = path.join(stage, WORKSPACE_FILE_NAME);
        const properties = treeViewWorkspaceSerializer.fromValue(readStrictJsonFile(workspacePath));
        properties.isSelected = false;
        properties.tabs = properties.tabs.flatMap((tab): TreeViewTab[] => {
          const id = idMap.get(tab.id);
          return id === undefined ? [] : [{ ...tab, id }];
        });
        properties.activeTabId = properties.activeTabId === null
          ? null
          : idMap.get(properties.activeTabId) ?? properties.tabs[0]?.id ?? null;
        writeStrictJsonFileAtomic(workspacePath, properties);
      }
    });
  }

  private _rewriteIds(directory: string): Map<string, string> {
    const idMap = new Map<string, string>();
    const folderMetadataPath = path.join(directory, FOLDER_FILE_NAME);
    const folder = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(folderMetadataPath));
    const folderId = randomUUID();
    idMap.set(folder.id, folderId);
    writeStrictJsonFileAtomic(folderMetadataPath, { ...folder, id: folderId });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("__")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        for (const [sourceId, targetId] of this._rewriteIds(entryPath)) {
          idMap.set(sourceId, targetId);
        }
      }
      else if (entry.isFile() && path.extname(entry.name) === ".json") {
        const item = this._readItemProperties(entryPath);
        const itemId = randomUUID();
        idMap.set(item.id, itemId);
        writeStrictJsonFileAtomic(entryPath, { ...item, id: itemId });
      }
    }
    return idMap;
  }

  private _validateOrder(directory: string, properties: TreeViewFolderProperties): void {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const folderNames = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    const itemNames = new Set(entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === ".json"
        && !entry.name.startsWith("__"))
      .map((entry) => path.basename(entry.name, ".json")));
    if (properties.folderOrder.some((name) => !folderNames.has(name))) {
      throw new Error("TreeView folderOrder references a missing folder");
    }
    if (properties.itemOrder.some((name) => !itemNames.has(name))) {
      throw new Error("TreeView itemOrder references a missing item");
    }
  }

  private _appendOrder(directory: string, kind: "folder" | "item", name: string): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(metadataPath));
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    if (!properties[key].includes(name)) properties[key].push(name);
    this._folderPropertiesSerializer.validate(properties);
    writeStrictJsonFileAtomic(metadataPath, properties);
  }

  private _removeOrder(directory: string, kind: "folder" | "item", name: string): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(metadataPath));
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    properties[key] = properties[key].filter((entry) => entry !== name);
    this._folderPropertiesSerializer.validate(properties);
    writeStrictJsonFileAtomic(metadataPath, properties);
  }

  private _insertOrder(
    directory: string,
    kind: "folder" | "item",
    name: string,
    targetOrder: number,
  ): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(metadataPath));
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    properties[key].splice(Math.min(targetOrder, properties[key].length), 0, name);
    this._folderPropertiesSerializer.validate(properties);
    writeStrictJsonFileAtomic(metadataPath, properties);
  }

  private _reorder(
    directory: string,
    kind: "folder" | "item",
    name: string,
    targetOrder: number,
  ): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._folderPropertiesSerializer.fromValue(readStrictJsonFile(metadataPath));
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    const sourceOrder = properties[key].indexOf(name);
    if (sourceOrder < 0) throw new Error("TreeView move source is missing from parent order");
    properties[key].splice(sourceOrder, 1);
    properties[key].splice(Math.min(targetOrder, properties[key].length), 0, name);
    this._folderPropertiesSerializer.validate(properties);
    writeStrictJsonFileAtomic(metadataPath, properties);
  }

  private _resolveInsertionOrder(
    sourceParent: string,
    targetParent: string,
    kind: "folder" | "item",
    sourceName: string,
    targetOrder: number,
  ): number {
    if (sourceParent !== targetParent) return targetOrder;
    const properties = this._folderPropertiesSerializer.fromValue(
      readStrictJsonFile(path.join(sourceParent, FOLDER_FILE_NAME)),
    );
    const order = kind === "folder" ? properties.folderOrder : properties.itemOrder;
    const sourceOrder = order.indexOf(sourceName);
    return sourceOrder >= 0 && sourceOrder < targetOrder ? targetOrder - 1 : targetOrder;
  }

  private _sortByOrder<T extends { name: string }>(items: readonly T[], order: readonly string[]): T[] {
    const indexes = new Map(order.map((name, index) => [name, index]));
    return [...items].sort((left, right) => {
      const leftIndex = indexes.get(left.name);
      const rightIndex = indexes.get(right.name);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return left.name.localeCompare(right.name, "en-US");
    });
  }

  private _ensureUniqueChildNames(folders: readonly TreeViewFolder[], items: readonly TreeViewItem[]): void {
    const names = [...folders.map((folder) => folder.name), ...items.map((item) => item.name)]
      .map((name) => name.toLocaleLowerCase("en-US"));
    if (new Set(names).size !== names.length) throw new Error("TreeView child names must be unique");
  }

  private _resolveWorkspaceDirectory(workspaceName: string): string {
    ensureTreeViewWorkspaceName(workspaceName, "TreeView workspace name");
    return this._resolveContained(workspaceName);
  }

  private _resolveFolderDirectory(folderPath: string): string {
    ensureTreeViewPath(folderPath, "TreeView folder path");
    return this._resolveContained(folderPath);
  }

  private _resolveItemFile(itemPath: string): string {
    ensureTreeViewNestedPath(itemPath, "TreeView item path");
    return this._resolveContained(`${itemPath}.json`);
  }

  private _resolveNewPath(relativePath: string): string {
    return this._resolveContained(relativePath);
  }

  private _resolveNewPathFromParent(parent: string, name: string): string {
    const candidate = path.resolve(parent, name);
    this._ensureContained(candidate);
    return candidate;
  }

  private _resolveContained(relativePath: string): string {
    const candidate = path.resolve(this._storageRoot, ...relativePath.split("/"));
    this._ensureContained(candidate);
    return candidate;
  }

  private _ensureContained(candidate: string): void {
    const relative = path.relative(this._storageRoot, path.resolve(candidate));
    if (relative === "" || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".." && !path.isAbsolute(relative))) return;
    throw new Error("TreeView path escapes the storage root");
  }

  private _ensurePlainDirectory(directory: string): void {
    this._ensureContained(directory);
    const stats = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!stats?.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("TreeView directory is missing or invalid");
    }
    this._ensureContained(fs.realpathSync(directory));
  }

  private _ensurePlainFile(filePath: string): void {
    this._ensureContained(filePath);
    const stats = fs.lstatSync(filePath, { throwIfNoEntry: false });
    if (!stats?.isFile() || stats.isSymbolicLink()) {
      throw new Error("TreeView file is missing or invalid");
    }
    this._ensureContained(fs.realpathSync(filePath));
  }

  private _ensureWorkspace(directory: string): void {
    this._ensureFolder(directory);
    this._ensurePlainFile(path.join(directory, WORKSPACE_FILE_NAME));
  }

  private _ensureFolder(directory: string): void {
    this._ensurePlainDirectory(directory);
    this._ensurePlainFile(path.join(directory, FOLDER_FILE_NAME));
  }

  private _ensureWorkspaceForPath(logicalPath: string): void {
    const workspaceName = logicalPath.split("/")[0];
    if (!workspaceName) throw new Error("TreeView workspace path is invalid");
    this._ensureWorkspace(this._resolveWorkspaceDirectory(workspaceName));
  }

  private _ensureNameAvailable(parent: string, name: string, allowedSource?: string): void {
    const normalizedFolder = name.toLocaleLowerCase("en-US");
    const normalizedFile = `${name}.json`.toLocaleLowerCase("en-US");
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      const normalizedEntry = entry.name.toLocaleLowerCase("en-US");
      if (normalizedEntry !== normalizedFolder && normalizedEntry !== normalizedFile) continue;
      const entryPath = path.join(parent, entry.name);
      if (allowedSource && path.resolve(entryPath) === path.resolve(allowedSource)) continue;
      throw new Error("TreeView target already exists");
    }
  }

  private _stagePath(target: string): string {
    const stage = path.join(path.dirname(target), `__${path.basename(target)}`);
    this._ensureContained(stage);
    return stage;
  }

  private _runStagedCreate(stage: string, target: string, operation: () => void): void {
    if (fs.existsSync(stage) || fs.existsSync(target)) throw new Error("TreeView target already exists");
    try {
      operation();
      fs.renameSync(stage, target);
    } catch (error: unknown) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  private _rename(source: string, target: string): void {
    if (source === target) return;
    const isCaseOnly = source.toLocaleLowerCase("en-US") === target.toLocaleLowerCase("en-US");
    if (!isCaseOnly) {
      fs.renameSync(source, target);
      return;
    }
    const temporary = path.join(path.dirname(source), `__rename-${randomUUID()}`);
    fs.renameSync(source, temporary);
    fs.renameSync(temporary, target);
  }

  private _isContainedBy(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".." && !path.isAbsolute(relative));
  }

  private _pathName(logicalPath: string): string {
    return logicalPath.slice(logicalPath.lastIndexOf("/") + 1);
  }

  protected _enqueue<TResult>(operation: () => Promise<TResult> | TResult): Promise<TResult> {
    const result = this._queue.then(operation, operation);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private _notifyChanged(): void {
    if (this._notifier === null) throw new Error("TreeView DataProvider is not initialized");
    void this._notifier.storageChanged().catch((error: unknown) => {
      console.error("TreeView change notification failed:", error);
    });
  }

  private readonly _peer: BridgePeer;
  private readonly _storageRoot: string;
  private readonly _folderPropertiesSerializer: TreeViewFolderPropertiesSerializer;
  private readonly _itemPropertiesSerializer: TreeViewItemPropertiesSerializer;
  private readonly _itemSerializer: TreeViewItemSerializer;
  private readonly _folderSerializer: TreeViewFolderSerializer;
  private _queue: Promise<void> = Promise.resolve();
  private _notifier: RemoteObject<TreeViewDataNotifierClientRpcApi> | null = null;
}
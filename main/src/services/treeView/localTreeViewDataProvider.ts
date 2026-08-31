import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import type { ISerializer } from "../../../../common/serializer";
import { ValidateUtils } from "../../../../common/validator";
import {
  TreeViewPath,
  TREE_VIEW_ITEM_FILE_EXTENSION,
  TreeViewFolderPropertiesSerializer,
  TreeViewFolderSerializer,
  TreeViewItemPropertiesSerializer,
  TreeViewItemSerializer,
  treeViewWorkspaceSerializer,
  type TreeViewCloneParams,
  type TreeViewCreateItemProperties,
  type TreeViewDataNotifierClientRpcApi,
  type TreeViewDataProvider,
  type TreeViewEntityDataParams,
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
import { PathUtil } from "../../utils/pathUtil";

const WORKSPACE_FILE_NAME = "__workspace__.mh";
const FOLDER_FILE_NAME = "__folder__.mh";

export class LocalTreeViewDataProvider implements TreeViewDataProvider {
  public constructor(peer: BridgePeer) {
    this._peer = peer;
    this._folderPropertiesSerializer = new TreeViewFolderPropertiesSerializer();
    this._itemPropertiesSerializer = new TreeViewItemPropertiesSerializer();
    this._itemSerializer = new TreeViewItemSerializer(this._itemPropertiesSerializer);
    this._folderSerializer = new TreeViewFolderSerializer(
      this._folderPropertiesSerializer,
      this._itemSerializer,
    );
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

  public getWorkspaces(rootPath: string): Promise<string[]> {
    return this._enqueue(async () => {
      const root = TreeViewPath.normalize(rootPath, "TreeView storage root");
      if (!fs.existsSync(root)) return [];
      const workspacePaths: string[] = [];
      const warnings: string[] = [];
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.name.startsWith("__") || !entry.isDirectory()) continue;
        const workspacePath = path.join(root, entry.name);
        const workspaceFilePath = path.join(workspacePath, WORKSPACE_FILE_NAME);
        if (!fs.existsSync(workspaceFilePath)) continue;
        try {
          this._readWorkspaceProperties(workspaceFilePath);
          this._readFolderProperties(path.join(workspacePath, FOLDER_FILE_NAME));
          this._deleteOrphanDrafts(workspacePath);
          workspacePaths.push(TreeViewPath.normalize(workspacePath, "TreeView storage path"));
        } catch {
          warnings.push(
            `Skipped invalid TreeView workspace "${workspacePath}": metadata could not be read.`,
          );
        }
      }
      await this._notifyStorageWarnings(warnings);
      return workspacePaths.sort((left, right) => left.localeCompare(right, "en-US"));
    });
  }

  public getWorkspaceProperties(workspacePath: string): Promise<TreeViewWorkspace> {
    return this._enqueue(() => {
      const workspaceDirectory = TreeViewPath.normalize(
        workspacePath,
        "TreeView workspace path",
      );
      PathUtil.ensureFileExist(path.join(workspaceDirectory, FOLDER_FILE_NAME));
      const workspaceFilePath = path.join(workspaceDirectory, WORKSPACE_FILE_NAME);
      return this._readWorkspaceProperties(workspaceFilePath, true);
    });
  }

  public updateWorkspaceProperties(
    workspacePath: string,
    properties: TreeViewWorkspace,
  ): Promise<void> {
    return this._enqueue(() => {
      treeViewWorkspaceSerializer.validate(properties);
      const workspaceDirectory = TreeViewPath.normalize(
        workspacePath,
        "TreeView workspace path",
      );
      PathUtil.ensureFileExist(path.join(workspaceDirectory, FOLDER_FILE_NAME));
      this._writeWorkspaceProperties(
        path.join(workspaceDirectory, WORKSPACE_FILE_NAME),
        properties,
      );
    });
  }

  public createWorkspace(
    rootPath: string,
    workspaceName: string,
    isSelected: boolean,
  ): Promise<string> {
    return this._enqueue(() => {
      const root = TreeViewPath.normalize(rootPath, "TreeView storage root");
      TreeViewPath.ensureName(workspaceName, "TreeView workspace name");
      const target = path.join(root, workspaceName);
      PathUtil.ensurePathNotExist(target);
      this._runStagedCreate(target, (stage) => {
        fs.mkdirSync(stage, { recursive: true });
        writeStrictJsonFileAtomic(
          path.join(stage, FOLDER_FILE_NAME),
          { ...this._createFolderProperties(), data: null },
        );
        const workspace = treeViewWorkspaceSerializer.getDefault();
        workspace.isSelected = isSelected;
        writeStrictJsonFileAtomic(path.join(stage, WORKSPACE_FILE_NAME), {
          ...workspace,
          data: null,
        });
      });
      return TreeViewPath.normalize(target, "TreeView storage path");
    });
  }

  public renameWorkspace(workspacePath: string, newName: string): Promise<string> {
    return this._enqueue(() => {
      const source = TreeViewPath.normalize(workspacePath, "TreeView workspace path");
      PathUtil.ensureFileExist(path.join(source, FOLDER_FILE_NAME));
      TreeViewPath.ensureName(newName, "TreeView workspace name");
      const target = path.join(path.dirname(source), newName);
      this._ensureRenameTargetAvailable(source, target);
      this._rename(source, target);
      return TreeViewPath.normalize(target, "TreeView storage path");
    });
  }

  public deleteWorkspace(workspacePath: string): Promise<void> {
    return this.deleteFolder(workspacePath);
  }

  public getFolder(folderPath: string): Promise<TreeViewFolder> {
    return this._enqueue(async () => {
      const folderDirectory = TreeViewPath.normalize(folderPath, "TreeView folder path");
      const warnings: string[] = [];
      const folder = this._readFolder(folderDirectory, warnings);
      this._folderSerializer.validate(folder);
      await this._notifyStorageWarnings(warnings);
      return folder;
    });
  }

  public getFolderProperties(folderPath: string): Promise<TreeViewFolderProperties> {
    return this._enqueue(() => {
      const folderDirectory = TreeViewPath.normalize(folderPath, "TreeView folder path");
      PathUtil.ensureFolderExist(folderDirectory);
      return this._readFolderProperties(path.join(folderDirectory, FOLDER_FILE_NAME));
    });
  }

  public createFolder(folderPath: string): Promise<string> {
    return this._enqueue(() => {
      const target = TreeViewPath.normalize(folderPath, "TreeView folder path");
      TreeViewPath.ensureName(path.basename(target), "TreeView folder name");
      PathUtil.ensurePathNotExist(target);
      const parent = path.dirname(target);
      this._ensureOrderMetadataWritable(parent);
      const properties = this._createFolderProperties();
      this._runStagedCreate(target, (stage) => {
        fs.mkdirSync(stage);
        writeStrictJsonFileAtomic(
          path.join(stage, FOLDER_FILE_NAME),
          { ...properties, data: null },
        );
      });
      this._appendOrder(parent, "folder", path.basename(target));
      return properties.id;
    });
  }

  public updateFolderProperties(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    return this._enqueue(async () => {
      this._folderPropertiesSerializer.validate(properties);
      const folderDirectory = TreeViewPath.normalize(folderPath, "TreeView folder path");
      PathUtil.ensureFolderExist(folderDirectory);
      const metadataPath = path.join(folderDirectory, FOLDER_FILE_NAME);
      const current = this._readFolderProperties(metadataPath);
      if (current.id !== properties.id) throw new Error("TreeView folder id cannot change");
      const warnings: string[] = [];
      const order = this._reconcileOrder(folderDirectory, current, warnings);
      const persisted: TreeViewFolderProperties = {
        ...properties,
        folderOrder: order.folderOrder,
        itemOrder: order.itemOrder,
      };
      this._folderPropertiesSerializer.validate(persisted);
      this._writeFolderProperties(metadataPath, persisted);
      await this._notifyStorageWarnings(warnings);
    });
  }

  public deleteFolder(folderPath: string): Promise<void> {
    return this._enqueue(() => {
      const folderDirectory = TreeViewPath.normalize(folderPath, "TreeView folder path");
      PathUtil.ensureFolderExist(folderDirectory);
      const workspaceDirectory = this._findWorkspaceDirectory(folderDirectory);
      if (PathUtil.resolve(folderDirectory) !== workspaceDirectory) {
        const parent = path.dirname(folderDirectory);
        this._ensureOrderMetadataWritable(parent);
        this._removeOrder(parent, "folder", path.basename(folderDirectory));
      }
      fs.rmSync(folderDirectory, { recursive: true });
    });
  }

  public getItem(itemPath: string): Promise<TreeViewItem> {
    return this._enqueue(() => {
      const itemFile = this._resolveItemFile(itemPath);
      PathUtil.ensureFileExist(itemFile);
      return this._createItemView(itemFile, this._readItemProperties(itemFile));
    });
  }

  public createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    return this._enqueue(() => {
      const target = this._resolveItemFile(itemPath);
      PathUtil.ensurePathNotExist(target);

      // draft items must belong to a workspace root
      if (properties.isDraft) {
        const workspaceFile = path.join(path.dirname(target), WORKSPACE_FILE_NAME);
        PathUtil.ensureFileExist(workspaceFile);
      }
      const persisted: TreeViewItemProperties = { ...properties, id: randomUUID() };
      this._itemPropertiesSerializer.validate(persisted);
      const name = path.basename(target, TREE_VIEW_ITEM_FILE_EXTENSION);
      TreeViewPath.ensureName(name, "TreeView item name");
      this._runStagedCreate(target, (stage) => writeStrictJsonFileAtomic(
        stage,
        { ...persisted, data: null },
      ));
      if (!persisted.isDraft) this._appendOrder(path.dirname(target), "item", name);
      return this._createItemView(target, persisted);
    });
  }

  public updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    return this._enqueue(() => {
      this._itemPropertiesSerializer.validate(properties);
      const itemFile = this._resolveItemFile(itemPath);
      PathUtil.ensureFileExist(itemFile);
      const current = this._readItemProperties(itemFile);
      if (current.id !== properties.id) throw new Error("TreeView item id cannot change");

      // draft items must belong to a workspace root
      if (properties.isDraft) {
        const workspaceFile = path.join(path.dirname(itemFile), WORKSPACE_FILE_NAME);
        PathUtil.ensureFileExist(workspaceFile);
      }

      this._writeItemProperties(itemFile, properties);
      const itemName = path.basename(itemFile, TREE_VIEW_ITEM_FILE_EXTENSION);
      if (properties.isDraft) {
        this._removeOrder(path.dirname(itemFile), "item", itemName);
      } else {
        this._appendOrder(path.dirname(itemFile), "item", itemName);
      }
    });
  }

  public repairEntityId(params: TreeViewEntityDataParams, id: string): Promise<void> {
    return this._enqueue(async () => {
      try {
        if (params.kind === "folder") {
          const folderDirectory = TreeViewPath.normalize(params.path, "TreeView folder path");
          const metadataPath = path.join(folderDirectory, FOLDER_FILE_NAME);
          const properties = { ...this._readFolderProperties(metadataPath), id };
          this._folderPropertiesSerializer.validate(properties);
          this._writeFolderProperties(metadataPath, properties);
        } else {
          const itemFile = this._resolveItemFile(params.path);
          const properties = { ...this._readItemProperties(itemFile), id };
          this._itemPropertiesSerializer.validate(properties);
          this._writeItemProperties(itemFile, properties);
        }
      } catch {
        await this._notifyStorageWarnings([
          `Could not repair duplicate TreeView ${params.kind} id at "${params.path}".`,
        ]);
      }
    });
  }

  public deleteItem(itemPath: string): Promise<void> {
    return this._enqueue(() => {
      const itemFile = this._resolveItemFile(itemPath);
      PathUtil.ensureFileExist(itemFile);
      this._removeOrder(
        path.dirname(itemFile),
        "item",
        path.basename(itemFile, TREE_VIEW_ITEM_FILE_EXTENSION),
      );
      fs.rmSync(itemFile);
    });
  }

  public getEntityData(params: TreeViewEntityDataParams): Promise<string | null> {
    return this._enqueue(() => {
      const filePath = this._resolveEntityFile(params);
      const data = this._readPersistedRecord(filePath).data;
      if (data === null) return null;
      const json = JSON.stringify(data);
      if (json === undefined) throw new Error(`TreeView entity data is missing: ${filePath}`);
      return json;
    });
  }

  public updateEntityData(params: TreeViewEntityDataParams, dataJson: string): Promise<void> {
    return this._enqueue(() => {
      const filePath = this._resolveEntityFile(params);
      const persisted = this._readPersistedRecord(filePath);
      writeStrictJsonFileAtomic(filePath, {
        ...persisted,
        data: this._parseDataJson(dataJson),
      });
    });
  }

  public openInExplorer(kind: "folder" | "item", targetPath: string): Promise<void> {
    return this._enqueue(() => {
      if (kind === "folder") {
        const folderDirectory = TreeViewPath.normalize(targetPath, "TreeView folder path");
        PathUtil.ensureFolderExist(folderDirectory);
        shell.showItemInFolder(folderDirectory);
        return;
      }
      if (kind === "item") {
        const itemFile = this._resolveItemFile(targetPath);
        PathUtil.ensureFileExist(itemFile);
        shell.showItemInFolder(itemFile);
        return;
      }
      throw new Error("TreeView Explorer target kind is invalid");
    });
  }

  public clone(params: TreeViewCloneParams): Promise<void> {
    return this._enqueue(() => {
      const sourcePath = TreeViewPath.normalize(params.sourcePath, "TreeView clone source");
      PathUtil.ensurePathExist(sourcePath);
      const targetPath = TreeViewPath.normalize(params.targetPath, "TreeView clone target");
      PathUtil.ensurePathNotExist(targetPath);
      if (params.kind === "item") {
        const source = this._resolveItemFile(sourcePath);
        const target = this._resolveItemFile(targetPath);
        TreeViewPath.ensureName(
          path.basename(target, TREE_VIEW_ITEM_FILE_EXTENSION),
          "TreeView item clone target name",
        );
        const properties = this._readItemProperties(source);
        const persisted = this._readPersistedRecord(source);
        this._runStagedCreate(target, (stage) => writeStrictJsonFileAtomic(
          stage,
          { ...persisted, id: randomUUID() },
        ));
        if (!properties.isDraft) {
          this._appendOrder(
            path.dirname(target),
            "item",
            path.basename(target, TREE_VIEW_ITEM_FILE_EXTENSION),
          );
        }
      } else {
        TreeViewPath.ensureName(
          path.basename(targetPath),
          params.kind === "workspace"
            ? "TreeView workspace clone target name"
            : "TreeView folder clone target name",
        );
        PathUtil.ensureFileExist(path.join(sourcePath, FOLDER_FILE_NAME));
        if (params.kind === "folder") {
          this._ensureOrderMetadataWritable(path.dirname(targetPath));
        }
        this._runStagedCreate(targetPath, (stage) => {
          // fs.cpSync can terminate Electron 37 on Windows paths containing non-ASCII names.
          this._copyFolder(sourcePath, stage);
          const idMap = this._rewriteIds(stage);
          if (params.kind === "workspace") {
            const workspacePath = path.join(stage, WORKSPACE_FILE_NAME);
            const properties = this._readWorkspaceProperties(workspacePath);
            properties.isSelected = false;
            properties.tabs = properties.tabs.flatMap((tab): TreeViewTab[] => {
              const id = idMap.get(tab.id);
              return id === undefined ? [] : [{ ...tab, id }];
            });
            properties.activeTabId = properties.activeTabId === null
              ? null
              : idMap.get(properties.activeTabId) ?? properties.tabs[0]?.id ?? null;
            properties.previewTabId = properties.previewTabId === null
              ? null
              : idMap.get(properties.previewTabId) ?? null;
            this._writeWorkspaceProperties(workspacePath, properties);
          }
        });
        if (params.kind === "folder") {
          this._appendOrder(path.dirname(targetPath), "folder", path.basename(targetPath));
        }
      }
    });
  }

  public move(params: TreeViewMoveParams): Promise<void> {
    return this._enqueue(() => {
      if (!Number.isInteger(params.targetOrder) || params.targetOrder < 0) {
        throw new Error("TreeView target order must be a nonnegative integer");
      }
      if (params.kind === "folder") {
        const source = TreeViewPath.normalize(params.sourcePath, "TreeView folder move source");
        PathUtil.ensureFolderExist(source);
        const target = TreeViewPath.normalize(params.targetPath, "TreeView folder move target");
        TreeViewPath.ensureName(path.basename(target), "TreeView folder move target name");
        const targetParent = path.dirname(target);
        PathUtil.ensureFolderExist(targetParent);

        const sourceName = path.basename(source);
        const sourceParent = path.dirname(source);
        const insertionOrder = this._resolveInsertionOrder(
          sourceParent,
          targetParent,
          "folder",
          sourceName,
          params.targetOrder,
        );
        if (source === target) {
          this._reorder(sourceParent, "folder", sourceName, insertionOrder);
          return;
        }
        if (this._isContainedBy(source, target)) {
          throw new Error("TreeView folder cannot move into its own subtree");
        }
        this._ensureRenameTargetAvailable(source, target);
        this._ensureOrderMetadataWritable(sourceParent);
        this._ensureOrderMetadataWritable(targetParent);
        this._removeOrder(sourceParent, "folder", sourceName);
        this._rename(source, target);
        const targetName = path.basename(target);
        this._insertOrder(targetParent, "folder", targetName, insertionOrder);
      } else {
        const source = this._resolveItemFile(params.sourcePath);
        const target = this._resolveItemFile(params.targetPath);
        PathUtil.ensureFileExist(source);
        this._findWorkspaceDirectory(path.dirname(source));
        const item = this._readItemProperties(source);
        const sourceParent = path.dirname(source);
        const targetParent = path.dirname(target);
        PathUtil.ensureFolderExist(targetParent);
        const sourceName = path.basename(source, TREE_VIEW_ITEM_FILE_EXTENSION);
        const targetName = path.basename(target, TREE_VIEW_ITEM_FILE_EXTENSION);
        TreeViewPath.ensureName(targetName, "TreeView item move target name");
        const insertionOrder = this._resolveInsertionOrder(
          sourceParent,
          targetParent,
          "item",
          sourceName,
          params.targetOrder,
        );
        if (source === target) {
          if (!item.isDraft) this._reorder(sourceParent, "item", sourceName, insertionOrder);
          return;
        }
        this._ensureRenameTargetAvailable(source, target);
        if (!item.isDraft) {
          this._ensureOrderMetadataWritable(sourceParent);
          this._ensureOrderMetadataWritable(targetParent);
          this._removeOrder(sourceParent, "item", sourceName);
        }
        this._rename(source, target);
        if (!item.isDraft) this._insertOrder(targetParent, "item", targetName, insertionOrder);
      }
    });
  }

  private _readFolder(
    directory: string,
    warnings: string[] = [],
  ): TreeViewFolder {
    PathUtil.ensureFolderExist(directory);
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._readFolderProperties(metadataPath);
    const childFolders: TreeViewFolder[] = [];
    const childItems: TreeViewItem[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === FOLDER_FILE_NAME || entry.name === WORKSPACE_FILE_NAME
        || entry.name.startsWith("__")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!fs.existsSync(path.join(entryPath, FOLDER_FILE_NAME))) continue;
        try {
          childFolders.push(this._readFolder(entryPath, warnings));
        } catch {
          warnings.push(
            `Skipped invalid TreeView folder "${entryPath}": metadata or contents could not be read.`,
          );
        }
      } else if (entry.isFile() && path.extname(entry.name) === TREE_VIEW_ITEM_FILE_EXTENSION) {
        try {
          childItems.push(this._createItemView(
            entryPath,
            this._readItemProperties(entryPath),
          ));
        } catch {
          warnings.push(
            `Skipped invalid TreeView item "${entryPath}": metadata could not be read.`,
          );
        }
      }
    }
    this._ensureUniqueChildNames(childFolders, childItems);
    const folderNames = new Set(childFolders.map((folder) => folder.name));
    const itemNames = new Set(childItems
      .filter((item) => !item.properties.isDraft)
      .map((item) => item.name));
    const folderOrder = properties.folderOrder.filter((name) => folderNames.has(name));
    const itemOrder = properties.itemOrder.filter((name) => itemNames.has(name));
    for (const name of folderNames) {
      if (!folderOrder.includes(name)) folderOrder.push(name);
    }
    for (const name of itemNames) {
      if (!itemOrder.includes(name)) itemOrder.push(name);
    }
    const hasOrderChanged = folderOrder.length !== properties.folderOrder.length
      || folderOrder.some((name, index) => name !== properties.folderOrder[index])
      || itemOrder.length !== properties.itemOrder.length
      || itemOrder.some((name, index) => name !== properties.itemOrder[index]);
    if (hasOrderChanged) {
      properties.folderOrder = folderOrder;
      properties.itemOrder = itemOrder;
      this._folderPropertiesSerializer.validate(properties);
      this._writeFolderProperties(metadataPath, properties);
    }
    const folders = this._sortByOrder(childFolders, properties.folderOrder);
    const items = this._sortByOrder(childItems, properties.itemOrder);
    return {
      path: TreeViewPath.normalize(directory, "TreeView storage path"),
      name: path.basename(directory),
      properties,
      folders,
      items,
    };
  }

  private async _notifyStorageWarnings(warnings: readonly string[]): Promise<void> {
    const notifier = this._notifier;
    if (notifier === null) throw new Error("TreeView DataProvider's notifier is not initialized");
    for (const warning of warnings) await notifier.storageWarning(warning);
  }

  private _deleteOrphanDrafts(directory: string): void {
    const workspaceFilePath = path.join(directory, WORKSPACE_FILE_NAME);
    if (!fs.existsSync(workspaceFilePath)) return;
    const workspace = this._readWorkspaceProperties(workspaceFilePath);
    const tabIds = new Set(workspace.tabs.map((tab) => tab.id));
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()
        || path.extname(entry.name) !== TREE_VIEW_ITEM_FILE_EXTENSION
        || entry.name.startsWith("__")) continue;
      const itemPath = path.join(directory, entry.name);
      let properties: TreeViewItemProperties;
      try {
        properties = this._readItemProperties(itemPath);
      } catch {
        continue;
      }
      if (properties.isDraft && !tabIds.has(properties.id)) fs.rmSync(itemPath);
    }
  }

  private _readItemProperties(filePath: string): TreeViewItemProperties {
    return this._readProperties(filePath, this._itemPropertiesSerializer);
  }

  private _readFolderProperties(filePath: string): TreeViewFolderProperties {
    return this._readProperties(filePath, this._folderPropertiesSerializer);
  }

  private _readWorkspaceProperties(
    filePath: string,
    shouldPersistMigration = false,
  ): TreeViewWorkspace {
    const persisted = this._readPersistedRecord(filePath);
    const properties = { ...persisted };
    delete properties.data;
    const normalized = treeViewWorkspaceSerializer.fromValue(properties);
    if (shouldPersistMigration && normalized !== properties) {
      writeStrictJsonFileAtomic(filePath, { ...normalized, data: persisted.data });
    }
    return normalized;
  }

  private _readProperties<TProperties>(
    filePath: string,
    serializer: ISerializer<TProperties>,
  ): TProperties {
    const persisted = this._readPersistedRecord(filePath);
    const properties = { ...persisted };
    delete properties.data;
    return serializer.fromValue(properties);
  }

  private _writeFolderProperties(
    filePath: string,
    properties: TreeViewFolderProperties,
  ): void {
    const persisted = this._readPersistedRecord(filePath);
    writeStrictJsonFileAtomic(filePath, { ...properties, data: persisted.data });
  }

  private _writeItemProperties(filePath: string, properties: TreeViewItemProperties): void {
    const persisted = this._readPersistedRecord(filePath);
    writeStrictJsonFileAtomic(filePath, { ...properties, data: persisted.data });
  }

  private _writeWorkspaceProperties(filePath: string, properties: TreeViewWorkspace): void {
    const persisted = this._readPersistedRecord(filePath);
    writeStrictJsonFileAtomic(filePath, { ...properties, data: persisted.data });
  }

  private _readPersistedRecord(filePath: string): Record<string, unknown> {
    const value = readStrictJsonFile(filePath);
    ValidateUtils.ensureRecord(value);
    return value;
  }

  private _parseDataJson(dataJson: string): unknown {
    try {
      const value: unknown = JSON.parse(dataJson);
      return value;
    } catch {
      throw new Error("TreeView entity data must be valid JSON");
    }
  }

  private _createItemView(pathValue: string, properties: TreeViewItemProperties): TreeViewItem {
    return {
      path: TreeViewPath.normalize(pathValue, "TreeView storage path"),
      name: path.basename(pathValue, TREE_VIEW_ITEM_FILE_EXTENSION),
      properties,
    };
  }

  private _createFolderProperties(): TreeViewFolderProperties {
    const properties = this._folderPropertiesSerializer.getDefault();
    properties.id = randomUUID();
    properties.isExpanded = true;
    this._folderPropertiesSerializer.validate(properties);
    return properties;
  }

  private _copyFolder(source: string, target: string): void {
    fs.mkdirSync(target);
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("TreeView storage cannot contain links");
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        this._copyFolder(sourcePath, targetPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
      } else {
        throw new Error("TreeView folder contains an invalid entry");
      }
    }
  }

  private _rewriteIds(directory: string): Map<string, string> {
    const idMap = new Map<string, string>();
    const folderMetadataPath = path.join(directory, FOLDER_FILE_NAME);
    const folder = this._readFolderProperties(folderMetadataPath);
    const folderId = randomUUID();
    idMap.set(folder.id, folderId);
    this._writeFolderProperties(folderMetadataPath, { ...folder, id: folderId });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("__")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!fs.existsSync(path.join(entryPath, FOLDER_FILE_NAME))) continue;
        for (const [sourceId, targetId] of this._rewriteIds(entryPath)) {
          idMap.set(sourceId, targetId);
        }
      }
      else if (entry.isFile() && path.extname(entry.name) === TREE_VIEW_ITEM_FILE_EXTENSION) {
        const item = this._readItemProperties(entryPath);
        const itemId = randomUUID();
        idMap.set(item.id, itemId);
        this._writeItemProperties(entryPath, { ...item, id: itemId });
      }
    }
    return idMap;
  }

  private _reconcileOrder(
    directory: string,
    properties: TreeViewFolderProperties,
    warnings: string[],
  ): Pick<TreeViewFolderProperties, "folderOrder" | "itemOrder"> {
    const folderNames = new Set<string>();
    const itemNames = new Set<string>();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === FOLDER_FILE_NAME || entry.name === WORKSPACE_FILE_NAME
        || entry.name.startsWith("__")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const metadataPath = path.join(entryPath, FOLDER_FILE_NAME);
        if (!fs.existsSync(metadataPath)) continue;
        try {
          this._readFolderProperties(metadataPath);
          folderNames.add(entry.name);
        } catch {
          warnings.push(
            `Skipped invalid TreeView folder "${entryPath}": metadata or contents could not be read.`,
          );
        }
      } else if (entry.isFile() && path.extname(entry.name) === TREE_VIEW_ITEM_FILE_EXTENSION) {
        try {
          const item = this._readItemProperties(entryPath);
          if (!item.isDraft) itemNames.add(path.basename(entry.name, TREE_VIEW_ITEM_FILE_EXTENSION));
        } catch {
          warnings.push(
            `Skipped invalid TreeView item "${entryPath}": metadata could not be read.`,
          );
        }
      }
    }
    const folderOrder = properties.folderOrder.filter((name) => folderNames.has(name));
    const itemOrder = properties.itemOrder.filter((name) => itemNames.has(name));
    for (const name of folderNames) {
      if (!folderOrder.includes(name)) folderOrder.push(name);
    }
    for (const name of itemNames) {
      if (!itemOrder.includes(name)) itemOrder.push(name);
    }
    return { folderOrder, itemOrder };
  }

  private _ensureOrderMetadataWritable(directory: string): void {
    PathUtil.ensureFolderExist(directory);
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    PathUtil.ensureFileExist(metadataPath);
    this._readFolderProperties(metadataPath);
    fs.accessSync(metadataPath, fs.constants.W_OK);
  }

  private _appendOrder(directory: string, kind: "folder" | "item", name: string): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._readFolderProperties(metadataPath);
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    if (!properties[key].includes(name)) properties[key].push(name);
    this._folderPropertiesSerializer.validate(properties);
    this._writeFolderProperties(metadataPath, properties);
  }

  private _removeOrder(directory: string, kind: "folder" | "item", name: string): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._readFolderProperties(metadataPath);
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    if (!properties[key].includes(name)) return;
    properties[key] = properties[key].filter((entry) => entry !== name);
    this._folderPropertiesSerializer.validate(properties);
    this._writeFolderProperties(metadataPath, properties);
  }

  private _insertOrder(
    directory: string,
    kind: "folder" | "item",
    name: string,
    targetOrder: number,
  ): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._readFolderProperties(metadataPath);
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    properties[key].splice(Math.min(targetOrder, properties[key].length), 0, name);
    this._folderPropertiesSerializer.validate(properties);
    this._writeFolderProperties(metadataPath, properties);
  }

  private _reorder(
    directory: string,
    kind: "folder" | "item",
    name: string,
    targetOrder: number,
  ): void {
    const metadataPath = path.join(directory, FOLDER_FILE_NAME);
    const properties = this._readFolderProperties(metadataPath);
    const key = kind === "folder" ? "folderOrder" : "itemOrder";
    const sourceOrder = properties[key].indexOf(name);
    if (sourceOrder < 0) throw new Error("TreeView move source is missing from parent order");
    properties[key].splice(sourceOrder, 1);
    properties[key].splice(Math.min(targetOrder, properties[key].length), 0, name);
    this._folderPropertiesSerializer.validate(properties);
    this._writeFolderProperties(metadataPath, properties);
  }

  private _resolveInsertionOrder(
    sourceParent: string,
    targetParent: string,
    kind: "folder" | "item",
    sourceName: string,
    targetOrder: number,
  ): number {
    if (sourceParent !== targetParent) return targetOrder;
    const properties = this._readFolderProperties(path.join(sourceParent, FOLDER_FILE_NAME));
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
    const folderNames = folders.map((folder) => folder.name.toLocaleLowerCase("en-US"));
    const itemNames = items.map((item) => item.name.toLocaleLowerCase("en-US"));
    if (new Set(folderNames).size !== folderNames.length) {
      throw new Error("TreeView child folder names must be unique");
    }
    if (new Set(itemNames).size !== itemNames.length) {
      throw new Error("TreeView child item names must be unique");
    }
  }

  private _resolveEntityFile(params: TreeViewEntityDataParams): string {
    if (params.kind === "workspace") {
      const workspaceDirectory = TreeViewPath.normalize(params.path, "TreeView workspace path");
      PathUtil.ensureFolderExist(workspaceDirectory);
      const workspaceFilePath = path.join(workspaceDirectory, WORKSPACE_FILE_NAME);
      PathUtil.ensureFileExist(workspaceFilePath);
      return workspaceFilePath;
    }
    if (params.kind === "folder") {
      const folderDirectory = TreeViewPath.normalize(params.path, "TreeView folder path");
      PathUtil.ensureFolderExist(folderDirectory);
      const metadataPath = path.join(folderDirectory, FOLDER_FILE_NAME);
      PathUtil.ensureFileExist(metadataPath);
      return metadataPath;
    }
    if (params.kind === "item") {
      const itemFile = this._resolveItemFile(params.path);
      PathUtil.ensureFileExist(itemFile);
      return itemFile;
    }
    throw new Error("TreeView entity kind is invalid");
  }

  private _resolveItemFile(itemPath: string): string {
    const filePath = TreeViewPath.normalize(itemPath, "TreeView item path");
    if (path.extname(filePath) !== TREE_VIEW_ITEM_FILE_EXTENSION) {
      throw new Error("TreeView item path must reference an MH file");
    }
    return filePath;
  }

  private _ensureContained(root: string, candidate: string): void {
    const relative = path.relative(PathUtil.resolve(root), PathUtil.resolve(candidate));
    if (relative === "" || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".." && !path.isAbsolute(relative))) return;
    throw new Error("TreeView path escapes its operation root");
  }

  private _findWorkspaceDirectory(startPath: string): string {
    let directory = PathUtil.resolve(startPath);
    while (true) {
      if (fs.existsSync(path.join(directory, WORKSPACE_FILE_NAME))) {
        PathUtil.ensureFileExist(path.join(directory, FOLDER_FILE_NAME));
        this._ensureContained(directory, startPath);
        return directory;
      }
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error("TreeView path is not inside a workspace");
      directory = parent;
    }
  }

  private _runStagedCreate(target: string, operation: (stage: string) => void): void {
    const stage = path.join(path.dirname(target), `__${path.basename(target)}`);
    if (fs.existsSync(target)) throw new Error("TreeView target already exists");
    try {
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
      operation(stage);
      fs.renameSync(stage, target);
    } catch (error: unknown) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  private _ensureRenameTargetAvailable(source: string, target: string): void {
    if (source === target
      || source.toLocaleLowerCase("en-US") === target.toLocaleLowerCase("en-US")) return;
    PathUtil.ensurePathNotExist(target);
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

  protected _enqueue<TResult>(operation: () => Promise<TResult> | TResult): Promise<TResult> {
    const result = this._queue.then(operation, operation);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private readonly _peer: BridgePeer;
  private readonly _folderPropertiesSerializer: TreeViewFolderPropertiesSerializer;
  private readonly _itemPropertiesSerializer: TreeViewItemPropertiesSerializer;
  private readonly _itemSerializer: TreeViewItemSerializer;
  private readonly _folderSerializer: TreeViewFolderSerializer;
  private _queue: Promise<void> = Promise.resolve();
  private _notifier: RemoteObject<TreeViewDataNotifierClientRpcApi> | null = null;
}

import { computed, shallowRef, type ComputedRef } from "vue";
import { basename, dirname, join, relative } from "pathe";
import type { RemoteObject } from "../../../../../common/ipc_bridge/rpc";
import type {
  TreeViewCloneParams,
  TreeViewCreateItemProperties,
  TreeViewDataProvider,
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewMoveParams,
  TreeViewTab,
} from "../../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "../../../../../common/treeView";
import { TreeViewBackgroundTaskQueue } from "../treeViewBackgroundTaskQueue";
import type { TreeViewSelection } from "../treeViewTypes";

export type TreeViewExplorerDataProvider = Pick<
  RemoteObject<TreeViewDataProvider>,
  | "getFolder"
  | "getFolderProperties"
  | "checkEntitiesIntegrity"
  | "createFolder"
  | "updateFolderProperties"
  | "deleteFolder"
  | "getItem"
  | "createItem"
  | "updateItem"
  | "repairEntityId"
  | "deleteItem"
  | "openInExplorer"
  | "clone"
  | "move"
>;

type TreeViewRemoteOperationRunner = (
  start: (operationId: string) => Promise<void>,
) => Promise<void>;

type TreeViewExplorerOperationIdentity = Readonly<{
  workspacePath: string;
  loadRevision: number;
}>;

export type TreeViewEntityPathChange = Readonly<{
  workspacePath: string;
  kind: "folder" | "item";
  id: string;
  sourcePath: string;
  targetPath: string;
}>;

export type TreeViewEntityDeletion = Readonly<{
  kind: "folder" | "item";
  id: string;
  path: string;
}>;

export class TreeViewExplorerModel {
  public constructor() {
    this.rootFolder = computed(() => this._rootFolder.value);
    this.selection = computed(() => this._selection.value);
    this.activeEntityPath = computed(() => this._activeEntityPath.value);
  }

  public initialize(
    dataProvider: TreeViewExplorerDataProvider,
    runRemoteOperation: TreeViewRemoteOperationRunner,
  ): void {
    this._dataProvider = dataProvider;
    this._runRemoteOperation = runRemoteOperation;
  }

  public async loadWorkspace(workspacePath: string | null): Promise<void> {
    const loadRevision = ++this._loadRevision;
    this._workspacePath = workspacePath;
    this._resetFolderLoadState();
    this._installRootFolder(null);
    this.synchronizeActiveTab(this._activeTab);
    if (workspacePath === null) return;
    const rootFolder = await this._getDataProvider().getFolder(workspacePath, 1);
    if (this._workspacePath !== workspacePath || this._loadRevision !== loadRevision) return;
    if (rootFolder.path !== workspacePath) {
      throw new Error("TreeView workspace root does not match");
    }
    this._loadedFolderPaths.add(rootFolder.path);
    this._installRootFolder(rootFolder);
    this.synchronizeActiveTab(this._activeTab);
    this._scheduleRestoreExpandedChildren(rootFolder.path);
  }

  public getFolderById(id: string): TreeViewFolder | null {
    return this._folderById.get(id) ?? null;
  }

  public getItemById(id: string): TreeViewItem | null {
    return this._itemById.get(id) ?? null;
  }

  public findLoadedFolderByPath(path: string): TreeViewFolder | null {
    return this._folderByPath.get(path) ?? null;
  }

  public findLoadedItemByPath(path: string): TreeViewItem | null {
    return this._itemByPath.get(path) ?? null;
  }

  public isFolderLoaded(path: string): boolean {
    return this._loadedFolderPaths.has(path);
  }

  public markFolderLoaded(path: string): void {
    this._loadedFolderPaths.add(path);
  }

  public async resolveFolderByPath(path: string): Promise<TreeViewFolder> {
    this._ensureCurrentWorkspacePath(path);
    return this._getDataProvider().getFolder(path, 1);
  }

  public async resolveItemByPath(path: string): Promise<TreeViewItem> {
    this._ensureCurrentWorkspacePath(path);
    return this._getDataProvider().getItem(path);
  }

  public async isEntityComplete(kind: "folder" | "item", entityPath: string): Promise<boolean> {
    this._ensureCurrentWorkspacePath(entityPath);
    const [isComplete] = await this._getDataProvider().checkEntitiesIntegrity([
      { kind, path: entityPath },
    ]);
    if (isComplete === undefined) throw new Error("TreeView entity integrity result is missing");
    return isComplete;
  }

  public loadFolderChildren(folderPath: string): Promise<TreeViewFolder> {
    const folder = this._folderByPath.get(folderPath);
    if (folder === undefined) return Promise.reject(new Error("TreeView folder is missing"));
    if (this._loadedFolderPaths.has(folderPath)) return Promise.resolve(folder);
    const pending = this._folderLoadOperations.get(folderPath);
    if (pending !== undefined) return pending;
    const workspacePath = this._workspacePath;
    if (workspacePath === null) return Promise.reject(new Error("TreeView workspace is unavailable"));
    const loadRevision = this._loadRevision;
    const operation = this._getDataProvider().getFolder(folderPath, 1).then((loadedFolder) => {
      if (this._workspacePath !== workspacePath || this._loadRevision !== loadRevision) {
        return loadedFolder;
      }
      const current = this._folderByPath.get(folderPath);
      if (current === undefined
        || current.path !== loadedFolder.path
        || current.properties.id !== loadedFolder.properties.id) return loadedFolder;
      this._commitLoadedFolderLevel(loadedFolder, current.properties.isExpanded);
      return this._folderByPath.get(folderPath) ?? loadedFolder;
    });
    this._folderLoadOperations.set(folderPath, operation);
    void operation.finally(() => {
      if (this._folderLoadOperations.get(folderPath) === operation) {
        this._folderLoadOperations.delete(folderPath);
      }
    }).catch(() => undefined);
    return operation;
  }

  public async createFolder(folderPath: string): Promise<string> {
    const identity = this._captureOperationIdentity();
    const folderId = await this._getDataProvider().createFolder(folderPath);
    const parentPath = dirname(folderPath);
    const folder = await this._getDataProvider().getFolder(folderPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    this._ensureOperationIdentity(identity);
    this.markFolderLoaded(folder.path);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "folder",
      folderId,
      folder,
    ));
    return folderId;
  }

  public async createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    const identity = this._captureOperationIdentity();
    const item = await this._getDataProvider().createItem(itemPath, properties);
    const parentPath = dirname(itemPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      item.properties.id,
      item,
    ));
    return item;
  }

  public async updateFolder(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    const identity = this._captureOperationIdentity();
    await this._getDataProvider().updateFolderProperties(folderPath, properties);
    this._ensureOperationIdentity(identity);
    const folder = this.findLoadedFolderByPath(folderPath);
    if (folder === null) throw new Error("TreeView folder is missing");
    this.commitRootFolder(this._updateFolderNode(
      this._requireRootFolder(),
      folderPath,
      (current) => ({
        ...current,
        properties: {
          ...structuredClone(properties),
          folderOrder: [...current.properties.folderOrder],
          itemOrder: [...current.properties.itemOrder],
        },
      }),
    ));
  }

  public async updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    const identity = this._captureOperationIdentity();
    const item = this.findLoadedItemByPath(itemPath);
    if (item === null) throw new Error("TreeView item is missing");
    await this._getDataProvider().updateItem(itemPath, properties);
    this._ensureOperationIdentity(identity);
    const parentPath = dirname(itemPath);
    const parent = this.findLoadedFolderByPath(parentPath);
    if (parent === null) throw new Error("TreeView item parent is missing");
    const itemOrder = properties.isDraft
      ? parent.properties.itemOrder.filter((name) => name !== item.name)
      : parent.properties.itemOrder.includes(item.name)
        ? [...parent.properties.itemOrder]
        : [...parent.properties.itemOrder, item.name];
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      { ...structuredClone(parent.properties), itemOrder },
      "item",
      item.properties.id,
      { ...item, properties: structuredClone(properties) },
    ));
  }

  public async deleteFolder(folderId: string): Promise<TreeViewEntityDeletion> {
    const identity = this._captureOperationIdentity();
    const folder = this.getFolderById(folderId);
    if (folder === null) throw new Error("TreeView folder is missing");
    const parentPath = dirname(folder.path);
    await this._runRemote((operationId) => (
      this._getDataProvider().deleteFolder(operationId, folder.path)
    ));
    const parentProperties = await this._readParentPropertiesAfterDeletion(
      parentPath, "folder", folder.name, identity,
    );
    this._ensureOperationIdentity(identity);
    this.removeFolderLoadState(folder.path);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "folder",
      folderId,
      null,
    ));
    return { kind: "folder", id: folderId, path: folder.path };
  }

  public async deleteItem(itemId: string): Promise<TreeViewEntityDeletion> {
    const identity = this._captureOperationIdentity();
    const item = this.getItemById(itemId);
    if (item === null) throw new Error("TreeView item is missing");
    const parentPath = dirname(item.path);
    await this._runRemote((operationId) => (
      this._getDataProvider().deleteItem(operationId, item.path)
    ));
    const parentProperties = await this._readParentPropertiesAfterDeletion(
      parentPath, "item", item.name, identity,
    );
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      itemId,
      null,
    ));
    return { kind: "item", id: itemId, path: item.path };
  }

  public async openInExplorer(selection: TreeViewSelection): Promise<void> {
    const entity = selection.kind === "folder"
      ? this.getFolderById(selection.id)
      : this.getItemById(selection.id);
    if (entity === null) throw new Error("TreeView Explorer target is missing");
    await this._getDataProvider().openInExplorer(selection.kind, entity.path);
  }

  public async openPathInExplorer(kind: "folder" | "item", targetPath: string): Promise<void> {
    this._ensureCurrentWorkspacePath(targetPath);
    await this._getDataProvider().openInExplorer(kind, targetPath);
  }

  public async clone(
    params: TreeViewCloneParams & { kind: "folder" | "item" },
  ): Promise<TreeViewFolder | TreeViewItem> {
    const identity = this._captureOperationIdentity();
    await this._runRemote((operationId) => this._getDataProvider().clone(operationId, params));
    const parentPath = dirname(params.targetPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    if (params.kind === "folder") {
      const folder = await this._getDataProvider().getFolder(params.targetPath, 1);
      this._ensureOperationIdentity(identity);
      this.commitRootFolder(this._updateFolderNode(
        this._requireRootFolder(),
        parentPath,
        (parent) => ({
          ...parent,
          properties: structuredClone(parentProperties),
          folders: this._sortByOrder(
            [...parent.folders, folder],
            parentProperties.folderOrder,
          ),
        }),
      ));
      if (folder.properties.isExpanded) {
        this.markFolderLoaded(folder.path);
        this._scheduleRestoreExpandedChildren(folder.path);
      }
      return folder;
    }
    const item = await this._getDataProvider().getItem(params.targetPath);
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      item.properties.id,
      item,
    ));
    return item;
  }

  public async move(params: TreeViewMoveParams): Promise<TreeViewEntityPathChange | null> {
    const identity = this._captureOperationIdentity();
    const source = params.kind === "folder"
      ? this.findLoadedFolderByPath(params.sourcePath)
      : this.findLoadedItemByPath(params.sourcePath);
    if (source === null) return null;
    const sourceParentPath = dirname(params.sourcePath);
    const targetParentPath = dirname(params.targetPath);
    await this._getDataProvider().move(params);
    const sourceProperties = await this._getDataProvider().getFolderProperties(sourceParentPath);
    const targetProperties = sourceParentPath === targetParentPath
      ? sourceProperties
      : await this._getDataProvider().getFolderProperties(targetParentPath);
    this._ensureOperationIdentity(identity);
    if (params.kind === "folder") {
      this.rebaseLoadedFolderPaths(params.sourcePath, params.targetPath);
    }
    let target: TreeViewFolder | TreeViewItem;
    if (params.kind === "folder") {
      if (!("folders" in source)) throw new Error("TreeView move source kind is invalid");
      target = this._rebaseFolder(source, params.sourcePath, params.targetPath);
    } else {
      if ("folders" in source) throw new Error("TreeView move source kind is invalid");
      target = {
        ...source,
        path: params.targetPath,
        name: basename(params.targetPath, TREE_VIEW_ITEM_FILE_EXTENSION),
      };
    }
    let rootFolder = this._requireRootFolder();
    if (sourceParentPath === targetParentPath) {
      rootFolder = this._replaceChild(
        rootFolder,
        sourceParentPath,
        sourceProperties,
        params.kind,
        source.properties.id,
        target,
      );
    } else {
      rootFolder = this._replaceChild(
        rootFolder,
        sourceParentPath,
        sourceProperties,
        params.kind,
        source.properties.id,
        null,
      );
      rootFolder = this._replaceChild(
        rootFolder,
        targetParentPath,
        targetProperties,
        params.kind,
        source.properties.id,
        target,
      );
    }
    this.commitRootFolder(rootFolder);
    return {
      workspacePath: identity.workspacePath,
      kind: params.kind,
      id: source.properties.id,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
    };
  }

  public async expandAncestors(entityPath: string): Promise<void> {
    const identity = this._captureOperationIdentity();
    let parentPath = dirname(entityPath);
    let rootFolder = this._requireRootFolder();
    let hasChanged = false;
    while (true) {
      const folder = this.findLoadedFolderByPath(parentPath);
      if (folder !== null && !folder.properties.isExpanded) {
        const properties = { ...structuredClone(folder.properties), isExpanded: true };
        await this._getDataProvider().updateFolderProperties(folder.path, properties);
        this._ensureOperationIdentity(identity);
        rootFolder = this._updateFolderNode(
          rootFolder,
          folder.path,
          (current) => ({ ...current, properties }),
        );
        hasChanged = true;
      }
      if (parentPath === this._workspacePath) break;
      const nextParentPath = dirname(parentPath);
      if (nextParentPath === parentPath) break;
      parentPath = nextParentPath;
    }
    if (hasChanged) this.commitRootFolder(rootFolder);
  }

  public rebaseWorkspace(sourcePath: string, targetPath: string): void {
    const rootFolder = this._requireRootFolder();
    this._loadRevision += 1;
    this.rebaseLoadedFolderPaths(sourcePath, targetPath);
    this._workspacePath = targetPath;
    this.commitRootFolder(this._rebaseFolder(rootFolder, sourcePath, targetPath));
  }

  public async synchronizePublishedItem(
    workspacePath: string,
    sourceItem: TreeViewItem,
    targetItem: TreeViewItem,
    targetFolderPath: string,
  ): Promise<void> {
    const identity = this._captureOperationIdentity(workspacePath);
    const sourceParentPath = dirname(sourceItem.path);
    let rootFolder = this._requireRootFolder();
    if (sourceParentPath === targetFolderPath) {
      const properties = await this._getDataProvider().getFolderProperties(targetFolderPath);
      rootFolder = this._replaceChild(
        rootFolder,
        targetFolderPath,
        properties,
        "item",
        sourceItem.properties.id,
        targetItem,
      );
    } else {
      const sourceProperties = await this._getDataProvider().getFolderProperties(sourceParentPath);
      const targetProperties = await this._getDataProvider().getFolderProperties(targetFolderPath);
      rootFolder = this._replaceChild(
        rootFolder,
        sourceParentPath,
        sourceProperties,
        "item",
        sourceItem.properties.id,
        null,
      );
      rootFolder = this._replaceChild(
        rootFolder,
        targetFolderPath,
        targetProperties,
        "item",
        sourceItem.properties.id,
        targetItem,
      );
    }
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(rootFolder);
  }

  public async synchronizeCreatedItem(workspacePath: string, item: TreeViewItem): Promise<void> {
    const identity = this._captureOperationIdentity(workspacePath);
    const parentPath = dirname(item.path);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      item.properties.id,
      item,
    ));
  }

  public async synchronizeDeletedItem(
    workspacePath: string,
    itemId: string,
    itemPath: string,
  ): Promise<void> {
    const identity = this._captureOperationIdentity(workspacePath);
    const parentPath = dirname(itemPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    this._ensureOperationIdentity(identity);
    this.commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      itemId,
      null,
    ));
  }

  public synchronizeActiveTab(tab: TreeViewTab | null): void {
    this._selection.value = this.getSelectionForTab(tab);
  }

  public getSelectionForTab(tab: TreeViewTab | null): TreeViewSelection | null {
    if (tab === null) {
      return null;
    }
    if (tab.kind === "folder" && this._folderById.get(tab.id)?.path === tab.path) {
      return { kind: "folder", id: tab.id };
    }
    if (tab.kind === "item" && this._itemById.get(tab.id)?.path === tab.path) {
      return { kind: "item", id: tab.id };
    }
    return null;
  }

  public commitRootFolder(rootFolder: TreeViewFolder): void {
    this._installRootFolder(rootFolder);
    this.synchronizeActiveTab(this._activeTab);
  }

  public setActiveTab(tab: TreeViewTab | null): void {
    this._activeTab = tab;
    this._activeEntityPath.value = tab?.path ?? null;
    this.synchronizeActiveTab(tab);
  }

  public removeFolderLoadState(folderPath: string): void {
    for (const path of [...this._loadedFolderPaths]) {
      if (path === folderPath || path.startsWith(`${folderPath}/`)) {
        this._loadedFolderPaths.delete(path);
      }
    }
    for (const path of [...this._folderLoadOperations.keys()]) {
      if (path === folderPath || path.startsWith(`${folderPath}/`)) {
        this._folderLoadOperations.delete(path);
      }
    }
  }

  public rebaseLoadedFolderPaths(sourcePath: string, targetPath: string): void {
    const rebase = (path: string): string => {
      if (path === sourcePath) return targetPath;
      return path.startsWith(`${sourcePath}/`)
        ? `${targetPath}${path.slice(sourcePath.length)}`
        : path;
    };
    const loadedPaths = [...this._loadedFolderPaths];
    this._loadedFolderPaths.clear();
    for (const path of loadedPaths) this._loadedFolderPaths.add(rebase(path));
    for (const path of [...this._folderLoadOperations.keys()]) {
      if (path === sourcePath || path.startsWith(`${sourcePath}/`)) {
        this._folderLoadOperations.delete(path);
      }
    }
  }

  public scheduleRestoreExpandedChildren(folderPath: string): void {
    this._scheduleRestoreExpandedChildren(folderPath);
  }

  public startBackgroundTasks(): void {
    this._backgroundTasks.start();
  }

  public pauseBackgroundTasks(): void {
    this._backgroundTasks.pause();
  }

  public enqueueBackgroundTask(task: () => Promise<void> | void): void {
    this._backgroundTasks.enqueue(task);
  }

  public dispose(): void {
    this._backgroundTasks.dispose();
  }

  private async _readParentPropertiesAfterDeletion(
    parentPath: string,
    kind: "folder" | "item",
    deletedName: string,
    identity: TreeViewExplorerOperationIdentity,
  ): Promise<TreeViewFolderProperties> {
    try {
      return await this._getDataProvider().getFolderProperties(parentPath);
    } catch (reason: unknown) {
      const isMissingParent = reason instanceof Error && (
        reason.message === "Folder does not exist"
        || /^MH file could not be read: .*\. ENOENT: /s.test(reason.message)
      );
      if (!isMissingParent) throw reason;
      this._ensureOperationIdentity(identity);
      const parent = this.findLoadedFolderByPath(parentPath);
      if (parent === null) throw new Error(`TreeView ${kind} parent is missing`);
      const orderKey = kind === "folder" ? "folderOrder" : "itemOrder";
      return {
        ...structuredClone(parent.properties),
        [orderKey]: parent.properties[orderKey].filter((name) => name !== deletedName),
      };
    }
  }

  private _commitLoadedFolderLevel(folder: TreeViewFolder, isExpanded: boolean): void {
    const rootFolder = this._updateFolderNode(
      this._requireRootFolder(),
      folder.path,
      () => ({
        ...folder,
        properties: { ...folder.properties, isExpanded },
      }),
    );
    this._loadedFolderPaths.add(folder.path);
    this.commitRootFolder(rootFolder);
    this._scheduleRestoreExpandedChildren(folder.path);
  }

  private _scheduleRestoreExpandedChildren(folderPath: string): void {
    this._backgroundTasks.enqueue(() => {
      const folder = this._folderByPath.get(folderPath);
      if (folder === undefined || !folder.properties.isExpanded) return;
      for (const child of folder.folders) {
        if (!child.properties.isExpanded) continue;
        this._backgroundTasks.enqueue(async () => {
          await this.loadFolderChildren(child.path);
        });
      }
    });
  }

  private _resetFolderLoadState(): void {
    this._backgroundTasks.clear();
    this._loadedFolderPaths.clear();
    this._folderLoadOperations.clear();
  }

  private _installRootFolder(rootFolder: TreeViewFolder | null): void {
    this._folderById = new Map();
    this._folderByPath = new Map();
    this._itemById = new Map();
    this._itemByPath = new Map();
    if (rootFolder !== null) this._indexFolder(rootFolder);
    this._rootFolder.value = rootFolder;
  }

  private _indexFolder(folder: TreeViewFolder): void {
    if (this._folderById.has(folder.properties.id)) {
      folder.properties.id = crypto.randomUUID();
      void this._getDataProvider().repairEntityId(
        { kind: "folder", path: folder.path },
        folder.properties.id,
      );
    }
    this._folderById.set(folder.properties.id, folder);
    this._folderByPath.set(folder.path, folder);
    for (const item of folder.items) {
      if (this._itemById.has(item.properties.id)) {
        item.properties.id = crypto.randomUUID();
        void this._getDataProvider().repairEntityId(
          { kind: "item", path: item.path },
          item.properties.id,
        );
      }
      this._itemById.set(item.properties.id, item);
      this._itemByPath.set(item.path, item);
    }
    for (const child of folder.folders) this._indexFolder(child);
  }

  private _updateFolderNode(
    rootFolder: TreeViewFolder,
    folderPath: string,
    update: (folder: TreeViewFolder) => TreeViewFolder,
  ): TreeViewFolder {
    const updated = this._tryUpdateFolderNode(rootFolder, folderPath, update);
    if (updated === null) throw new Error("TreeView folder is missing");
    return updated;
  }

  private _replaceChild(
    rootFolder: TreeViewFolder,
    parentPath: string,
    parentProperties: TreeViewFolderProperties,
    kind: "folder" | "item",
    removedId: string,
    replacement: TreeViewFolder | TreeViewItem | null,
  ): TreeViewFolder {
    return this._updateFolderNode(rootFolder, parentPath, (parent) => {
      if (kind === "folder") {
        const folders = parent.folders.filter((folder) => folder.properties.id !== removedId);
        if (replacement !== null) {
          if (!("folders" in replacement)) throw new Error("TreeView folder replacement is invalid");
          folders.push(replacement);
        }
        return {
          ...parent,
          properties: structuredClone(parentProperties),
          folders: this._sortByOrder(folders, parentProperties.folderOrder),
        };
      }
      const items = parent.items.filter((item) => item.properties.id !== removedId);
      if (replacement !== null) {
        if ("folders" in replacement) throw new Error("TreeView item replacement is invalid");
        items.push(replacement);
      }
      return {
        ...parent,
        properties: structuredClone(parentProperties),
        items: this._sortByOrder(items, parentProperties.itemOrder),
      };
    });
  }

  private _tryUpdateFolderNode(
    folder: TreeViewFolder,
    folderPath: string,
    update: (folder: TreeViewFolder) => TreeViewFolder,
  ): TreeViewFolder | null {
    if (folder.path === folderPath) return update(folder);
    for (let index = 0; index < folder.folders.length; index += 1) {
      const child = folder.folders[index];
      if (child === undefined) continue;
      const updatedChild = this._tryUpdateFolderNode(child, folderPath, update);
      if (updatedChild === null) continue;
      const folders = [...folder.folders];
      folders[index] = updatedChild;
      return { ...folder, folders };
    }
    return null;
  }

  private _rebaseFolder(
    folder: TreeViewFolder,
    sourcePath: string,
    targetPath: string,
  ): TreeViewFolder {
    const rebasePath = (path: string): string => {
      const relativePath = relative(sourcePath, path);
      return relativePath.length === 0 ? targetPath : join(targetPath, relativePath);
    };
    return {
      ...folder,
      path: rebasePath(folder.path),
      name: folder.path === sourcePath ? basename(targetPath) : folder.name,
      folders: folder.folders.map((child) => this._rebaseFolder(child, sourcePath, targetPath)),
      items: folder.items.map((item) => ({ ...item, path: rebasePath(item.path) })),
    };
  }

  private _sortByOrder<TEntry extends { name: string }>(
    entries: readonly TEntry[],
    order: readonly string[],
  ): TEntry[] {
    const indexes = new Map(order.map((name, index) => [name, index]));
    return [...entries].sort((left, right) => {
      const leftIndex = indexes.get(left.name);
      const rightIndex = indexes.get(right.name);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return left.name.localeCompare(right.name, "en-US");
    });
  }

  private _requireRootFolder(): TreeViewFolder {
    const rootFolder = this._rootFolder.value;
    if (rootFolder === null) throw new Error("TreeView root folder is not loaded");
    return rootFolder;
  }

  private _ensureCurrentWorkspacePath(targetPath: string): void {
    const workspacePath = this._requireWorkspacePath();
    const relativePath = relative(workspacePath, targetPath);
    if (relativePath === ".."
      || relativePath.startsWith("../")
      || relativePath.startsWith("..\\")
      || relativePath.startsWith("/")
      || /^[a-zA-Z]:\//.test(relativePath)) {
      throw new Error("TreeView target is outside the current Workspace");
    }
  }

  private _requireWorkspacePath(): string {
    const workspacePath = this._workspacePath;
    if (workspacePath === null) throw new Error("TreeView workspace is unavailable");
    return workspacePath;
  }

  private _captureOperationIdentity(
    expectedWorkspacePath?: string,
  ): TreeViewExplorerOperationIdentity {
    const workspacePath = this._requireWorkspacePath();
    if (expectedWorkspacePath !== undefined && workspacePath !== expectedWorkspacePath) {
      throw new Error("TreeView Workspace changed during operation");
    }
    return { workspacePath, loadRevision: this._loadRevision };
  }

  private _ensureOperationIdentity(identity: TreeViewExplorerOperationIdentity): void {
    if (this._workspacePath !== identity.workspacePath
      || this._loadRevision !== identity.loadRevision) {
      throw new Error("TreeView Workspace changed during operation");
    }
  }

  private _getDataProvider(): TreeViewExplorerDataProvider {
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView Explorer DataProvider is not initialized");
    return dataProvider;
  }

  private _runRemote(start: (operationId: string) => Promise<void>): Promise<void> {
    const runRemoteOperation = this._runRemoteOperation;
    if (runRemoteOperation === null) {
      throw new Error("TreeView Explorer operation runner is not initialized");
    }
    return runRemoteOperation(start);
  }

  public readonly rootFolder: ComputedRef<TreeViewFolder | null>;
  public readonly selection: ComputedRef<TreeViewSelection | null>;
  public readonly activeEntityPath: ComputedRef<string | null>;

  private readonly _backgroundTasks = new TreeViewBackgroundTaskQueue();
  private _dataProvider: TreeViewExplorerDataProvider | null = null;
  private _runRemoteOperation: TreeViewRemoteOperationRunner | null = null;
  private _workspacePath: string | null = null;
  private _loadRevision = 0;
  private readonly _rootFolder = shallowRef<TreeViewFolder | null>(null);
  private readonly _selection = shallowRef<TreeViewSelection | null>(null);
  private readonly _activeEntityPath = shallowRef<string | null>(null);
  private _activeTab: TreeViewTab | null = null;
  private readonly _loadedFolderPaths = new Set<string>();
  private readonly _folderLoadOperations = new Map<string, Promise<TreeViewFolder>>();
  private _folderById = new Map<string, TreeViewFolder>();
  private _folderByPath = new Map<string, TreeViewFolder>();
  private _itemById = new Map<string, TreeViewItem>();
  private _itemByPath = new Map<string, TreeViewItem>();
}
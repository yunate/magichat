import { computed, shallowRef, type ComputedRef } from "vue";
import { basename, dirname, join, relative } from "pathe";
import type { RemoteObject } from "../../../../../common/ipc_bridge/rpc";
import { sleep } from "../../../../../common/sleep";
import type {
  TreeViewCloneParams,
  TreeViewDataProvider,
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewMoveParams,
} from "../../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION, TreeViewFolderUtils } from "../../../../../common/treeView";
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
  | "getAvailableItemPath"
  | "createItem"
  | "updateItem"
  | "deleteItem"
  | "openInExplorer"
  | "clone"
  | "move"
>;

export type TreeViewEntityPathChange = Readonly<{
  workspacePath: string;
  kind: "folder" | "item";
  sourcePath: string;
  targetPath: string;
}>;

export type TreeViewEntityDeletion = Readonly<{
  kind: "folder" | "item";
  path: string;
}>;

export class TreeViewExplorerModel {
  public constructor() {
    this.rootFolder = computed(() => this._rootFolder.value);
  }

  public initialize(dataProvider: TreeViewExplorerDataProvider): void {
    this._dataProvider = dataProvider;
  }

  public dispose(): void {
    this._isDisposed = true;
    if (this._rootPublishTimeout !== null) {
      clearTimeout(this._rootPublishTimeout);
      this._rootPublishTimeout = null;
    }
  }

  public async loadWorkspace(workspacePath: string | null): Promise<void> {
    if (this._isDisposed) return;
    this._workspacePath = workspacePath;
    this._loadedFolderPaths.clear();
    this._rootFolder.value = null;
    if (workspacePath !== null) await this.loadFolder(workspacePath);
  }

  public findLoadedFolderByPath(path: string): TreeViewFolder | null {
    const rootFolder = this._rootFolder.value;
    return rootFolder === null ? null : TreeViewFolderUtils.GetFolder(rootFolder, path);
  }

  public findLoadedItemByPath(path: string): TreeViewItem | null {
    const rootFolder = this._rootFolder.value;
    return rootFolder === null ? null : TreeViewFolderUtils.GetItem(rootFolder, path);
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

  public async loadFolder(folderPath: string): Promise<void> {
    if (this._isDisposed) return;
    this._ensureCurrentWorkspacePath(folderPath);
    const pending: string[] = [folderPath];
    while (pending.length > 0 && !this._isDisposed) {
      const path = pending.pop()!;
      const isLoaded = this._loadedFolderPaths.has(path);
      let current: TreeViewFolder;
      if (isLoaded) {
        const loaded = TreeViewFolderUtils.GetFolder(this._requireRootFolder(), path);
        if (loaded === null) throw new Error("TreeView loaded folder is missing");
        current = loaded;
      } else {
        current = await this._getDataProvider().getFolder(path, 1);
        if (this._isDisposed) return;
        if (current.path !== path) throw new Error("TreeView folder path does not match");
        if (path === this._workspacePath) {
          this._rootFolder.value = current;
        } else {
          const root = this._requireRootFolder();
          if (!TreeViewFolderUtils.UpdateFolder(root, current)) {
            throw new Error("TreeView folder could not be updated");
          }
        }
      }
      if (current.properties.isExpanded) {
        for (const child of [...current.folders].reverse()) {
          // if (!child.properties.isExpanded) continue;
          const childPath = child.path;
          if (childPath !== undefined) pending.push(childPath);
        }
      }
      if (!isLoaded) {
        this._loadedFolderPaths.add(path);
        this._refreshRootFolder();
      }
      await sleep(0);
    }
  }

  public async createFolder(folderPath: string): Promise<TreeViewFolder> {
    const folder = await this._getDataProvider().createFolder(folderPath);
    const parentPath = dirname(folderPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView folder parent is missing");
    if (!TreeViewFolderUtils.AddFolder(rootFolder, folder)) {
      throw new Error("TreeView folder could not be added");
    }
    parent.properties = structuredClone(parentProperties);
    parent.folders = this._sortByOrder(parent.folders, parent.properties.folderOrder);
    this.markFolderLoaded(folder.path);
    this._refreshRootFolder();
    return folder;
  }

  public async createItem(
    itemPath: string,
    properties: TreeViewItemProperties,
  ): Promise<TreeViewItem> {
    const availablePath = await this._getDataProvider().getAvailableItemPath(itemPath);
    const item = await this._getDataProvider().createItem(availablePath, properties);
    const parentPath = dirname(itemPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView item parent is missing");
    if (!TreeViewFolderUtils.AddItem(rootFolder, item)) {
      throw new Error("TreeView item could not be added");
    }
    parent.properties = structuredClone(parentProperties);
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
    return item;
  }

  public async updateFolder(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    await this._getDataProvider().updateFolderProperties(folderPath, properties);
    const folder = this.findLoadedFolderByPath(folderPath);
    if (folder === null) throw new Error("TreeView folder is missing");
    folder.properties = {
      ...structuredClone(properties),
      folderOrder: [...folder.properties.folderOrder],
      itemOrder: [...folder.properties.itemOrder],
    };
    this._refreshRootFolder();
  }

  public async updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    await this._getDataProvider().updateItem(itemPath, properties);
    const item = this.findLoadedItemByPath(itemPath);
    if (item === null) throw new Error("TreeView item is missing");
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(itemPath));
    if (parent === null) throw new Error("TreeView item parent is missing");
    item.properties = structuredClone(properties);
    if (!TreeViewFolderUtils.UpdateItem(rootFolder, item)) {
      throw new Error("TreeView item could not be updated");
    }
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
  }

  public async deleteFolder(folderPath: string): Promise<TreeViewEntityDeletion> {
    const folder = this.findLoadedFolderByPath(folderPath);
    if (folder === null) throw new Error("TreeView folder is missing");
    const parentPath = dirname(folder.path);
    await this._getDataProvider().deleteFolder(folder.path);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView folder parent is missing");
    if (!TreeViewFolderUtils.DeleteFolder(rootFolder, folder.path)) {
      throw new Error("TreeView folder could not be removed");
    }
    parent.properties = structuredClone(parentProperties);
    parent.folders = this._sortByOrder(parent.folders, parent.properties.folderOrder);
    this.removeFolderLoadState(folder.path);
    this._refreshRootFolder();
    return { kind: "folder", path: folder.path };
  }

  public async deleteItem(itemPath: string): Promise<TreeViewEntityDeletion> {
    const item = this.findLoadedItemByPath(itemPath);
    if (item === null) throw new Error("TreeView item is missing");
    const parentPath = dirname(item.path);
    await this._getDataProvider().deleteItem(item.path);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView item parent is missing");
    if (!TreeViewFolderUtils.DeleteItem(rootFolder, item.path)) {
      throw new Error("TreeView item could not be removed");
    }
    parent.properties = structuredClone(parentProperties);
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
    return { kind: "item", path: item.path };
  }

  public async openInExplorer(selection: TreeViewSelection): Promise<void> {
    const entity = selection.kind === "folder"
      ? this.findLoadedFolderByPath(selection.path)
      : this.findLoadedItemByPath(selection.path);
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
    return params.kind === "folder"
      ? this._cloneFolder(params.sourcePath, params.targetPath)
      : this._cloneItem(params.sourcePath, params.targetPath);
  }

  public async move(params: TreeViewMoveParams): Promise<TreeViewEntityPathChange | null> {
    return params.kind === "folder"
      ? this._moveFolder(params.sourcePath, params.targetPath, params.targetOrder)
      : this._moveItem(params.sourcePath, params.targetPath, params.targetOrder);
  }

  public async expandAncestors(entityPath: string): Promise<void> {
    let parentPath = dirname(entityPath);
    const rootFolder = this._requireRootFolder();
    let hasChanged = false;
    while (true) {
      const folder = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
      if (folder !== null && !folder.properties.isExpanded) {
        const properties = { ...structuredClone(folder.properties), isExpanded: true };
        await this._getDataProvider().updateFolderProperties(folder.path, properties);
        folder.properties = properties;
        hasChanged = true;
      }
      if (parentPath === this._workspacePath) break;
      const nextParentPath = dirname(parentPath);
      if (nextParentPath === parentPath) break;
      parentPath = nextParentPath;
    }
    if (hasChanged) this._refreshRootFolder();
  }

  public rebaseWorkspace(sourcePath: string, targetPath: string): void {
    const rootFolder = this._requireRootFolder();
    this.rebaseLoadedFolderPaths(sourcePath, targetPath);
    this._workspacePath = targetPath;
    this._rebaseFolder(rootFolder, sourcePath, targetPath);
    this._refreshRootFolder();
  }

  public async synchronizePublishedItem(
    _workspacePath: string,
    sourceItem: TreeViewItem,
    targetItem: TreeViewItem,
    targetFolderPath: string,
  ): Promise<void> {
    const sourceParentPath = dirname(sourceItem.path);
    const sourceProperties = await this._getDataProvider().getFolderProperties(sourceParentPath);
    const targetProperties = sourceParentPath === targetFolderPath
      ? sourceProperties
      : await this._getDataProvider().getFolderProperties(targetFolderPath);
    const rootFolder = this._requireRootFolder();
    const sourceParent = TreeViewFolderUtils.GetFolder(rootFolder, sourceParentPath);
    const targetParent = TreeViewFolderUtils.GetFolder(rootFolder, targetFolderPath);
    if (sourceParent === null || targetParent === null) throw new Error("TreeView item parent is missing");
    const current = this.findLoadedItemByPath(sourceItem.path)
      ?? this.findLoadedItemByPath(targetItem.path);
    if (current !== null && current.path === targetItem.path) {
      if (!TreeViewFolderUtils.UpdateItem(rootFolder, targetItem)) {
        throw new Error("TreeView item could not be updated");
      }
    } else {
      if (current !== null && !TreeViewFolderUtils.DeleteItem(rootFolder, current.path)) {
        throw new Error("TreeView item could not be removed");
      }
      if (!TreeViewFolderUtils.AddItem(rootFolder, targetItem)) {
        throw new Error("TreeView item could not be added");
      }
    }
    if (sourceParent !== targetParent) {
      sourceParent.properties = structuredClone(sourceProperties);
      sourceParent.items = this._sortByOrder(sourceParent.items, sourceParent.properties.itemOrder);
    }
    targetParent.properties = structuredClone(targetProperties);
    targetParent.items = this._sortByOrder(targetParent.items, targetParent.properties.itemOrder);
    this._refreshRootFolder();
  }

  public async synchronizeCreatedItem(_workspacePath: string, item: TreeViewItem): Promise<void> {
    const parentPath = dirname(item.path);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView item parent is missing");
    const current = parent.items.find((candidate) => candidate.path === item.path);
    if (current !== undefined) {
      if (!TreeViewFolderUtils.UpdateItem(rootFolder, item)) {
        throw new Error("TreeView item could not be updated");
      }
    } else {
      if (!TreeViewFolderUtils.AddItem(rootFolder, item)) {
        throw new Error("TreeView item could not be added");
      }
    }
    parent.properties = structuredClone(parentProperties);
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
  }

  public async synchronizeDeletedItem(
    _workspacePath: string,
    itemPath: string,
  ): Promise<void> {
    const parentPath = dirname(itemPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView item parent is missing");
    const item = parent.items.find((candidate) => candidate.path === itemPath);
    if (item !== undefined && !TreeViewFolderUtils.DeleteItem(rootFolder, item.path)) {
      throw new Error("TreeView item could not be removed");
    }
    parent.properties = structuredClone(parentProperties);
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
  }

  public removeFolderLoadState(folderPath: string): void {
    for (const path of [...this._loadedFolderPaths]) {
      if (path === folderPath || path.startsWith(`${folderPath}/`)) {
        this._loadedFolderPaths.delete(path);
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
  }

  private async _cloneFolder(sourcePath: string, targetPath: string): Promise<TreeViewFolder> {
    await this._getDataProvider().clone({
      kind: "folder", sourcePath, targetPath,
    });
    const parentPath = dirname(targetPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const folder = await this._getDataProvider().getFolder(targetPath, 1);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView clone parent is missing");
    if (!TreeViewFolderUtils.AddFolder(rootFolder, folder)) {
      throw new Error("TreeView folder could not be added");
    }
    parent.properties = structuredClone(parentProperties);
    parent.folders = this._sortByOrder(parent.folders, parent.properties.folderOrder);
    this.markFolderLoaded(folder.path);
    this._refreshRootFolder();
    if (folder.properties.isExpanded) {
      await this.loadFolder(folder.path);
    }
    return folder;
  }

  private async _cloneItem(sourcePath: string, targetPath: string): Promise<TreeViewItem> {
    await this._getDataProvider().clone({
      kind: "item", sourcePath, targetPath,
    });
    const parentPath = dirname(targetPath);
    const parentProperties = await this._getDataProvider().getFolderProperties(parentPath);
    const item = await this._getDataProvider().getItem(targetPath);
    const rootFolder = this._requireRootFolder();
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, parentPath);
    if (parent === null) throw new Error("TreeView clone parent is missing");
    if (!TreeViewFolderUtils.AddItem(rootFolder, item)) {
      throw new Error("TreeView item could not be added");
    }
    parent.properties = structuredClone(parentProperties);
    parent.items = this._sortByOrder(parent.items, parent.properties.itemOrder);
    this._refreshRootFolder();
    return item;
  }

  private async _moveFolder(
    sourcePath: string,
    targetPath: string,
    targetOrder: number,
  ): Promise<TreeViewEntityPathChange | null> {
    const workspacePath = this._requireWorkspacePath();
    const source = this.findLoadedFolderByPath(sourcePath);
    if (source === null) return null;
    const sourceParentPath = dirname(sourcePath);
    const targetParentPath = dirname(targetPath);
    await this._getDataProvider().move({ kind: "folder", sourcePath, targetPath, targetOrder });
    const sourceProperties = await this._getDataProvider().getFolderProperties(sourceParentPath);
    const targetProperties = sourceParentPath === targetParentPath
      ? sourceProperties
      : await this._getDataProvider().getFolderProperties(targetParentPath);
    const rootFolder = this._requireRootFolder();
    const sourceParent = TreeViewFolderUtils.GetFolder(rootFolder, sourceParentPath);
    const targetParent = TreeViewFolderUtils.GetFolder(rootFolder, targetParentPath);
    if (sourceParent === null || targetParent === null) throw new Error("TreeView move parent is missing");
    if (!("folders" in source)) throw new Error("TreeView move source kind is invalid");
    this.rebaseLoadedFolderPaths(sourcePath, targetPath);
    if (sourcePath === targetPath) {
      if (!TreeViewFolderUtils.UpdateFolder(rootFolder, source)) {
        throw new Error("TreeView folder could not be updated");
      }
    } else {
      if (!TreeViewFolderUtils.DeleteFolder(rootFolder, sourcePath)) {
        throw new Error("TreeView folder could not be removed");
      }
      this._rebaseFolder(source, sourcePath, targetPath);
      if (!TreeViewFolderUtils.AddFolder(rootFolder, source)) {
        throw new Error("TreeView folder could not be added");
      }
    }
    if (sourceParent !== targetParent) {
      sourceParent.properties = structuredClone(sourceProperties);
      sourceParent.folders = this._sortByOrder(sourceParent.folders, sourceParent.properties.folderOrder);
    }
    targetParent.properties = structuredClone(targetProperties);
    targetParent.folders = this._sortByOrder(targetParent.folders, targetParent.properties.folderOrder);
    this._refreshRootFolder();
    return { workspacePath, kind: "folder", sourcePath, targetPath };
  }

  private async _moveItem(
    sourcePath: string,
    targetPath: string,
    targetOrder: number,
  ): Promise<TreeViewEntityPathChange | null> {
    const workspacePath = this._requireWorkspacePath();
    const source = this.findLoadedItemByPath(sourcePath);
    if (source === null) return null;
    const sourceParentPath = dirname(sourcePath);
    const targetParentPath = dirname(targetPath);
    await this._getDataProvider().move({ kind: "item", sourcePath, targetPath, targetOrder });
    const sourceProperties = await this._getDataProvider().getFolderProperties(sourceParentPath);
    const targetProperties = sourceParentPath === targetParentPath
      ? sourceProperties
      : await this._getDataProvider().getFolderProperties(targetParentPath);
    const rootFolder = this._requireRootFolder();
    const sourceParent = TreeViewFolderUtils.GetFolder(rootFolder, sourceParentPath);
    const targetParent = TreeViewFolderUtils.GetFolder(rootFolder, targetParentPath);
    if (sourceParent === null || targetParent === null) throw new Error("TreeView move parent is missing");
    if ("folders" in source) throw new Error("TreeView move source kind is invalid");
    if (sourcePath === targetPath) {
      if (!TreeViewFolderUtils.UpdateItem(rootFolder, source)) {
        throw new Error("TreeView item could not be updated");
      }
    } else {
      if (!TreeViewFolderUtils.DeleteItem(rootFolder, sourcePath)) {
        throw new Error("TreeView item could not be removed");
      }
      source.path = targetPath;
      source.name = basename(targetPath, TREE_VIEW_ITEM_FILE_EXTENSION);
      if (!TreeViewFolderUtils.AddItem(rootFolder, source)) {
        throw new Error("TreeView item could not be added");
      }
    }
    if (sourceParent !== targetParent) {
      sourceParent.properties = structuredClone(sourceProperties);
      sourceParent.items = this._sortByOrder(sourceParent.items, sourceParent.properties.itemOrder);
    }
    targetParent.properties = structuredClone(targetProperties);
    targetParent.items = this._sortByOrder(targetParent.items, targetParent.properties.itemOrder);
    this._refreshRootFolder();
    return { workspacePath, kind: "item", sourcePath, targetPath };
  }

  private _refreshRootFolder(): void {
    if (this._isDisposed || this._rootPublishTimeout !== null) return;
    this._rootPublishTimeout = setTimeout(() => {
      this._rootPublishTimeout = null;
      const rootFolder = this._rootFolder.value;
      this._rootFolder.value = rootFolder === null ? null : { ...rootFolder };
    }, TreeViewExplorerModel._PUBLISH_DELAY_MS);
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
    if (folder.path === sourcePath) folder.name = basename(targetPath);
    folder.path = rebasePath(folder.path);
    for (const child of folder.folders) this._rebaseFolder(child, sourcePath, targetPath);
    for (const item of folder.items) item.path = rebasePath(item.path);
    return folder;
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

  private _getDataProvider(): TreeViewExplorerDataProvider {
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView Explorer DataProvider is not initialized");
    return dataProvider;
  }

  public readonly rootFolder: ComputedRef<TreeViewFolder | null>;

  private static readonly _PUBLISH_DELAY_MS = 50;

  private _dataProvider: TreeViewExplorerDataProvider | null = null;
  private _workspacePath: string | null = null;
  private _isDisposed = false;
  private readonly _rootFolder = shallowRef<TreeViewFolder | null>(null);
  private readonly _loadedFolderPaths = new Set<string>();
  private _rootPublishTimeout: ReturnType<typeof setTimeout> | null = null;
}
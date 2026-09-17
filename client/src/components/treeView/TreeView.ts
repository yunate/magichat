import { computed, shallowRef, type ComputedRef } from "vue";
import { basename, dirname, join, relative } from "pathe";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type {
  TreeViewCloneParams,
  TreeViewCreateItemProperties,
  TreeViewDataProvider,
  TreeViewEntityData,
  TreeViewEntityDataParams,
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewMoveParams,
  TreeViewStorageRoot,
  TreeViewTab,
  TreeViewWorkspace,
  TreeViewWorkspaceRef,
} from "../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION, TreeViewPath } from "../../../../common/treeView";
import { destroyTreeViewDataProvider } from "../../bridge/remote_rpc_objects/treeViewDataProvider";
import { createDefaultTreeViewDataProvider } from "./createDefaultTreeViewDataProvider";
import { TreeViewOperationQueue } from "./treeViewOperationQueue";
import type {
  TreeViewActivateParams,
  TreeViewCloseTabsParams,
  TreeViewReorderTabsParams,
  TreeViewSelection,
  TreeViewSetTabPinnedParams,
  TreeViewSwitchTabParams,
} from "./treeViewTypes";

export type TreeViewOperations = {
  initialize(): Promise<void>;
  reload(): Promise<void>;
  setStorageRoots(storageRoots: readonly TreeViewStorageRoot[]): Promise<void>;
  activate(params: TreeViewActivateParams): Promise<void>;
  promoteTab(params: TreeViewSwitchTabParams): Promise<void>;
  switchTab(params: TreeViewSwitchTabParams): Promise<void>;
  closeTabs(params: TreeViewCloseTabsParams): Promise<void>;
  setTabPinned(params: TreeViewSetTabPinnedParams): Promise<void>;
  reorderTabs(params: TreeViewReorderTabsParams): Promise<void>;
  updateWorkspace(properties: TreeViewWorkspace): Promise<void>;
  switchWorkspace(workspacePath: string): Promise<void>;
  createWorkspace(workspaceName: string): Promise<void>;
  renameWorkspace(workspacePath: string, newName: string): Promise<void>;
  deleteWorkspace(workspacePath: string): Promise<void>;
  createFolder(folderPath: string): Promise<string>;
  createItem(itemPath: string, properties: TreeViewCreateItemProperties): Promise<TreeViewItem>;
  saveDraft(itemId: string, targetFolderId: string, name: string): Promise<void>;
  updateFolder(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData>;
  updateEntityData(params: TreeViewEntityDataParams, data: TreeViewEntityData): Promise<void>;
  openInExplorer(selection: TreeViewSelection): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null>;
  move(params: TreeViewMoveParams): Promise<void>;
};

export type TreeViewOptions = {
  dataProvider?: RemoteObject<TreeViewDataProvider>;
  storageRoots: readonly TreeViewStorageRoot[];
};

export class TreeViewController {
  public initialize(): Promise<void> {
    return this._enqueue(() => this._operations.initialize());
  }

  public emitStorageChanged(): Promise<void> {
    return this._enqueue(() => this._operations.reload());
  }

  public setStorageRoots(storageRoots: readonly TreeViewStorageRoot[]): Promise<void> {
    return this._enqueue(() => this._operations.setStorageRoots(storageRoots));
  }

  public activate(params: TreeViewActivateParams): Promise<void> {
    return this._enqueue(async () => {
      await this._operations.activate(params);
      await this._operations.switchTab({ tabId: params.id });
    });
  }

  public switchTab(params: TreeViewSwitchTabParams): Promise<void> {
    return this._enqueue(() => this._operations.switchTab(params));
  }

  public promoteTab(params: TreeViewSwitchTabParams): Promise<void> {
    return this._enqueue(() => this._operations.promoteTab(params));
  }

  public closeTabs(params: TreeViewCloseTabsParams): Promise<void> {
    return this._enqueue(() => this._operations.closeTabs(params));
  }

  public setTabPinned(params: TreeViewSetTabPinnedParams): Promise<void> {
    return this._enqueue(() => this._operations.setTabPinned(params));
  }

  public reorderTabs(params: TreeViewReorderTabsParams): Promise<void> {
    return this._enqueue(() => this._operations.reorderTabs(params));
  }

  public updateWorkspace(properties: TreeViewWorkspace): Promise<void> {
    return this._enqueue(() => this._operations.updateWorkspace(properties));
  }

  public switchWorkspace(workspacePath: string): Promise<void> {
    return this._enqueue(() => this._operations.switchWorkspace(workspacePath));
  }

  public createWorkspace(workspaceName: string): Promise<void> {
    return this._enqueue(() => this._operations.createWorkspace(workspaceName));
  }

  public renameWorkspace(workspacePath: string, newName: string): Promise<void> {
    return this._enqueue(() => this._operations.renameWorkspace(workspacePath, newName));
  }

  public deleteWorkspace(workspacePath: string): Promise<void> {
    return this._enqueue(() => this._operations.deleteWorkspace(workspacePath));
  }

  public createFolder(folderPath: string): Promise<string> {
    return this._enqueue(() => this._operations.createFolder(folderPath));
  }

  public createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    return this._enqueue(() => this._operations.createItem(itemPath, properties));
  }

  public saveDraft(itemId: string, targetFolderId: string, name: string): Promise<void> {
    return this._enqueue(() => this._operations.saveDraft(itemId, targetFolderId, name));
  }

  public updateFolder(folderPath: string, properties: TreeViewFolderProperties): Promise<void> {
    return this._enqueue(() => this._operations.updateFolder(folderPath, properties));
  }

  public updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    return this._enqueue(() => this._operations.updateItem(itemPath, properties));
  }

  public deleteFolder(folderId: string): Promise<void> {
    return this._enqueue(() => this._operations.deleteFolder(folderId));
  }

  public deleteItem(itemId: string): Promise<void> {
    return this._enqueue(() => this._operations.deleteItem(itemId));
  }

  public getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData> {
    return this._enqueue(() => this._operations.getEntityData(params));
  }

  public updateEntityData(params: TreeViewEntityDataParams, data: TreeViewEntityData): Promise<void> {
    return this._enqueue(() => this._operations.updateEntityData(params, data));
  }

  public openInExplorer(selection: TreeViewSelection): Promise<void> {
    return this._enqueue(() => this._operations.openInExplorer(selection));
  }

  public clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null> {
    return this._enqueue(() => this._operations.clone(params));
  }

  public move(params: TreeViewMoveParams): Promise<void> {
    return this._enqueue(() => this._operations.move(params));
  }

  public constructor(
    operations: TreeViewOperations,
    enqueue: <TResult>(operation: () => Promise<TResult> | TResult) => Promise<TResult>,
  ) {
    this._operations = operations;
    this._enqueue = enqueue;
  }

  private readonly _operations: TreeViewOperations;
  private readonly _enqueue: <TResult>(
    operation: () => Promise<TResult> | TResult,
  ) => Promise<TResult>;
}

export class TreeView {
  public constructor(options: TreeViewOptions) {
    this._dataProvider = options.dataProvider ?? null;
    this._storageRoots = this._validateStorageRoots(options.storageRoots);
    this.operations = {
      initialize: () => this._initialize(),
      reload: () => this._load(),
      setStorageRoots: (storageRoots) => this._setStorageRoots(storageRoots),
      activate: (params) => this._activate(params),
      promoteTab: (params) => this._promoteTab(params),
      switchTab: (params) => this._switchTab(params),
      closeTabs: (params) => this._closeTabs(params),
      setTabPinned: (params) => this._setTabPinned(params),
      reorderTabs: (params) => this._reorderTabs(params),
      updateWorkspace: (properties) => this._updateWorkspace(properties),
      switchWorkspace: (workspacePath) => this._switchWorkspace(workspacePath),
      createWorkspace: (workspaceName) => this._createWorkspace(workspaceName),
      renameWorkspace: (workspacePath, newName) => this._renameWorkspace(workspacePath, newName),
      deleteWorkspace: (workspacePath) => this._deleteWorkspace(workspacePath),
      createFolder: (folderPath) => this._createFolder(folderPath),
      createItem: (itemPath, properties) => this._createItem(itemPath, properties),
      saveDraft: (itemId, targetFolderId, name) => this._saveDraft(itemId, targetFolderId, name),
      updateFolder: (folderPath, properties) => this._updateFolder(folderPath, properties),
      updateItem: (itemPath, properties) => this._updateItem(itemPath, properties),
      deleteFolder: (folderId) => this._deleteFolder(folderId),
      deleteItem: (itemId) => this._deleteItem(itemId),
      getEntityData: (params) => this.dataProvider.getEntityData(params),
      updateEntityData: (params, data) => this.dataProvider.updateEntityData(params, data),
      openInExplorer: (selection) => this._openInExplorer(selection),
      clone: (params) => this._clone(params),
      move: (params) => this._move(params),
    };
    this.controller = new TreeViewController(
      this.operations,
      <TResult>(operation: () => Promise<TResult> | TResult) => this._queue.enqueue(operation),
    );
    this.workspaceRefs = computed(() => this._state.value.workspaceRefs);
    this.selectedWorkspaceRef = computed(() => this._state.value.selectedWorkspaceRef);
    this.workspace = computed(() => this._state.value.workspace);
    this.rootFolder = computed(() => this._state.value.rootFolder);
    this.selection = computed(() => this._state.value.selection);
    this.previewTabId = computed(() => this._state.value.workspace?.previewTabId ?? null);
  }

  public get dataProvider(): RemoteObject<TreeViewDataProvider> {
    const provider = this._dataProvider;
    if (provider === null) throw new Error("TreeView DataProvider is not initialized");
    return provider;
  }

  public get storageRoots(): readonly TreeViewStorageRoot[] {
    return this._storageRoots;
  }

  public async dispose(): Promise<void> {
    if (!this._ownsDataProvider) return;
    const provider = this._dataProvider;
    this._dataProvider = null;
    this._ownsDataProvider = false;
    if (provider !== null) await destroyTreeViewDataProvider(provider);
  }

  public getFolderById(id: string): TreeViewFolder | null {
    return this._folderById.get(id) ?? null;
  }

  public getItemById(id: string): TreeViewItem | null {
    return this._itemById.get(id) ?? null;
  }

  public getItemByPath(path: string): TreeViewItem | null {
    return this._itemByPath.get(path) ?? null;
  }

  public get activeTab(): TreeViewTab | null {
    const workspace = this._state.value.workspace;
    return workspace?.tabs.find((tab) => tab.id === workspace.activeTabId) ?? null;
  }

  private async _initialize(): Promise<void> {
    if (this._dataProvider === null) {
      this._dataProvider = await createDefaultTreeViewDataProvider(this.controller);
      this._ownsDataProvider = true;
    }
    await this._load();
  }

  private async _load(): Promise<void> {
    const workspaceRefs = await this._loadWorkspaceRefs();
    let firstWorkspace: TreeViewWorkspace | null = null;
    for (const workspaceRef of workspaceRefs) {
      const candidate = await this.dataProvider.getWorkspaceProperties(workspaceRef.workspacePath);
      firstWorkspace ??= candidate;
      if (candidate.isSelected) {
        await this._loadWorkspace(workspaceRef, candidate, workspaceRefs);
        return;
      }
    }
    const firstWorkspaceRef = workspaceRefs[0];
    if (firstWorkspaceRef === undefined) {
      this._install({
        workspaceRefs,
        selectedWorkspaceRef: null,
        workspace: null,
        rootFolder: null,
      });
      return;
    }
    if (firstWorkspace === null) throw new Error("TreeView first workspace is unavailable");
    const selectedWorkspace = { ...firstWorkspace, isSelected: true };
    await this.dataProvider.updateWorkspaceProperties(
      firstWorkspaceRef.workspacePath,
      selectedWorkspace,
    );
    await this._loadWorkspace(firstWorkspaceRef, selectedWorkspace, workspaceRefs);
  }

  private async _setStorageRoots(storageRoots: readonly TreeViewStorageRoot[]): Promise<void> {
    this._storageRoots = this._validateStorageRoots(storageRoots);
    await this._load();
  }

  private async _activate(params: TreeViewActivateParams): Promise<void> {
    const entity = params.kind === "folder"
      ? this.getFolderById(params.id)
      : this.getItemById(params.id);
    if (entity === null) throw new Error("TreeView activation target is missing");
    await this._expandAncestors(entity.path);
    const workspace = this._requireWorkspaceClone();
    const existingIndex = workspace.tabs.findIndex((tab) => tab.id === params.id);
    let hasReplacedActivePreview = false;
    if (existingIndex < 0 && params.openMode !== "normal" && params.openMode !== "pinned") {
      const previewTabId = workspace.previewTabId;
      if (previewTabId !== null) {
        const previewIndex = workspace.tabs.findIndex((tab) => tab.id === previewTabId);
        if (previewIndex >= 0) {
          workspace.tabs[previewIndex] = { kind: params.kind, id: params.id, isPinned: false };
          workspace.previewTabId = params.id;
          if (workspace.activeTabId === previewTabId) {
            workspace.activeTabId = params.id;
            hasReplacedActivePreview = true;
          }
        }
      }
    }
    const isNewTab = !workspace.tabs.some((tab) => tab.id === params.id);
    if (isNewTab) {
      workspace.tabs.push({ kind: params.kind, id: params.id, isPinned: false });
    }
    if (params.openMode === "pinned") {
      this._pinTab(workspace, params.id, true);
      this._clearPreviewTab(workspace, params.id);
    } else if (params.openMode === "normal") {
      this._clearPreviewTab(workspace, params.id);
    } else if (isNewTab) {
      workspace.previewTabId = params.id;
    }
    const isFirstTab = workspace.activeTabId === null;
    if (isFirstTab) workspace.activeTabId = params.id;
    this._state.value = {
      ...this._state.value,
      workspace,
      selection: isFirstTab || hasReplacedActivePreview
        ? { kind: params.kind, id: params.id }
        : this._state.value.selection,
    };
    await this._saveWorkspace(workspace);
  }

  private async _promoteTab(params: TreeViewSwitchTabParams): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    if (!workspace.tabs.some((tab) => tab.id === params.tabId)) {
      throw new Error("TreeView tab is missing");
    }
    if (workspace.previewTabId !== params.tabId) return;
    this._clearPreviewTab(workspace, params.tabId);
    this._state.value = { ...this._state.value, workspace };
    await this._saveWorkspace(workspace);
  }

  private async _switchTab(params: TreeViewSwitchTabParams): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    const tab = workspace.tabs.find((candidate) => candidate.id === params.tabId);
    if (tab === undefined) throw new Error("TreeView tab is missing");
    if (workspace.activeTabId === params.tabId) return;
    workspace.activeTabId = params.tabId;
    this._state.value = {
      ...this._state.value,
      workspace,
      selection: { kind: tab.kind, id: tab.id },
    };
    await this._saveWorkspace(workspace);
  }

  private async _closeTabs(params: TreeViewCloseTabsParams): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    const closingIds = new Set(params.tabIds);
    const currentTabs = workspace.tabs;
    const activeIndex = currentTabs.findIndex((tab) => tab.id === workspace.activeTabId);
    workspace.tabs = currentTabs.filter((tab) => !closingIds.has(tab.id));
    if (workspace.previewTabId !== null && closingIds.has(workspace.previewTabId)) {
      workspace.previewTabId = null;
    }
    if (workspace.activeTabId !== null && closingIds.has(workspace.activeTabId)) {
      const preferred = params.preferredActiveId;
      workspace.activeTabId = preferred !== undefined
        && workspace.tabs.some((tab) => tab.id === preferred)
        ? preferred
        : workspace.tabs[Math.min(activeIndex, workspace.tabs.length - 1)]?.id ?? null;
    }
    this._state.value = {
      ...this._state.value,
      workspace,
      selection: this._selectionForTab(workspace.activeTabId),
    };
    await this._saveWorkspace(workspace);
  }

  private async _setTabPinned(params: TreeViewSetTabPinnedParams): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    this._pinTab(workspace, params.tabId, params.isPinned);
    if (params.isPinned) this._clearPreviewTab(workspace, params.tabId);
    this._state.value = { ...this._state.value, workspace };
    await this._saveWorkspace(workspace);
  }

  private async _reorderTabs(params: TreeViewReorderTabsParams): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    const sourceIndex = workspace.tabs.findIndex((tab) => tab.id === params.draggedId);
    const targetIndex = workspace.tabs.findIndex((tab) => tab.id === params.targetId);
    const tab = workspace.tabs[sourceIndex];
    const targetTab = workspace.tabs[targetIndex];
    if (tab === undefined || targetTab === undefined) throw new Error("TreeView reorder tab is missing");
    if (tab.isPinned !== targetTab.isPinned) {
      throw new Error("TreeView tabs cannot be reordered across the pinned boundary");
    }
    workspace.tabs.splice(sourceIndex, 1);
    const adjustedTarget = workspace.tabs.findIndex((candidate) => candidate.id === params.targetId);
    workspace.tabs.splice(adjustedTarget + (params.position === "after" ? 1 : 0), 0, tab);
    this._state.value = { ...this._state.value, workspace };
    await this._saveWorkspace(workspace);
  }

  private async _updateWorkspace(properties: TreeViewWorkspace): Promise<void> {
    this._state.value = { ...this._state.value, workspace: structuredClone(properties) };
    await this._saveWorkspace(properties);
  }

  private async _switchWorkspace(workspacePath: string): Promise<void> {
    const currentRef = this._state.value.selectedWorkspaceRef;
    const currentWorkspace = this._state.value.workspace;
    if (currentRef?.workspacePath === workspacePath) return;
    const targetRef = this._state.value.workspaceRefs.find(
      (workspaceRef) => workspaceRef.workspacePath === workspacePath,
    );
    if (targetRef === undefined) throw new Error("TreeView workspace is missing");
    if (currentRef !== null && currentWorkspace !== null) {
      await this.dataProvider.updateWorkspaceProperties(
        currentRef.workspacePath,
        { ...structuredClone(currentWorkspace), isSelected: false },
      );
    }
    const target = await this.dataProvider.getWorkspaceProperties(workspacePath);
    await this.dataProvider.updateWorkspaceProperties(
      workspacePath,
      { ...target, isSelected: true },
    );
    await this._loadWorkspace(targetRef, { ...target, isSelected: true });
  }

  private async _createWorkspace(workspaceName: string): Promise<void> {
    const root = this._selectedStorageRoot() ?? this.storageRoots[0];
    if (root === undefined) throw new Error("TreeView requires a storage root");
    const workspacePath = await this.dataProvider.createWorkspace(
      root.path,
      workspaceName,
      this._state.value.selectedWorkspaceRef === null,
    );
    const workspaceRef: TreeViewWorkspaceRef = {
      rootKey: root.key,
      workspacePath,
      workspaceName: basename(workspacePath),
    };
    const workspaceRefs = this._sortWorkspaceRefs([...this._state.value.workspaceRefs, workspaceRef]);
    if (this._state.value.selectedWorkspaceRef === null) {
      const properties = await this.dataProvider.getWorkspaceProperties(workspacePath);
      await this._loadWorkspace(workspaceRef, properties, workspaceRefs);
      return;
    }
    this._setWorkspaceRefs(workspaceRefs);
  }

  private async _renameWorkspace(workspacePath: string, newName: string): Promise<void> {
    const targetPath = await this.dataProvider.renameWorkspace(workspacePath, newName);
    const workspaceRefs = this._state.value.workspaceRefs.map((workspaceRef) => (
      workspaceRef.workspacePath === workspacePath
        ? { ...workspaceRef, workspacePath: targetPath, workspaceName: basename(targetPath) }
        : workspaceRef
    ));
    const selectedWorkspaceRef = this._state.value.selectedWorkspaceRef;
    if (selectedWorkspaceRef?.workspacePath !== workspacePath) {
      this._setWorkspaceRefs(workspaceRefs);
      return;
    }
    const rootFolder = this._state.value.rootFolder;
    if (rootFolder === null) throw new Error("TreeView workspace root is missing");
    this._install({
      workspaceRefs: this._sortWorkspaceRefs(workspaceRefs),
      selectedWorkspaceRef: {
        ...selectedWorkspaceRef,
        workspacePath: targetPath,
        workspaceName: basename(targetPath),
      },
      workspace: this._state.value.workspace,
      rootFolder: this._rebaseFolder(rootFolder, workspacePath, targetPath),
    });
  }

  private async _deleteWorkspace(workspacePath: string): Promise<void> {
    const isSelected = this._state.value.selectedWorkspaceRef?.workspacePath === workspacePath;
    const deletedIndex = this._state.value.workspaceRefs.findIndex(
      (workspaceRef) => workspaceRef.workspacePath === workspacePath,
    );
    if (deletedIndex < 0) throw new Error("TreeView workspace is missing");
    const workspaceRefs = this._state.value.workspaceRefs.filter(
      (workspaceRef) => workspaceRef.workspacePath !== workspacePath,
    );
    await this.dataProvider.deleteWorkspace(workspacePath);
    if (!isSelected) {
      this._setWorkspaceRefs(workspaceRefs);
      return;
    }
    const replacement = workspaceRefs[Math.min(deletedIndex, workspaceRefs.length - 1)] ?? null;
    if (replacement !== null) {
      const properties = await this.dataProvider.getWorkspaceProperties(replacement.workspacePath);
      const selectedProperties = { ...properties, isSelected: true };
      await this.dataProvider.updateWorkspaceProperties(replacement.workspacePath, selectedProperties);
      await this._loadWorkspace(replacement, selectedProperties, workspaceRefs);
      return;
    }
    this._install({
      workspaceRefs: [],
      selectedWorkspaceRef: null,
      workspace: null,
      rootFolder: null,
    });
  }

  private async _createFolder(folderPath: string): Promise<string> {
    const folderId = await this.dataProvider.createFolder(folderPath);
    const parentPath = dirname(folderPath);
    const folder = await this.dataProvider.getFolder(folderPath);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    this._commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "folder",
      folderId,
      folder,
    ));
    return folderId;
  }

  private async _createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    const item = await this.dataProvider.createItem(
      itemPath,
      properties,
    );
    const parentPath = dirname(itemPath);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    this._commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      item.properties.id,
      item,
    ));
    return item;
  }

  private async _saveDraft(
    itemId: string,
    targetFolderId: string,
    name: string,
  ): Promise<void> {
    const item = this.getItemById(itemId);
    const targetFolder = this.getFolderById(targetFolderId);
    if (item === null || !item.properties.isDraft) throw new Error("TreeView draft is missing");
    if (targetFolder === null) throw new Error("TreeView target folder is missing");
    const trimmedName = name.trim();
    if (trimmedName.length === 0) throw new Error("TreeView item name is required");
    const targetPath = join(targetFolder.path, `${trimmedName}${TREE_VIEW_ITEM_FILE_EXTENSION}`);
    await this.dataProvider.move({
      kind: "item",
      sourcePath: item.path,
      targetPath,
      targetOrder: targetFolder.items.filter((candidate) => !candidate.properties.isDraft).length,
    });
    await this.dataProvider.updateItem(targetPath, {
      ...structuredClone(item.properties),
      isDraft: false,
    });
    const savedItem = await this.dataProvider.getItem(targetPath);
    const sourceParentPath = dirname(item.path);
    let rootFolder = this._requireRootFolder();
    if (sourceParentPath === targetFolder.path) {
      const properties = await this.dataProvider.getFolderProperties(targetFolder.path);
      rootFolder = this._replaceChild(
        rootFolder,
        targetFolder.path,
        properties,
        "item",
        itemId,
        savedItem,
      );
    } else {
      const sourceProperties = await this.dataProvider.getFolderProperties(sourceParentPath);
      const targetProperties = await this.dataProvider.getFolderProperties(targetFolder.path);
      rootFolder = this._replaceChild(
        rootFolder,
        sourceParentPath,
        sourceProperties,
        "item",
        itemId,
        null,
      );
      rootFolder = this._replaceChild(
        rootFolder,
        targetFolder.path,
        targetProperties,
        "item",
        itemId,
        savedItem,
      );
    }
    this._commitRootFolder(rootFolder);
    await this._activate({ kind: "item", id: itemId, openMode: "normal" });
  }

  private async _updateFolder(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    await this.dataProvider.updateFolderProperties(folderPath, properties);
    const folder = this._folderByPath.get(folderPath);
    if (folder === undefined) throw new Error("TreeView folder is missing");
    this._commitRootFolder(this._updateFolderNode(
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

  private async _updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    const item = this._itemByPath.get(itemPath);
    if (item === undefined) throw new Error("TreeView item is missing");
    await this.dataProvider.updateItem(itemPath, properties);
    const parentPath = dirname(itemPath);
    const parent = this._folderByPath.get(parentPath);
    if (parent === undefined) throw new Error("TreeView item parent is missing");
    const itemOrder = properties.isDraft
      ? parent.properties.itemOrder.filter((name) => name !== item.name)
      : parent.properties.itemOrder.includes(item.name)
        ? [...parent.properties.itemOrder]
        : [...parent.properties.itemOrder, item.name];
    this._commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      { ...structuredClone(parent.properties), itemOrder },
      "item",
      item.properties.id,
      { ...item, properties: structuredClone(properties) },
    ));
  }

  private async _deleteFolder(folderId: string): Promise<void> {
    const folder = this.getFolderById(folderId);
    if (folder === null) throw new Error("TreeView folder is missing");
    const parentPath = dirname(folder.path);
    await this.dataProvider.deleteFolder(folder.path);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    const rootFolder = this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "folder",
      folderId,
      null,
    );
    await this._commitDeletedRootFolder(rootFolder);
  }

  private async _deleteItem(itemId: string): Promise<void> {
    const item = this.getItemById(itemId);
    if (item === null) throw new Error("TreeView item is missing");
    const parentPath = dirname(item.path);
    await this.dataProvider.deleteItem(item.path);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    const rootFolder = this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      itemId,
      null,
    );
    await this._commitDeletedRootFolder(rootFolder);
  }

  private async _openInExplorer(selection: TreeViewSelection): Promise<void> {
    const entity = selection.kind === "folder"
      ? this.getFolderById(selection.id)
      : this.getItemById(selection.id);
    if (entity === null) throw new Error("TreeView Explorer target is missing");
    await this.dataProvider.openInExplorer(selection.kind, entity.path);
  }

  private async _clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null> {
    await this.dataProvider.clone(params);
    if (params.kind === "workspace") {
      const root = this._rootForWorkspacePath(params.targetPath);
      if (root === null) throw new Error("TreeView clone storage root is missing");
      this._setWorkspaceRefs([...this._state.value.workspaceRefs, {
        rootKey: root.key,
        workspacePath: params.targetPath,
        workspaceName: basename(params.targetPath),
      }]);
      return null;
    }
    const parentPath = dirname(params.targetPath);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    if (params.kind === "folder") {
      const folder = await this.dataProvider.getFolder(params.targetPath);
      this._commitRootFolder(this._replaceChild(
        this._requireRootFolder(),
        parentPath,
        parentProperties,
        "folder",
        folder.properties.id,
        folder,
      ));
      return folder;
    }
    const item = await this.dataProvider.getItem(params.targetPath);
    this._commitRootFolder(this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      item.properties.id,
      item,
    ));
    return item;
  }

  private async _move(params: TreeViewMoveParams): Promise<void> {
    const source = params.kind === "folder"
      ? this._folderByPath.get(params.sourcePath)
      : this._itemByPath.get(params.sourcePath);
    if (source === undefined) throw new Error("TreeView move source is missing");
    const sourceParentPath = dirname(params.sourcePath);
    const targetParentPath = dirname(params.targetPath);
    await this.dataProvider.move(params);
    const sourceProperties = await this.dataProvider.getFolderProperties(sourceParentPath);
    const targetProperties = sourceParentPath === targetParentPath
      ? sourceProperties
      : await this.dataProvider.getFolderProperties(targetParentPath);
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
    this._commitRootFolder(rootFolder);
  }

  private async _expandAncestors(entityPath: string): Promise<void> {
    let parentPath = dirname(entityPath);
    let rootFolder = this._requireRootFolder();
    let hasChanged = false;
    while (true) {
      const folder = this._folderByPath.get(parentPath);
      if (folder !== undefined && !folder.properties.isExpanded) {
        const properties = { ...structuredClone(folder.properties), isExpanded: true };
        await this.dataProvider.updateFolderProperties(folder.path, properties);
        rootFolder = this._updateFolderNode(
          rootFolder,
          folder.path,
          (current) => ({ ...current, properties }),
        );
        hasChanged = true;
      }
      if (parentPath === this._state.value.selectedWorkspaceRef?.workspacePath) break;
      const nextParentPath = dirname(parentPath);
      if (nextParentPath === parentPath) break;
      parentPath = nextParentPath;
    }
    if (hasChanged) this._commitRootFolder(rootFolder);
  }

  private async _loadWorkspace(
    workspaceRef: TreeViewWorkspaceRef,
    workspaceProperties?: TreeViewWorkspace,
    workspaceRefs: readonly TreeViewWorkspaceRef[] = this._state.value.workspaceRefs,
  ): Promise<void> {
    const workspace = workspaceProperties
      ?? await this.dataProvider.getWorkspaceProperties(workspaceRef.workspacePath);
    const rootFolder = await this.dataProvider.getFolder(workspaceRef.workspacePath);
    const normalizedWorkspace = this._pruneUnavailableTabs(workspace, rootFolder);
    if (normalizedWorkspace !== workspace) {
      await this.dataProvider.updateWorkspaceProperties(
        workspaceRef.workspacePath,
        normalizedWorkspace,
      );
    }
    this._install({
      workspaceRefs,
      selectedWorkspaceRef: workspaceRef,
      workspace: normalizedWorkspace,
      rootFolder,
    });
  }

  private _requireRootFolder(): TreeViewFolder {
    const rootFolder = this._state.value.rootFolder;
    if (rootFolder === null) throw new Error("TreeView root folder is not loaded");
    return rootFolder;
  }

  private _setWorkspaceRefs(workspaceRefs: readonly TreeViewWorkspaceRef[]): void {
    this._state.value = {
      ...this._state.value,
      workspaceRefs: this._sortWorkspaceRefs(workspaceRefs),
    };
  }

  private _commitRootFolder(rootFolder: TreeViewFolder): void {
    this._install({
      workspaceRefs: this._state.value.workspaceRefs,
      selectedWorkspaceRef: this._state.value.selectedWorkspaceRef,
      workspace: this._state.value.workspace,
      rootFolder,
    });
  }

  private async _commitDeletedRootFolder(rootFolder: TreeViewFolder): Promise<void> {
    const workspace = this._state.value.workspace;
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    const normalizedWorkspace = this._pruneUnavailableTabs(workspace, rootFolder);
    if (normalizedWorkspace !== workspace) await this._saveWorkspace(normalizedWorkspace);
    this._install({
      workspaceRefs: this._state.value.workspaceRefs,
      selectedWorkspaceRef: this._state.value.selectedWorkspaceRef,
      workspace: normalizedWorkspace,
      rootFolder,
    });
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

  private _updateFolderNode(
    rootFolder: TreeViewFolder,
    folderPath: string,
    update: (folder: TreeViewFolder) => TreeViewFolder,
  ): TreeViewFolder {
    const updated = this._tryUpdateFolderNode(rootFolder, folderPath, update);
    if (updated === null) throw new Error("TreeView folder is missing");
    return updated;
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
    sourceWorkspacePath: string,
    targetWorkspacePath: string,
  ): TreeViewFolder {
    const rebasePath = (path: string): string => {
      const relativePath = relative(sourceWorkspacePath, path);
      return relativePath.length === 0 ? targetWorkspacePath : join(targetWorkspacePath, relativePath);
    };
    return {
      ...folder,
      path: rebasePath(folder.path),
      name: folder.path === sourceWorkspacePath ? basename(targetWorkspacePath) : folder.name,
      folders: folder.folders.map((child) => this._rebaseFolder(
        child,
        sourceWorkspacePath,
        targetWorkspacePath,
      )),
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

  private _sortWorkspaceRefs(
    workspaceRefs: readonly TreeViewWorkspaceRef[],
  ): TreeViewWorkspaceRef[] {
    return [...workspaceRefs].sort((left, right) => {
      const rootOrder = this.storageRoots.findIndex((root) => root.key === left.rootKey)
        - this.storageRoots.findIndex((root) => root.key === right.rootKey);
      return rootOrder !== 0
        ? rootOrder
        : left.workspaceName.localeCompare(right.workspaceName, "en-US");
    });
  }

  private _pinTab(workspace: TreeViewWorkspace, tabId: string, isPinned: boolean): void {
    const index = workspace.tabs.findIndex((tab) => tab.id === tabId);
    const tab = workspace.tabs[index];
    if (tab === undefined) throw new Error("TreeView tab is missing");
    if (tab.isPinned === isPinned) return;
    workspace.tabs.splice(index, 1);
    tab.isPinned = isPinned;
    const firstUnpinned = workspace.tabs.findIndex((candidate) => !candidate.isPinned);
    const insertionIndex = isPinned
      ? firstUnpinned < 0 ? workspace.tabs.length : firstUnpinned
      : firstUnpinned < 0 ? workspace.tabs.length : firstUnpinned;
    workspace.tabs.splice(insertionIndex, 0, tab);
  }

  private _clearPreviewTab(workspace: TreeViewWorkspace, tabId: string): void {
    if (workspace.previewTabId === tabId) workspace.previewTabId = null;
  }

  private _selectionForTab(tabId: string | null): TreeViewSelection | null {
    if (tabId === null) return null;
    if (this._folderById.has(tabId)) return { kind: "folder", id: tabId };
    if (this._itemById.has(tabId)) return { kind: "item", id: tabId };
    return null;
  }

  private _requireWorkspaceClone(): TreeViewWorkspace {
    const workspace = this._state.value.workspace;
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    return structuredClone(workspace);
  }

  private async _saveWorkspace(workspace: TreeViewWorkspace): Promise<void> {
    const workspaceRef = this._state.value.selectedWorkspaceRef;
    if (workspaceRef === null) throw new Error("TreeView workspace is not selected");
    await this.dataProvider.updateWorkspaceProperties(workspaceRef.workspacePath, workspace);
  }

  private _install(state: {
    workspaceRefs: readonly TreeViewWorkspaceRef[];
    selectedWorkspaceRef: TreeViewWorkspaceRef | null;
    workspace: TreeViewWorkspace | null;
    rootFolder: TreeViewFolder | null;
  }): void {
    this._folderById = new Map();
    this._folderByPath = new Map();
    this._itemById = new Map();
    this._itemByPath = new Map();
    if (state.rootFolder !== null) this._indexFolder(state.rootFolder);
    const tabs = state.workspace?.tabs.filter((tab) => (
      tab.kind === "folder" ? this._folderById.has(tab.id) : this._itemById.has(tab.id)
    )) ?? [];
    const workspace = state.workspace === null ? null : {
      ...state.workspace,
      tabs,
      activeTabId: tabs.some((tab) => tab.id === state.workspace?.activeTabId)
        ? state.workspace.activeTabId
        : tabs[0]?.id ?? null,
      previewTabId: tabs.some((tab) => (
        tab.id === state.workspace?.previewTabId && !tab.isPinned
      )) ? state.workspace.previewTabId : null,
    };
    this._state.value = {
      ...state,
      workspace,
      selection: this._selectionForTab(workspace?.activeTabId ?? null),
    };
  }

  private _pruneUnavailableTabs(
    workspace: TreeViewWorkspace,
    rootFolder: TreeViewFolder,
  ): TreeViewWorkspace {
    const folderIds = new Set<string>();
    const itemIds = new Set<string>();
    const pending = [rootFolder];
    while (pending.length > 0) {
      const folder = pending.pop();
      if (folder === undefined) continue;
      folderIds.add(folder.properties.id);
      for (const item of folder.items) itemIds.add(item.properties.id);
      pending.push(...folder.folders);
    }
    const tabs = workspace.tabs.filter((tab) => (
      tab.kind === "folder" ? folderIds.has(tab.id) : itemIds.has(tab.id)
    ));
    if (tabs.length === workspace.tabs.length) return workspace;
    const activeTabId = workspace.activeTabId !== null
      && tabs.some((tab) => tab.id === workspace.activeTabId)
      ? workspace.activeTabId
      : tabs[0]?.id ?? null;
    const previewTabId = workspace.previewTabId !== null
      && tabs.some((tab) => tab.id === workspace.previewTabId)
      ? workspace.previewTabId
      : null;
    return { ...workspace, tabs, activeTabId, previewTabId };
  }

  private _indexFolder(folder: TreeViewFolder): void {
    if (this._folderById.has(folder.properties.id)) {
      folder.properties.id = crypto.randomUUID();
      void this.dataProvider.repairEntityId(
        { kind: "folder", path: folder.path },
        folder.properties.id,
      );
    }
    this._folderById.set(folder.properties.id, folder);
    this._folderByPath.set(folder.path, folder);
    for (const item of folder.items) {
      if (this._itemById.has(item.properties.id)) {
        item.properties.id = crypto.randomUUID();
        void this.dataProvider.repairEntityId(
          { kind: "item", path: item.path },
          item.properties.id,
        );
      }
      this._itemById.set(item.properties.id, item);
      this._itemByPath.set(item.path, item);
    }
    for (const child of folder.folders) this._indexFolder(child);
  }

  private async _loadWorkspaceRefs(): Promise<TreeViewWorkspaceRef[]> {
    const workspaceRefs: TreeViewWorkspaceRef[] = [];
    for (const root of this.storageRoots) {
      const workspacePaths = await this.dataProvider.getWorkspaces(root.path);
      for (const workspacePath of workspacePaths) {
        workspaceRefs.push({
          rootKey: root.key,
          workspacePath,
          workspaceName: basename(workspacePath),
        });
      }
    }
    return this._sortWorkspaceRefs(workspaceRefs);
  }

  private _validateStorageRoots(roots: readonly TreeViewStorageRoot[]): readonly TreeViewStorageRoot[] {
    const keys = new Set<string>();
    const paths = new Set<string>();
    return roots.map((root) => {
      const key = root.key.trim();
      if (key.length === 0) throw new Error("TreeView storage root key is required");
      const normalizedKey = key.toLocaleLowerCase("en-US");
      if (keys.has(normalizedKey)) throw new Error("TreeView storage root keys must be unique");
      keys.add(normalizedKey);
      const storagePath = TreeViewPath.normalize(root.path, "TreeView storage root path");
      const normalizedPath = storagePath.toLocaleLowerCase("en-US");
      if (paths.has(normalizedPath)) throw new Error("TreeView storage root paths must be unique");
      paths.add(normalizedPath);
      return { key, path: storagePath };
    });
  }

  private _rootForWorkspacePath(workspacePath: string): TreeViewStorageRoot | null {
    const rootPath = dirname(workspacePath);
    return this.storageRoots.find((root) => root.path === rootPath) ?? null;
  }

  private _selectedStorageRoot(): TreeViewStorageRoot | null {
    const selected = this._state.value.selectedWorkspaceRef;
    return selected === null ? null : this._rootForWorkspacePath(selected.workspacePath);
  }

  public readonly controller: TreeViewController;
  public readonly operations: TreeViewOperations;
  public readonly workspaceRefs: ComputedRef<readonly TreeViewWorkspaceRef[]>;
  public readonly selectedWorkspaceRef: ComputedRef<TreeViewWorkspaceRef | null>;
  public readonly workspace: ComputedRef<TreeViewWorkspace | null>;
  public readonly rootFolder: ComputedRef<TreeViewFolder | null>;
  public readonly selection: ComputedRef<TreeViewSelection | null>;
  public readonly previewTabId: ComputedRef<string | null>;

  private readonly _queue = new TreeViewOperationQueue();
  private _dataProvider: RemoteObject<TreeViewDataProvider> | null;
  private _ownsDataProvider = false;
  private _storageRoots: readonly TreeViewStorageRoot[];
  private readonly _state = shallowRef<{
    workspaceRefs: readonly TreeViewWorkspaceRef[];
    selectedWorkspaceRef: TreeViewWorkspaceRef | null;
    workspace: TreeViewWorkspace | null;
    rootFolder: TreeViewFolder | null;
    selection: TreeViewSelection | null;
  }>({
    workspaceRefs: [],
    selectedWorkspaceRef: null,
    workspace: null,
    rootFolder: null,
    selection: null,
  });
  private _folderById = new Map<string, TreeViewFolder>();
  private _folderByPath = new Map<string, TreeViewFolder>();
  private _itemById = new Map<string, TreeViewItem>();
  private _itemByPath = new Map<string, TreeViewItem>();
}
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
import { TreeViewBackgroundTaskQueue } from "./treeViewBackgroundTaskQueue";
import { TreeViewOperationQueue } from "./treeViewOperationQueue";
import type {
  TreeViewActivateParams,
  TreeViewCloseTabsParams,
  TreeViewReorderTabsParams,
  TreeViewSaveDraftParams,
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
  loadFolderChildren(folderPath: string): Promise<TreeViewFolder>;
  createItem(itemPath: string, properties: TreeViewCreateItemProperties): Promise<TreeViewItem>;
  discardDraft(itemId: string): Promise<void>;
  saveDraft(params: TreeViewSaveDraftParams): Promise<void>;
  updateFolder(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData>;
  updateEntityData(params: TreeViewEntityDataParams, data: TreeViewEntityData): Promise<void>;
  openInExplorer(selection: TreeViewSelection): Promise<void>;
  openPathInExplorer(kind: "folder" | "item", path: string): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null>;
  move(params: TreeViewMoveParams): Promise<void>;
};

export type TreeViewOptions = {
  dataProvider?: RemoteObject<TreeViewDataProvider>;
  storageRoots: readonly TreeViewStorageRoot[];
};

type RemoteOperationCompletion = {
  resolve: () => void;
  reject: (reason: Error) => void;
};

export class TreeViewController {
  public emitOperationCompleted(operationId: string, errorMessage: string | null): void {
    this._operationCompletionHandler(operationId, errorMessage);
  }

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

  public loadFolderChildren(folderPath: string): Promise<TreeViewFolder> {
    return this._enqueue(() => this._operations.loadFolderChildren(folderPath));
  }

  public createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    return this._enqueue(() => this._operations.createItem(itemPath, properties));
  }

  public discardDraft(itemId: string): Promise<void> {
    return this._enqueue(() => this._operations.discardDraft(itemId));
  }

  public saveDraft(params: TreeViewSaveDraftParams): Promise<void> {
    return this._enqueue(() => this._operations.saveDraft(params));
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

  public openPathInExplorer(kind: "folder" | "item", path: string): Promise<void> {
    return this._enqueue(() => this._operations.openPathInExplorer(kind, path));
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
    operationCompletionHandler: (operationId: string, errorMessage: string | null) => void,
  ) {
    this._operations = operations;
    this._enqueue = enqueue;
    this._operationCompletionHandler = operationCompletionHandler;
  }

  private readonly _operations: TreeViewOperations;
  private readonly _enqueue: <TResult>(
    operation: () => Promise<TResult> | TResult,
  ) => Promise<TResult>;
  private readonly _operationCompletionHandler: (
    operationId: string,
    errorMessage: string | null,
  ) => void;
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
      loadFolderChildren: (folderPath) => this._loadFolderChildren(folderPath),
      createItem: (itemPath, properties) => this._createItem(itemPath, properties),
      discardDraft: (itemId) => this._discardDraft(itemId),
      saveDraft: (params) => this._saveDraft(params),
      updateFolder: (folderPath, properties) => this._updateFolder(folderPath, properties),
      updateItem: (itemPath, properties) => this._updateItem(itemPath, properties),
      deleteFolder: (folderId) => this._deleteFolder(folderId),
      deleteItem: (itemId) => this._deleteItem(itemId),
      getEntityData: (params) => this.dataProvider.getEntityData(params),
      updateEntityData: (params, data) => this.dataProvider.updateEntityData(params, data),
      openInExplorer: (selection) => this._openInExplorer(selection),
      openPathInExplorer: (kind, path) => this._openPathInExplorer(kind, path),
      clone: (params) => this._clone(params),
      move: (params) => this._move(params),
    };
    this.controller = new TreeViewController(
      this.operations,
      <TResult>(operation: () => Promise<TResult> | TResult) => this._queue.enqueue(operation),
      (operationId, errorMessage) => this._completeRemoteOperation(operationId, errorMessage),
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

  public enqueueBackgroundTask(task: () => Promise<void> | void): void {
    this._backgroundTasks.enqueue(task);
  }

  public startBackgroundTasks(): void {
    this._backgroundTasks.start();
  }

  public pauseBackgroundTasks(): void {
    this._backgroundTasks.pause();
  }

  public async dispose(): Promise<void> {
    this._backgroundTasks.dispose();
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

  public findLoadedFolderByPath(path: string): TreeViewFolder | null {
    return this._folderByPath.get(path) ?? null;
  }

  public findLoadedItemByPath(path: string): TreeViewItem | null {
    return this._itemByPath.get(path) ?? null;
  }

  public async resolveFolderByPath(path: string): Promise<TreeViewFolder> {
    this._ensureCurrentWorkspacePath(path);
    return this.dataProvider.getFolder(path, 1);
  }

  public async resolveItemByPath(path: string): Promise<TreeViewItem> {
    this._ensureCurrentWorkspacePath(path);
    return this.dataProvider.getItem(path);
  }

  public async resolveTabEntity(tab: TreeViewTab): Promise<TreeViewFolder | TreeViewItem> {
    const workspacePath = this._state.value.selectedWorkspaceRef?.workspacePath;
    if (workspacePath === undefined) throw new Error("TreeView workspace is unavailable");
    this._ensureCurrentWorkspacePath(tab.path);
    const entity = tab.kind === "folder"
      ? await this.dataProvider.getFolder(tab.path, 1)
      : await this.dataProvider.getItem(tab.path);
    const currentTab = this._state.value.workspace?.tabs.find((candidate) => candidate.id === tab.id);
    if (this._state.value.selectedWorkspaceRef?.workspacePath !== workspacePath
      || currentTab?.kind !== tab.kind
      || currentTab.path !== tab.path
      || entity.path !== tab.path
      || entity.properties.id !== tab.id
      || (tab.kind === "folder") !== ("folders" in entity)) {
      throw new Error(`TreeView Tab target does not match: ${tab.path}`);
    }
    return entity;
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
      this._resetFolderLoadState();
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
          workspace.tabs[previewIndex] = {
            kind: params.kind,
            id: params.id,
            path: entity.path,
            isPinned: false,
          };
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
      workspace.tabs.push({ kind: params.kind, id: params.id, path: entity.path, isPinned: false });
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
      selection: this._selectionForTabRecord(tab),
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
    const selectedWorkspaceRef = this._state.value.selectedWorkspaceRef;
    const workspace = selectedWorkspaceRef?.workspacePath === workspacePath
      ? this._state.value.workspace
      : await this.dataProvider.getWorkspaceProperties(workspacePath);
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    const targetPath = await this.dataProvider.renameWorkspace(workspacePath, newName);
    const rebasedWorkspace = this._rebaseTabPaths(workspace, workspacePath, targetPath);
    if (rebasedWorkspace !== workspace) {
      await this.dataProvider.updateWorkspaceProperties(targetPath, rebasedWorkspace);
    }
    const workspaceRefs = this._state.value.workspaceRefs.map((workspaceRef) => (
      workspaceRef.workspacePath === workspacePath
        ? { ...workspaceRef, workspacePath: targetPath, workspaceName: basename(targetPath) }
        : workspaceRef
    ));
    if (selectedWorkspaceRef?.workspacePath !== workspacePath) {
      this._setWorkspaceRefs(workspaceRefs);
      return;
    }
    this._rebaseLoadedFolderPaths(workspacePath, targetPath);
    const rootFolder = this._state.value.rootFolder;
    if (rootFolder === null) throw new Error("TreeView workspace root is missing");
    this._install({
      workspaceRefs: this._sortWorkspaceRefs(workspaceRefs),
      selectedWorkspaceRef: {
        ...selectedWorkspaceRef,
        workspacePath: targetPath,
        workspaceName: basename(targetPath),
      },
      workspace: rebasedWorkspace,
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
    await this._runRemoteOperation(
      (operationId) => this.dataProvider.deleteWorkspace(operationId, workspacePath),
    );
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
    this._loadedFolderPaths.add(folder.path);
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

  private async _saveDraft(params: TreeViewSaveDraftParams): Promise<void> {
    const item = await this.dataProvider.getItem(params.sourcePath);
    if (item.properties.id !== params.itemId) throw new Error("TreeView draft is missing");
    const targetFolder = this._folderByPath.get(params.targetFolderPath);
    if (targetFolder === undefined || !this._loadedFolderPaths.has(targetFolder.path)) {
      throw new Error("TreeView target folder is not loaded");
    }
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0) throw new Error("TreeView item name is required");
    const targetPath = join(targetFolder.path, `${trimmedName}${TREE_VIEW_ITEM_FILE_EXTENSION}`);
    await this.dataProvider.move({
      kind: "item",
      sourcePath: params.sourcePath,
      targetPath,
      targetOrder: targetFolder.items.filter((candidate) => !candidate.properties.isDraft).length,
    });
    const workspace = this._requireWorkspaceClone();
    const rebasedWorkspace = this._rebaseTabPaths(workspace, params.sourcePath, targetPath);
    this._state.value = { ...this._state.value, workspace: rebasedWorkspace, selection: null };
    if (rebasedWorkspace !== workspace) await this._saveWorkspace(rebasedWorkspace);
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
        params.itemId,
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
        params.itemId,
        null,
      );
      rootFolder = this._replaceChild(
        rootFolder,
        targetFolder.path,
        targetProperties,
        "item",
        params.itemId,
        savedItem,
      );
    }
    this._install({
      workspaceRefs: this._state.value.workspaceRefs,
      selectedWorkspaceRef: this._state.value.selectedWorkspaceRef,
      workspace: rebasedWorkspace,
      rootFolder,
    });
    await this._activate({ kind: "item", id: params.itemId, openMode: "normal" });
  }

  private async _discardDraft(itemId: string): Promise<void> {
    const item = this.getItemById(itemId);
    if (item === null || !item.properties.isDraft) throw new Error("TreeView draft is missing");
    await this._deleteItem(itemId);
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
    await this._runRemoteOperation(
      (operationId) => this.dataProvider.deleteFolder(operationId, folder.path),
    );
    this._removeFolderLoadState(folder.path);
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    const rootFolder = this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "folder",
      folderId,
      null,
    );
    await this._commitDeletedRootFolder(rootFolder, "folder", folder.path);
  }

  private async _deleteItem(itemId: string): Promise<void> {
    const item = this.getItemById(itemId);
    if (item === null) throw new Error("TreeView item is missing");
    const parentPath = dirname(item.path);
    await this._runRemoteOperation(
      (operationId) => this.dataProvider.deleteItem(operationId, item.path),
    );
    const parentProperties = await this.dataProvider.getFolderProperties(parentPath);
    const rootFolder = this._replaceChild(
      this._requireRootFolder(),
      parentPath,
      parentProperties,
      "item",
      itemId,
      null,
    );
    await this._commitDeletedRootFolder(rootFolder, "item", item.path);
  }

  private async _openInExplorer(selection: TreeViewSelection): Promise<void> {
    const entity = selection.kind === "folder"
      ? this.getFolderById(selection.id)
      : this.getItemById(selection.id);
    if (entity === null) throw new Error("TreeView Explorer target is missing");
    await this.dataProvider.openInExplorer(selection.kind, entity.path);
  }

  private async _openPathInExplorer(kind: "folder" | "item", targetPath: string): Promise<void> {
    this._ensureCurrentWorkspacePath(targetPath);
    await this.dataProvider.openInExplorer(kind, targetPath);
  }

  private async _clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null> {
    await this._runRemoteOperation(
      (operationId) => this.dataProvider.clone(operationId, params),
    );
    if (params.kind === "workspace") {
      const root = this._rootForWorkspacePath(params.targetPath);
      if (root === null) throw new Error("TreeView clone storage root is missing");
      const workspace = await this.dataProvider.getWorkspaceProperties(params.targetPath);
      const rebasedWorkspace = this._rebaseTabPaths(
        workspace,
        params.sourcePath,
        params.targetPath,
      );
      if (rebasedWorkspace !== workspace) {
        await this.dataProvider.updateWorkspaceProperties(params.targetPath, rebasedWorkspace);
      }
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
      const folder = await this.dataProvider.getFolder(params.targetPath, 1);
      this._commitRootFolder(this._updateFolderNode(
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
        this._loadedFolderPaths.add(folder.path);
        this._scheduleRestoreExpandedChildren(folder.path);
      }
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

  private async _runRemoteOperation(
    start: (operationId: string) => Promise<void>,
  ): Promise<void> {
    const operationId = crypto.randomUUID();
    const completion = new Promise<void>((resolve, reject) => {
      this._remoteOperationCompletions.set(operationId, { resolve, reject });
    });
    try {
      await Promise.all([start(operationId), completion]);
    } finally {
      this._remoteOperationCompletions.delete(operationId);
    }
  }

  private _completeRemoteOperation(operationId: string, errorMessage: string | null): void {
    const completion = this._remoteOperationCompletions.get(operationId);
    if (completion === undefined) {
      console.warn(`[treeView] received completion for unknown operation ${operationId}.`);
      return;
    }
    this._remoteOperationCompletions.delete(operationId);
    if (errorMessage === null) {
      completion.resolve();
    } else {
      completion.reject(new Error(errorMessage));
    }
  }

  private async _move(params: TreeViewMoveParams): Promise<void> {
    const source = params.kind === "folder"
      ? this._folderByPath.get(params.sourcePath)
      : this._itemByPath.get(params.sourcePath);
    if (source === undefined) {
      const workspace = this._requireWorkspaceClone();
      const tab = workspace.tabs.find((candidate) => (
        candidate.kind === params.kind && candidate.path === params.sourcePath
      ));
      if (tab === undefined) throw new Error("TreeView move source is missing");
      await this.dataProvider.move(params);
      const rebasedWorkspace = this._rebaseTabPaths(
        workspace,
        params.sourcePath,
        params.targetPath,
      );
      this._state.value = {
        ...this._state.value,
        workspace: rebasedWorkspace,
        selection: null,
      };
      if (rebasedWorkspace !== workspace) await this._saveWorkspace(rebasedWorkspace);
      return;
    }
    const sourceParentPath = dirname(params.sourcePath);
    const targetParentPath = dirname(params.targetPath);
    await this.dataProvider.move(params);
    if (params.kind === "folder") this._rebaseLoadedFolderPaths(params.sourcePath, params.targetPath);
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
    await this._commitRebasedRootFolder(
      rootFolder,
      params.sourcePath,
      params.targetPath,
    );
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
    this._resetFolderLoadState();
    const rootFolder = await this.dataProvider.getFolder(workspaceRef.workspacePath, 1);
    this._loadedFolderPaths.add(rootFolder.path);
    this._install({
      workspaceRefs,
      selectedWorkspaceRef: workspaceRef,
      workspace,
      rootFolder,
    });
    this._scheduleRestoreExpandedChildren(rootFolder.path);
  }

  private _loadFolderChildren(folderPath: string): Promise<TreeViewFolder> {
    const folder = this._folderByPath.get(folderPath);
    if (folder === undefined) return Promise.reject(new Error("TreeView folder is missing"));
    if (this._loadedFolderPaths.has(folderPath)) return Promise.resolve(folder);
    const pending = this._folderLoadOperations.get(folderPath);
    if (pending !== undefined) return pending;
    const workspacePath = this._state.value.selectedWorkspaceRef?.workspacePath;
    if (workspacePath === undefined) return Promise.reject(new Error("TreeView workspace is unavailable"));
    const operation = this.dataProvider.getFolder(folderPath, 1).then((loadedFolder) => {
      if (this._state.value.selectedWorkspaceRef?.workspacePath !== workspacePath) return loadedFolder;
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

  private _commitLoadedFolderLevel(
    folder: TreeViewFolder,
    isExpanded: boolean,
  ): void {
    const rootFolder = this._updateFolderNode(
      this._requireRootFolder(),
      folder.path,
      () => ({
        ...folder,
        properties: { ...folder.properties, isExpanded },
      }),
    );
    this._loadedFolderPaths.add(folder.path);
    this._commitRootFolder(rootFolder);
    this._scheduleRestoreExpandedChildren(folder.path);
  }

  private _scheduleRestoreExpandedChildren(folderPath: string): void {
    this._backgroundTasks.enqueue(() => {
      const folder = this._folderByPath.get(folderPath);
      if (folder === undefined || !folder.properties.isExpanded) return;
      for (const child of folder.folders) {
        if (!child.properties.isExpanded) continue;
        this._backgroundTasks.enqueue(async () => {
          await this._loadFolderChildren(child.path);
        });
      }
    });
  }

  private _resetFolderLoadState(): void {
    this._backgroundTasks.clear();
    this._loadedFolderPaths.clear();
    this._folderLoadOperations.clear();
  }

  private _removeFolderLoadState(folderPath: string): void {
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

  private _rebaseLoadedFolderPaths(sourcePath: string, targetPath: string): void {
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

  private async _commitRebasedRootFolder(
    rootFolder: TreeViewFolder,
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    const workspace = this._requireWorkspaceClone();
    const rebasedWorkspace = this._rebaseTabPaths(workspace, sourcePath, targetPath);
    if (rebasedWorkspace !== workspace) await this._saveWorkspace(rebasedWorkspace);
    this._install({
      workspaceRefs: this._state.value.workspaceRefs,
      selectedWorkspaceRef: this._state.value.selectedWorkspaceRef,
      workspace: rebasedWorkspace,
      rootFolder,
    });
  }

  private async _commitDeletedRootFolder(
    rootFolder: TreeViewFolder,
    kind: "folder" | "item",
    deletedPath: string,
  ): Promise<void> {
    const workspace = this._state.value.workspace;
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    const closingIds = new Set(workspace.tabs.flatMap((tab) => {
      const isDeleted = kind === "item"
        ? tab.kind === "item" && tab.path === deletedPath
        : tab.path === deletedPath || tab.path.startsWith(`${deletedPath}/`);
      return isDeleted ? [tab.id] : [];
    }));
    const activeIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
    const tabs = workspace.tabs.filter((tab) => !closingIds.has(tab.id));
    const normalizedWorkspace: TreeViewWorkspace = {
      ...workspace,
      tabs,
      activeTabId: workspace.activeTabId !== null && closingIds.has(workspace.activeTabId)
        ? tabs[Math.min(activeIndex, tabs.length - 1)]?.id ?? null
        : workspace.activeTabId,
      previewTabId: workspace.previewTabId !== null && closingIds.has(workspace.previewTabId)
        ? null
        : workspace.previewTabId,
    };
    this._install({
      workspaceRefs: this._state.value.workspaceRefs,
      selectedWorkspaceRef: this._state.value.selectedWorkspaceRef,
      workspace: normalizedWorkspace,
      rootFolder,
    });
    if (closingIds.size > 0) await this._saveWorkspace(normalizedWorkspace);
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

  private _rebaseTabPaths(
    workspace: TreeViewWorkspace,
    sourcePath: string,
    targetPath: string,
  ): TreeViewWorkspace {
    let hasChanged = false;
    const tabs = workspace.tabs.map((tab) => {
      if (tab.path !== sourcePath && !tab.path.startsWith(`${sourcePath}/`)) return tab;
      hasChanged = true;
      const relativePath = relative(sourcePath, tab.path);
      return {
        ...tab,
        path: relativePath.length === 0 ? targetPath : join(targetPath, relativePath),
      };
    });
    return hasChanged ? { ...workspace, tabs } : workspace;
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
    const tab = this._state.value.workspace?.tabs.find((candidate) => candidate.id === tabId);
    return tab === undefined ? null : this._selectionForTabRecord(tab);
  }

  private _selectionForTabRecord(tab: TreeViewTab): TreeViewSelection | null {
    if (tab.kind === "folder" && this._folderById.get(tab.id)?.path === tab.path) {
      return { kind: "folder", id: tab.id };
    }
    if (tab.kind === "item" && this._itemById.get(tab.id)?.path === tab.path) {
      return { kind: "item", id: tab.id };
    }
    return null;
  }

  private _ensureCurrentWorkspacePath(targetPath: string): void {
    const workspacePath = this._state.value.selectedWorkspaceRef?.workspacePath;
    if (workspacePath === undefined) throw new Error("TreeView workspace is unavailable");
    const relativePath = relative(workspacePath, targetPath);
    if (relativePath === ".."
      || relativePath.startsWith("../")
      || relativePath.startsWith("..\\")
      || relativePath.startsWith("/")
      || /^[a-zA-Z]:\//.test(relativePath)) {
      throw new Error("TreeView target is outside the current Workspace");
    }
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
    const tabs = state.workspace?.tabs ?? [];
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
    const activeTab = tabs.find((tab) => tab.id === workspace?.activeTabId);
    this._state.value = {
      ...state,
      workspace,
      selection: activeTab === undefined ? null : this._selectionForTabRecord(activeTab),
    };
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
  private readonly _backgroundTasks = new TreeViewBackgroundTaskQueue();
  private readonly _loadedFolderPaths = new Set<string>();
  private readonly _folderLoadOperations = new Map<string, Promise<TreeViewFolder>>();
  private readonly _remoteOperationCompletions = new Map<string, RemoteOperationCompletion>();
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
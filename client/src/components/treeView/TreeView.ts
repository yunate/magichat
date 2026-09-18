import { computed, shallowRef, type ComputedRef } from "vue";
import { basename } from "pathe";
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
import { destroyTreeViewDataProvider } from "../../bridge/remote_rpc_objects/treeViewDataProvider";
import { createDefaultTreeViewDataProvider } from "./createDefaultTreeViewDataProvider";
import {
  TreeViewExplorerModel,
  type TreeViewEntityPathChange,
} from "./explorer/treeViewExplorerModel";
import { TreeViewOperationQueue } from "./treeViewOperationQueue";
import {
  TreeViewTabsModel,
  type TreeViewDraftCreated,
  type TreeViewDraftPublished,
} from "./tabs/treeViewTabsModel";
import { TreeViewWorkspaceSelectorModel } from "./workspace/treeViewWorkspaceSelectorModel";
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

type TreeViewWorkspaceMetadata = Pick<TreeViewWorkspace, "isSelected" | "ui">;

type TreeViewWorkspaceDataProvider = Pick<
  RemoteObject<TreeViewDataProvider>,
  | "getWorkspaceProperties"
  | "updateWorkspaceProperties"
  | "createWorkspace"
  | "renameWorkspace"
  | "deleteWorkspace"
  | "clone"
>;

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
    this.workspaceSelectorModel = new TreeViewWorkspaceSelectorModel(options.storageRoots);
    this.explorerModel = new TreeViewExplorerModel();
    this.tabsModel = new TreeViewTabsModel();
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
      getEntityData: (params) => this.tabsModel.getEntityData(params),
      updateEntityData: (params, data) => this.tabsModel.updateEntityData(params, data),
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
    this.workspaceRefs = this.workspaceSelectorModel.workspaceRefs;
    this.selectedWorkspaceRef = computed(() => this._state.value.selectedWorkspaceRef);
    this.workspace = computed(() => this._getWorkspaceSnapshot());
    this.workspaceRevision = computed(() => this._workspaceRevision.value);
    this.rootFolder = this.explorerModel.rootFolder;
    this.selection = this.explorerModel.selection;
    this.previewTabId = this.tabsModel.previewTabId;
  }

  public get storageRoots(): readonly TreeViewStorageRoot[] {
    return this.workspaceSelectorModel.storageRoots;
  }

  public enqueueBackgroundTask(task: () => Promise<void> | void): void {
    this.explorerModel.enqueueBackgroundTask(task);
  }

  public startBackgroundTasks(): void {
    this.explorerModel.startBackgroundTasks();
  }

  public pauseBackgroundTasks(): void {
    this.explorerModel.pauseBackgroundTasks();
  }

  public async dispose(): Promise<void> {
    this.explorerModel.dispose();
    if (!this._ownsDataProvider) return;
    const provider = this._dataProvider;
    this._dataProvider = null;
    this._ownsDataProvider = false;
    if (provider !== null) await destroyTreeViewDataProvider(provider);
  }

  public getFolderById(id: string): TreeViewFolder | null {
    return this.explorerModel.getFolderById(id);
  }

  public getItemById(id: string): TreeViewItem | null {
    return this.explorerModel.getItemById(id);
  }

  public findLoadedFolderByPath(path: string): TreeViewFolder | null {
    return this.explorerModel.findLoadedFolderByPath(path);
  }

  public findLoadedItemByPath(path: string): TreeViewItem | null {
    return this.explorerModel.findLoadedItemByPath(path);
  }

  public async resolveFolderByPath(path: string): Promise<TreeViewFolder> {
    return this.explorerModel.resolveFolderByPath(path);
  }

  public async resolveItemByPath(path: string): Promise<TreeViewItem> {
    return this.explorerModel.resolveItemByPath(path);
  }

  public async resolveTabEntity(tab: TreeViewTab): Promise<TreeViewFolder | TreeViewItem> {
    return this.tabsModel.resolveTabEntity(tab);
  }

  public get activeTab(): TreeViewTab | null {
    return this.tabsModel.activeTab.value;
  }

  public async synchronizeDraftCreated(change: TreeViewDraftCreated): Promise<void> {
    const workspaceRevision = this._workspaceRevision.value;
    this._ensureCurrentWorkspace(change.workspacePath, workspaceRevision);
    await this.explorerModel.synchronizeCreatedItem(change.workspacePath, change.item);
    this._ensureCurrentWorkspace(change.workspacePath, workspaceRevision);
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  public async synchronizeDraftPublished(change: TreeViewDraftPublished): Promise<void> {
    const workspaceRevision = this._workspaceRevision.value;
    this._ensureCurrentWorkspace(change.workspacePath, workspaceRevision);
    await this.explorerModel.synchronizePublishedItem(
      change.workspacePath,
      change.sourceItem,
      change.targetItem,
      change.targetFolderPath,
    );
    this._ensureCurrentWorkspace(change.workspacePath, workspaceRevision);
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  public async synchronizeEntityPathChange(change: TreeViewEntityPathChange): Promise<void> {
    this._ensureCurrentWorkspace(change.workspacePath);
    if (this.tabsModel.rebasePaths(change.sourcePath, change.targetPath)) {
      await this._saveWorkspace(this._requireWorkspaceClone());
    }
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
  }

  public async synchronizeTabs(): Promise<void> {
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private get _workspaceDataProvider(): TreeViewWorkspaceDataProvider {
    const provider = this._dataProvider;
    if (provider === null) throw new Error("TreeView DataProvider is not initialized");
    return provider;
  }

  private async _initialize(): Promise<void> {
    if (this._dataProvider === null) {
      this._dataProvider = await createDefaultTreeViewDataProvider(this.controller);
      this._ownsDataProvider = true;
    }
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView DataProvider is not initialized");
    await this.workspaceSelectorModel.initialize(dataProvider);
    this.explorerModel.initialize(
      dataProvider,
      (start) => this._runRemoteOperation(start),
    );
    this.tabsModel.initialize(
      dataProvider,
      (start) => this._runRemoteOperation(start),
    );
    await this._load();
  }

  private async _load(): Promise<void> {
    await this.workspaceSelectorModel.reload();
    const workspaceRefs = this.workspaceRefs.value;
    let firstWorkspace: TreeViewWorkspace | null = null;
    for (const workspaceRef of workspaceRefs) {
      const candidate = await this._workspaceDataProvider.getWorkspaceProperties(workspaceRef.workspacePath);
      firstWorkspace ??= candidate;
      if (candidate.isSelected) {
        await this._loadWorkspace(workspaceRef, candidate);
        return;
      }
    }
    const firstWorkspaceRef = workspaceRefs[0];
    if (firstWorkspaceRef === undefined) {
      this._install({
        selectedWorkspaceRef: null,
        workspace: null,
      });
      this._workspaceRevision.value += 1;
      return;
    }
    if (firstWorkspace === null) throw new Error("TreeView first workspace is unavailable");
    const selectedWorkspace = { ...firstWorkspace, isSelected: true };
    await this._workspaceDataProvider.updateWorkspaceProperties(
      firstWorkspaceRef.workspacePath,
      selectedWorkspace,
    );
    await this._loadWorkspace(firstWorkspaceRef, selectedWorkspace);
  }

  private async _setStorageRoots(storageRoots: readonly TreeViewStorageRoot[]): Promise<void> {
    this.workspaceSelectorModel.setStorageRoots(storageRoots);
    await this._load();
  }

  private async _activate(params: TreeViewActivateParams): Promise<void> {
    const entity = params.kind === "folder"
      ? this.getFolderById(params.id)
      : this.getItemById(params.id);
    if (entity === null) throw new Error("TreeView activation target is missing");
    await this.explorerModel.expandAncestors(entity.path);
    const previousActiveTabId = this.tabsModel.activeTab.value?.id ?? null;
    this.tabsModel.activate(params, entity.path);
    const workspace = this._requireWorkspaceClone();
    const activeTabId = this.tabsModel.activeTab.value?.id ?? null;
    if (activeTabId !== previousActiveTabId) {
      this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    }
    await this._saveWorkspace(workspace);
  }

  private async _promoteTab(params: TreeViewSwitchTabParams): Promise<void> {
    if (!this.tabsModel.promoteTab(params)) return;
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _switchTab(params: TreeViewSwitchTabParams): Promise<void> {
    if (!this.tabsModel.switchTab(params)) return;
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _closeTabs(params: TreeViewCloseTabsParams): Promise<void> {
    this.tabsModel.closeTabs(params);
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _setTabPinned(params: TreeViewSetTabPinnedParams): Promise<void> {
    this.tabsModel.setTabPinned(params);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _reorderTabs(params: TreeViewReorderTabsParams): Promise<void> {
    this.tabsModel.reorderTabs(params);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _updateWorkspace(properties: TreeViewWorkspace): Promise<void> {
    const workspacePath = this._state.value.selectedWorkspaceRef?.workspacePath;
    if (workspacePath === undefined) throw new Error("TreeView workspace is not selected");
    this.tabsModel.install(workspacePath, properties);
    this._state.value = {
      ...this._state.value,
      workspace: this._workspaceMetadata(properties),
    };
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _switchWorkspace(workspacePath: string): Promise<void> {
    const currentRef = this._state.value.selectedWorkspaceRef;
    const currentWorkspace = this.workspace.value;
    if (currentRef?.workspacePath === workspacePath) return;
    const targetRef = this.workspaceRefs.value.find(
      (workspaceRef) => workspaceRef.workspacePath === workspacePath,
    );
    if (targetRef === undefined) throw new Error("TreeView workspace is missing");
    if (currentRef !== null && currentWorkspace !== null) {
      await this._workspaceDataProvider.updateWorkspaceProperties(
        currentRef.workspacePath,
        { ...structuredClone(currentWorkspace), isSelected: false },
      );
    }
    const target = await this._workspaceDataProvider.getWorkspaceProperties(workspacePath);
    await this._workspaceDataProvider.updateWorkspaceProperties(
      workspacePath,
      { ...target, isSelected: true },
    );
    await this._loadWorkspace(targetRef, { ...target, isSelected: true });
  }

  private async _createWorkspace(workspaceName: string): Promise<void> {
    const root = this._selectedStorageRoot() ?? this.storageRoots[0];
    if (root === undefined) throw new Error("TreeView requires a storage root");
    const workspacePath = await this._workspaceDataProvider.createWorkspace(
      root.path,
      workspaceName,
      this._state.value.selectedWorkspaceRef === null,
    );
    const workspaceRef: TreeViewWorkspaceRef = {
      rootKey: root.key,
      workspacePath,
      workspaceName: basename(workspacePath),
    };
    const workspaceRefs = [...this.workspaceRefs.value, workspaceRef];
    this._setWorkspaceRefs(workspaceRefs);
    if (this._state.value.selectedWorkspaceRef === null) {
      const properties = await this._workspaceDataProvider.getWorkspaceProperties(workspacePath);
      await this._loadWorkspace(workspaceRef, properties);
      return;
    }
  }

  private async _renameWorkspace(workspacePath: string, newName: string): Promise<void> {
    const selectedWorkspaceRef = this._state.value.selectedWorkspaceRef;
    const workspace = selectedWorkspaceRef?.workspacePath === workspacePath
      ? this.workspace.value
      : await this._workspaceDataProvider.getWorkspaceProperties(workspacePath);
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    const targetPath = await this._workspaceDataProvider.renameWorkspace(workspacePath, newName);
    const workspaceRefs = this.workspaceRefs.value.map((workspaceRef) => (
      workspaceRef.workspacePath === workspacePath
        ? { ...workspaceRef, workspacePath: targetPath, workspaceName: basename(targetPath) }
        : workspaceRef
    ));
    if (selectedWorkspaceRef?.workspacePath !== workspacePath) {
      this._setWorkspaceRefs(workspaceRefs);
      return;
    }
    this._install({
      selectedWorkspaceRef: {
        ...selectedWorkspaceRef,
        workspacePath: targetPath,
        workspaceName: basename(targetPath),
      },
      workspace,
    });
    this.explorerModel.rebaseWorkspace(workspacePath, targetPath);
    this._setWorkspaceRefs(workspaceRefs);
  }

  private async _deleteWorkspace(workspacePath: string): Promise<void> {
    const isSelected = this._state.value.selectedWorkspaceRef?.workspacePath === workspacePath;
    const deletedIndex = this.workspaceRefs.value.findIndex(
      (workspaceRef) => workspaceRef.workspacePath === workspacePath,
    );
    if (deletedIndex < 0) throw new Error("TreeView workspace is missing");
    const workspaceRefs = this.workspaceRefs.value.filter(
      (workspaceRef) => workspaceRef.workspacePath !== workspacePath,
    );
    await this._runRemoteOperation(
      (operationId) => this._workspaceDataProvider.deleteWorkspace(operationId, workspacePath),
    );
    this._setWorkspaceRefs(workspaceRefs);
    if (!isSelected) {
      this._setWorkspaceRefs(workspaceRefs);
      return;
    }
    const replacement = workspaceRefs[Math.min(deletedIndex, workspaceRefs.length - 1)] ?? null;
    if (replacement !== null) {
      const properties = await this._workspaceDataProvider.getWorkspaceProperties(replacement.workspacePath);
      const selectedProperties = { ...properties, isSelected: true };
      await this._workspaceDataProvider.updateWorkspaceProperties(replacement.workspacePath, selectedProperties);
      await this._loadWorkspace(replacement, selectedProperties);
      return;
    }
    this._install({
      selectedWorkspaceRef: null,
      workspace: null,
    });
    this._workspaceRevision.value += 1;
  }

  private async _createFolder(folderPath: string): Promise<string> {
    return this.explorerModel.createFolder(folderPath);
  }

  private async _createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    return this.explorerModel.createItem(itemPath, properties);
  }

  private async _saveDraft(params: TreeViewSaveDraftParams): Promise<void> {
    const targetFolder = this.explorerModel.findLoadedFolderByPath(params.targetFolderPath);
    if (targetFolder === null || !this.explorerModel.isFolderLoaded(targetFolder.path)) {
      throw new Error("TreeView target folder is not loaded");
    }
    const change = await this.tabsModel.publishDraft({
      ...params,
      targetOrder: targetFolder.items.filter((candidate) => !candidate.properties.isDraft).length,
    });
    await this.synchronizeDraftPublished(change);
  }

  private async _discardDraft(itemId: string): Promise<void> {
    const discarded = await this.tabsModel.discardDraft(itemId);
    const workspaceRevision = this._workspaceRevision.value;
    this._ensureCurrentWorkspace(discarded.workspacePath, workspaceRevision);
    await this.explorerModel.synchronizeDeletedItem(
      discarded.workspacePath,
      discarded.itemId,
      discarded.path,
    );
    this._ensureCurrentWorkspace(discarded.workspacePath, workspaceRevision);
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private async _updateFolder(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    await this.explorerModel.updateFolder(folderPath, properties);
  }

  private async _updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    await this.explorerModel.updateItem(itemPath, properties);
  }

  private async _deleteFolder(folderId: string): Promise<void> {
    const deleted = await this.explorerModel.deleteFolder(folderId);
    await this._synchronizeDeletedEntity(deleted.kind, deleted.path);
  }

  private async _deleteItem(itemId: string): Promise<void> {
    const deleted = await this.explorerModel.deleteItem(itemId);
    await this._synchronizeDeletedEntity(deleted.kind, deleted.path);
  }

  private async _openInExplorer(selection: TreeViewSelection): Promise<void> {
    await this.explorerModel.openInExplorer(selection);
  }

  private async _openPathInExplorer(kind: "folder" | "item", targetPath: string): Promise<void> {
    await this.explorerModel.openPathInExplorer(kind, targetPath);
  }

  private async _clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null> {
    if (params.kind === "workspace") {
      await this._runRemoteOperation(
        (operationId) => this._workspaceDataProvider.clone(operationId, params),
      );
      const root = this._rootForWorkspacePath(params.targetPath);
      if (root === null) throw new Error("TreeView clone storage root is missing");
      this._setWorkspaceRefs([...this.workspaceRefs.value, {
        rootKey: root.key,
        workspacePath: params.targetPath,
        workspaceName: basename(params.targetPath),
      }]);
      return null;
    }
    return this.explorerModel.clone({ ...params, kind: params.kind });
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
    const change = await this.explorerModel.move(params);
    if (change === null) {
      await this.tabsModel.moveTabEntity(params);
      this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
      await this._saveWorkspace(this._requireWorkspaceClone());
      return;
    }
    await this.synchronizeEntityPathChange(change);
  }

  private async _loadWorkspace(
    workspaceRef: TreeViewWorkspaceRef,
    workspaceProperties?: TreeViewWorkspace,
  ): Promise<void> {
    const workspace = workspaceProperties
      ?? await this._workspaceDataProvider.getWorkspaceProperties(workspaceRef.workspacePath);
    this._install({
      selectedWorkspaceRef: workspaceRef,
      workspace,
    });
    this._workspaceRevision.value += 1;
  }

  private _loadFolderChildren(folderPath: string): Promise<TreeViewFolder> {
    return this.explorerModel.loadFolderChildren(folderPath);
  }

  private _setWorkspaceRefs(workspaceRefs: readonly TreeViewWorkspaceRef[]): void {
    this.workspaceSelectorModel.installWorkspaceRefs(workspaceRefs);
  }

  private async _synchronizeDeletedEntity(
    kind: "folder" | "item",
    deletedPath: string,
  ): Promise<void> {
    if (!this.tabsModel.closeDeleted(kind, deletedPath)) return;
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
    await this._saveWorkspace(this._requireWorkspaceClone());
  }

  private _requireWorkspaceClone(): TreeViewWorkspace {
    const workspace = this._getWorkspaceSnapshot();
    if (workspace === null) throw new Error("TreeView workspace is not loaded");
    return structuredClone(workspace);
  }

  private _getWorkspaceSnapshot(): TreeViewWorkspace | null {
    const workspace = this._state.value.workspace;
    if (workspace === null) return null;
    const snapshot = this.tabsModel.getSnapshot();
    if (snapshot === null) return null;
    return { ...structuredClone(workspace), ...snapshot };
  }

  private _workspaceMetadata(workspace: TreeViewWorkspace): TreeViewWorkspaceMetadata {
    return {
      isSelected: workspace.isSelected,
      ui: structuredClone(workspace.ui),
    };
  }

  private async _saveWorkspace(workspace: TreeViewWorkspace): Promise<void> {
    const workspaceRef = this._state.value.selectedWorkspaceRef;
    if (workspaceRef === null) throw new Error("TreeView workspace is not selected");
    await this._workspaceDataProvider.updateWorkspaceProperties(workspaceRef.workspacePath, workspace);
  }

  private _install(state: {
    selectedWorkspaceRef: TreeViewWorkspaceRef | null;
    workspace: TreeViewWorkspace | null;
  }): void {
    this.tabsModel.install(state.selectedWorkspaceRef?.workspacePath ?? null, state.workspace);
    this._state.value = {
      selectedWorkspaceRef: state.selectedWorkspaceRef,
      workspace: state.workspace === null ? null : this._workspaceMetadata(state.workspace),
    };
    this.explorerModel.setActiveTab(this.tabsModel.activeTab.value);
  }

  private _rootForWorkspacePath(workspacePath: string): TreeViewStorageRoot | null {
    return this.workspaceSelectorModel.findStorageRoot(workspacePath);
  }

  private _selectedStorageRoot(): TreeViewStorageRoot | null {
    const selected = this._state.value.selectedWorkspaceRef;
    return selected === null ? null : this._rootForWorkspacePath(selected.workspacePath);
  }

  private _ensureCurrentWorkspace(workspacePath: string, workspaceRevision?: number): void {
    if (this._state.value.selectedWorkspaceRef?.workspacePath !== workspacePath
      || workspaceRevision !== undefined
      && this._workspaceRevision.value !== workspaceRevision) {
      throw new Error("TreeView Workspace changed during operation");
    }
  }

  public readonly controller: TreeViewController;
  public readonly explorerModel: TreeViewExplorerModel;
  public readonly operations: TreeViewOperations;
  public readonly tabsModel: TreeViewTabsModel;
  public readonly workspaceSelectorModel: TreeViewWorkspaceSelectorModel;
  public readonly workspaceRefs: ComputedRef<readonly TreeViewWorkspaceRef[]>;
  public readonly selectedWorkspaceRef: ComputedRef<TreeViewWorkspaceRef | null>;
  public readonly workspace: ComputedRef<TreeViewWorkspace | null>;
  public readonly workspaceRevision: ComputedRef<number>;
  public readonly rootFolder: ComputedRef<TreeViewFolder | null>;
  public readonly selection: ComputedRef<TreeViewSelection | null>;
  public readonly previewTabId: ComputedRef<string | null>;

  private readonly _queue = new TreeViewOperationQueue();
  private readonly _remoteOperationCompletions = new Map<string, RemoteOperationCompletion>();
  private _dataProvider: RemoteObject<TreeViewDataProvider> | null;
  private _ownsDataProvider = false;
  private readonly _state = shallowRef<{
    selectedWorkspaceRef: TreeViewWorkspaceRef | null;
    workspace: TreeViewWorkspaceMetadata | null;
  }>({
    selectedWorkspaceRef: null,
    workspace: null,
  });
  private readonly _workspaceRevision = shallowRef(0);
}
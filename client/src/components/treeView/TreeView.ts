import { computed, shallowRef, type ComputedRef } from "vue";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
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
  TreeViewWorkspace,
} from "../../../../common/treeView";
import { getTreeViewParentPath } from "../../../../common/treeView";
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
  activate(params: TreeViewActivateParams): Promise<void>;
  switchTab(params: TreeViewSwitchTabParams): Promise<void>;
  closeTabs(params: TreeViewCloseTabsParams): Promise<void>;
  setTabPinned(params: TreeViewSetTabPinnedParams): Promise<void>;
  reorderTabs(params: TreeViewReorderTabsParams): Promise<void>;
  updateWorkspace(properties: TreeViewWorkspace): Promise<void>;
  switchWorkspace(workspaceName: string): Promise<void>;
  createWorkspace(workspaceName: string): Promise<void>;
  renameWorkspace(currentName: string, newName: string): Promise<void>;
  deleteWorkspace(workspaceName: string): Promise<void>;
  createFolder(folderPath: string): Promise<TreeViewFolder>;
  createItem(itemPath: string, properties: TreeViewCreateItemProperties): Promise<TreeViewItem>;
  saveDraft(itemId: string, targetFolderId: string, name: string): Promise<void>;
  updateFolder(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  openInExplorer(selection: TreeViewSelection): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<TreeViewFolder | TreeViewItem | null>;
  move(params: TreeViewMoveParams): Promise<void>;
};

export type TreeViewOptions = {
  dataProvider: RemoteObject<TreeViewDataProvider>;
  shouldCreateDefaultWorkspace?: boolean;
  defaultWorkspaceName?: string;
};

export class TreeViewController {
  public initialize(): Promise<void> {
    return this._enqueue(() => this._operations.initialize());
  }

  public emitStorageChanged(): Promise<void> {
    return this._enqueue(() => this._operations.reload());
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

  public switchWorkspace(workspaceName: string): Promise<void> {
    return this._enqueue(() => this._operations.switchWorkspace(workspaceName));
  }

  public createWorkspace(workspaceName: string): Promise<void> {
    return this._enqueue(() => this._operations.createWorkspace(workspaceName));
  }

  public renameWorkspace(currentName: string, newName: string): Promise<void> {
    return this._enqueue(() => this._operations.renameWorkspace(currentName, newName));
  }

  public deleteWorkspace(workspaceName: string): Promise<void> {
    return this._enqueue(() => this._operations.deleteWorkspace(workspaceName));
  }

  public createFolder(folderPath: string): Promise<TreeViewFolder> {
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
    this.dataProvider = options.dataProvider;
    this._shouldCreateDefaultWorkspace = options.shouldCreateDefaultWorkspace ?? false;
    this._defaultWorkspaceName = options.defaultWorkspaceName ?? "default";
    this.operations = {
      initialize: () => this._load(),
      reload: () => this._load(),
      activate: (params) => this._activate(params),
      switchTab: (params) => this._switchTab(params),
      closeTabs: (params) => this._closeTabs(params),
      setTabPinned: (params) => this._setTabPinned(params),
      reorderTabs: (params) => this._reorderTabs(params),
      updateWorkspace: (properties) => this._updateWorkspace(properties),
      switchWorkspace: (workspaceName) => this._switchWorkspace(workspaceName),
      createWorkspace: (workspaceName) => this._createWorkspace(workspaceName),
      renameWorkspace: (currentName, newName) => this._renameWorkspace(currentName, newName),
      deleteWorkspace: (workspaceName) => this._deleteWorkspace(workspaceName),
      createFolder: (folderPath) => this._createFolder(folderPath),
      createItem: (itemPath, properties) => this._createItem(itemPath, properties),
      saveDraft: (itemId, targetFolderId, name) => this._saveDraft(itemId, targetFolderId, name),
      updateFolder: (folderPath, properties) => this._updateFolder(folderPath, properties),
      updateItem: (itemPath, properties) => this._updateItem(itemPath, properties),
      deleteFolder: (folderId) => this._deleteFolder(folderId),
      deleteItem: (itemId) => this._deleteItem(itemId),
      openInExplorer: (selection) => this._openInExplorer(selection),
      clone: (params) => this._clone(params),
      move: (params) => this._move(params),
    };
    this.controller = new TreeViewController(
      this.operations,
      <TResult>(operation: () => Promise<TResult> | TResult) => this._queue.enqueue(operation),
    );
    this.workspaceNames = computed(() => this._state.value.workspaceNames);
    this.selectedWorkspaceName = computed(() => this._state.value.selectedWorkspaceName);
    this.workspace = computed(() => this._state.value.workspace);
    this.rootFolder = computed(() => this._state.value.rootFolder);
    this.selection = computed(() => this._state.value.selection);
  }

  public getFolderById(id: string): TreeViewFolder | null {
    return this._folderById.get(id) ?? null;
  }

  public getItemById(id: string): TreeViewItem | null {
    return this._itemById.get(id) ?? null;
  }

  public get activeTab(): TreeViewTab | null {
    const workspace = this._state.value.workspace;
    return workspace?.tabs.find((tab) => tab.id === workspace.activeTabId) ?? null;
  }

  private async _load(): Promise<void> {
    let workspaceNames = await this.dataProvider.getWorkspaces();
    if (workspaceNames.length === 0 && this._shouldCreateDefaultWorkspace) {
      await this.dataProvider.createWorkspace(this._defaultWorkspaceName, true);
      workspaceNames = await this.dataProvider.getWorkspaces();
    }
    let selectedWorkspaceName: string | null = null;
    let workspace: TreeViewWorkspace | null = null;
    for (const workspaceName of workspaceNames) {
      const candidate = await this.dataProvider.getWorkspaceProperties(workspaceName);
      if (!candidate.isSelected) continue;
      if (selectedWorkspaceName !== null) throw new Error("TreeView requires one selected workspace");
      selectedWorkspaceName = workspaceName;
      workspace = candidate;
    }
    if (workspaceNames.length > 0 && selectedWorkspaceName === null) {
      throw new Error("TreeView requires one selected workspace");
    }
    const rootFolder = selectedWorkspaceName === null
      ? null
      : await this.dataProvider.getFolder(selectedWorkspaceName);
    const normalizedWorkspace = workspace === null || rootFolder === null
      ? workspace
      : this._pruneUnavailableTabs(workspace, rootFolder);
    if (normalizedWorkspace !== null && normalizedWorkspace !== workspace
      && selectedWorkspaceName !== null) {
      await this.dataProvider.updateWorkspaceProperties(selectedWorkspaceName, normalizedWorkspace);
    }
    this._install({
      workspaceNames,
      selectedWorkspaceName,
      workspace: normalizedWorkspace,
      rootFolder,
    });
  }

  private async _activate(params: TreeViewActivateParams): Promise<void> {
    const entity = params.kind === "folder"
      ? this.getFolderById(params.id)
      : this.getItemById(params.id);
    if (entity === null) throw new Error("TreeView activation target is missing");
    await this._expandAncestors(entity.path);
    await this._load();
    const workspace = this._requireWorkspaceClone();
    const existingIndex = workspace.tabs.findIndex((tab) => tab.id === params.id);
    if (existingIndex < 0) workspace.tabs.push({ kind: params.kind, id: params.id, isPinned: false });
    if (params.openMode === "pinned") this._pinTab(workspace, params.id, true);
    const isFirstTab = workspace.activeTabId === null;
    if (isFirstTab) workspace.activeTabId = params.id;
    this._state.value = {
      ...this._state.value,
      workspace,
      selection: isFirstTab ? { kind: params.kind, id: params.id } : this._state.value.selection,
    };
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

  private async _switchWorkspace(workspaceName: string): Promise<void> {
    const currentName = this._state.value.selectedWorkspaceName;
    const currentWorkspace = this._state.value.workspace;
    if (currentName === workspaceName) return;
    if (currentName !== null && currentWorkspace !== null) {
      await this.dataProvider.updateWorkspaceProperties(
        currentName,
        { ...structuredClone(currentWorkspace), isSelected: false },
      );
    }
    const target = await this.dataProvider.getWorkspaceProperties(workspaceName);
    await this.dataProvider.updateWorkspaceProperties(
      workspaceName,
      { ...target, isSelected: true },
    );
    await this._load();
  }

  private async _createWorkspace(workspaceName: string): Promise<void> {
    await this.dataProvider.createWorkspace(
      workspaceName,
      this._state.value.selectedWorkspaceName === null,
    );
    await this._load();
  }

  private async _renameWorkspace(currentName: string, newName: string): Promise<void> {
    await this.dataProvider.renameWorkspace(currentName, newName);
    await this._load();
  }

  private async _deleteWorkspace(workspaceName: string): Promise<void> {
    const replacementName = this._state.value.workspaceNames.find(
      (name) => name !== workspaceName,
    ) ?? (this._shouldCreateDefaultWorkspace ? this._defaultWorkspaceName : null);
    await this.dataProvider.deleteWorkspace(workspaceName, replacementName);
    await this._load();
  }

  private async _createFolder(folderPath: string): Promise<TreeViewFolder> {
    const folder = await this.dataProvider.createFolder(folderPath);
    await this._load();
    return folder;
  }

  private async _createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem> {
    const item = await this.dataProvider.createItem(itemPath, properties);
    await this._load();
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
    const targetPath = `${targetFolder.path}/${trimmedName}`;
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
    await this._load();
    await this._activate({ kind: "item", id: itemId, openMode: "normal" });
  }

  private async _updateFolder(
    folderPath: string,
    properties: TreeViewFolderProperties,
  ): Promise<void> {
    await this.dataProvider.updateFolderProperties(folderPath, properties);
    await this._load();
  }

  private async _updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void> {
    await this.dataProvider.updateItem(itemPath, properties);
    await this._load();
  }

  private async _deleteFolder(folderId: string): Promise<void> {
    const folder = this.getFolderById(folderId);
    if (folder === null) throw new Error("TreeView folder is missing");
    await this.dataProvider.deleteFolder(folder.path);
    await this._load();
  }

  private async _deleteItem(itemId: string): Promise<void> {
    const item = this.getItemById(itemId);
    if (item === null) throw new Error("TreeView item is missing");
    await this.dataProvider.deleteItem(item.path);
    await this._load();
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
    await this._load();
    if (params.kind === "workspace") return null;
    return params.kind === "folder"
      ? this._folderByPath.get(params.targetPath) ?? null
      : this._itemByPath.get(params.targetPath) ?? null;
  }

  private async _move(params: TreeViewMoveParams): Promise<void> {
    await this.dataProvider.move(params);
    await this._load();
  }

  private async _expandAncestors(entityPath: string): Promise<void> {
    let parentPath = getTreeViewParentPath(entityPath);
    while (parentPath !== null) {
      const folder = this._folderByPath.get(parentPath);
      if (folder !== undefined && !folder.properties.isExpanded) {
        const properties = { ...structuredClone(folder.properties), isExpanded: true };
        await this.dataProvider.updateFolderProperties(folder.path, properties);
      }
      parentPath = getTreeViewParentPath(parentPath);
    }
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
    const workspaceName = this._state.value.selectedWorkspaceName;
    if (workspaceName === null) throw new Error("TreeView workspace is not selected");
    await this.dataProvider.updateWorkspaceProperties(workspaceName, workspace);
  }

  private _install(state: {
    workspaceNames: readonly string[];
    selectedWorkspaceName: string | null;
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
    return { ...workspace, tabs, activeTabId };
  }

  private _indexFolder(folder: TreeViewFolder): void {
    if (this._folderById.has(folder.properties.id)) throw new Error("Duplicate TreeView folder id");
    this._folderById.set(folder.properties.id, folder);
    this._folderByPath.set(folder.path, folder);
    for (const item of folder.items) {
      if (this._itemById.has(item.properties.id)) throw new Error("Duplicate TreeView item id");
      this._itemById.set(item.properties.id, item);
      this._itemByPath.set(item.path, item);
    }
    for (const child of folder.folders) this._indexFolder(child);
  }

  public readonly dataProvider: RemoteObject<TreeViewDataProvider>;
  public readonly controller: TreeViewController;
  public readonly operations: TreeViewOperations;
  public readonly workspaceNames: ComputedRef<readonly string[]>;
  public readonly selectedWorkspaceName: ComputedRef<string | null>;
  public readonly workspace: ComputedRef<TreeViewWorkspace | null>;
  public readonly rootFolder: ComputedRef<TreeViewFolder | null>;
  public readonly selection: ComputedRef<TreeViewSelection | null>;

  private readonly _queue = new TreeViewOperationQueue();
  private readonly _shouldCreateDefaultWorkspace: boolean;
  private readonly _defaultWorkspaceName: string;
  private readonly _state = shallowRef<{
    workspaceNames: readonly string[];
    selectedWorkspaceName: string | null;
    workspace: TreeViewWorkspace | null;
    rootFolder: TreeViewFolder | null;
    selection: TreeViewSelection | null;
  }>({
    workspaceNames: [],
    selectedWorkspaceName: null,
    workspace: null,
    rootFolder: null,
    selection: null,
  });
  private _folderById = new Map<string, TreeViewFolder>();
  private _folderByPath = new Map<string, TreeViewFolder>();
  private _itemById = new Map<string, TreeViewItem>();
  private _itemByPath = new Map<string, TreeViewItem>();
}
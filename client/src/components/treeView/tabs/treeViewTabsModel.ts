import { computed, shallowRef, type ComputedRef } from "vue";
import { join, relative } from "pathe";
import type { RemoteObject } from "../../../../../common/ipc_bridge/rpc";
import type {
  TreeViewDataProvider,
  TreeViewEntityData,
  TreeViewEntityDataParams,
  TreeViewFolder,
  TreeViewItem,
  TreeViewMoveParams,
  TreeViewTab,
  TreeViewWorkspace,
} from "../../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "../../../../../common/treeView";
import type {
  TreeViewActivateParams,
  TreeViewCloseTabsParams,
  TreeViewReorderTabsParams,
  TreeViewSetTabPinnedParams,
  TreeViewSwitchTabParams,
  TreeViewSaveDraftParams,
} from "../treeViewTypes";

export type TreeViewTabsDataProvider = Pick<
  RemoteObject<TreeViewDataProvider>,
  | "getFolder"
  | "getItem"
  | "checkEntitiesIntegrity"
  | "createItem"
  | "updateItem"
  | "deleteItem"
  | "getEntityData"
  | "updateEntityData"
  | "move"
>;

type TreeViewRemoteOperationRunner = (
  start: (operationId: string) => Promise<void>,
) => Promise<void>;

type TreeViewTabsOperationIdentity = Readonly<{
  workspacePath: string;
  installRevision: number;
}>;

export type TreeViewTabsSnapshot = Pick<
  TreeViewWorkspace,
  "tabs" | "activeTabId" | "previewTabId"
>;

type TreeViewTabsState = TreeViewTabsSnapshot & {
  workspacePath: string;
};

export type TreeViewDraftPublished = Readonly<{
  workspacePath: string;
  sourceItem: TreeViewItem;
  targetItem: TreeViewItem;
  targetFolderPath: string;
}>;

export type TreeViewDraftCreated = Readonly<{
  workspacePath: string;
  item: TreeViewItem;
}>;

export type TreeViewDraftDiscarded = Readonly<{
  workspacePath: string;
  itemId: string;
  path: string;
}>;

export class TreeViewTabsModel {
  public constructor() {
    this.tabs = computed(() => this._state.value?.tabs ?? []);
    this.activeTab = computed(() => {
      const state = this._state.value;
      return state?.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
    });
    this.previewTabId = computed(() => this._state.value?.previewTabId ?? null);
  }

  public initialize(
    dataProvider: TreeViewTabsDataProvider,
    runRemoteOperation: TreeViewRemoteOperationRunner,
  ): void {
    this._dataProvider = dataProvider;
    this._runRemoteOperation = runRemoteOperation;
  }

  public install(workspacePath: string | null, snapshot: TreeViewTabsSnapshot | null): void {
    this._installRevision += 1;
    this._incompleteEntities.value = new Map();
    if (workspacePath === null || snapshot === null) {
      this._state.value = null;
      return;
    }
    const tabs = snapshot.tabs.map((tab) => ({ ...tab, path: join(workspacePath, tab.path) }));
    this._state.value = {
      workspacePath,
      tabs,
      activeTabId: tabs.some((tab) => tab.id === snapshot.activeTabId)
        ? snapshot.activeTabId
        : tabs[0]?.id ?? null,
      previewTabId: tabs.some((tab) => (
        tab.id === snapshot.previewTabId && !tab.isPinned
      )) ? snapshot.previewTabId : null,
    };
  }

  public getSnapshot(): TreeViewTabsSnapshot | null {
    const state = this._state.value;
    if (state === null) return null;
    return {
      tabs: state.tabs.map((tab) => ({
        ...tab,
        path: relative(state.workspacePath, tab.path) || ".",
      })),
      activeTabId: state.activeTabId,
      previewTabId: state.previewTabId,
    };
  }

  public getTab(tabId: string): TreeViewTab | null {
    return this._state.value?.tabs.find((tab) => tab.id === tabId) ?? null;
  }

  public isTabEntityComplete(tab: TreeViewTab): boolean {
    return this._incompleteEntities.value.get(tab.id) !== tab.path;
  }

  public async checkTabEntitiesIntegrity(): Promise<void> {
    const state = this._state.value;
    if (state === null || state.tabs.length === 0) return;
    const revision = this._installRevision;
    const tabs = state.tabs.map((tab) => ({ ...tab }));
    const entities = tabs.map((tab) => {
      this._ensureWorkspacePath(state.workspacePath, tab.path);
      return { kind: tab.kind, path: tab.path };
    });
    const results = await this._getDataProvider().checkEntitiesIntegrity(entities);
    if (revision !== this._installRevision) return;
    const incompleteEntities = new Map<string, string>();
    for (const [index, tab] of tabs.entries()) {
      const current = this.getTab(tab.id);
      if (current?.kind === tab.kind && current.path === tab.path && results[index] === false) {
        incompleteEntities.set(tab.id, tab.path);
      }
    }
    this._incompleteEntities.value = incompleteEntities;
  }

  public activate(params: TreeViewActivateParams, path: string): void {
    const state = this._requireStateClone();
    const existingIndex = state.tabs.findIndex((tab) => tab.id === params.id);
    if (existingIndex < 0 && params.openMode !== "normal" && params.openMode !== "pinned") {
      const previewTabId = state.previewTabId;
      if (previewTabId !== null) {
        const previewIndex = state.tabs.findIndex((tab) => tab.id === previewTabId);
        if (previewIndex >= 0) {
          state.tabs[previewIndex] = {
            kind: params.kind,
            id: params.id,
            path,
            isPinned: false,
          };
          state.previewTabId = params.id;
          if (state.activeTabId === previewTabId) state.activeTabId = params.id;
        }
      }
    }
    const isNewTab = !state.tabs.some((tab) => tab.id === params.id);
    if (isNewTab) {
      state.tabs.push({ kind: params.kind, id: params.id, path, isPinned: false });
    }
    if (params.openMode === "pinned") {
      this._pinTab(state, params.id, true);
      this._clearPreviewTab(state, params.id);
    } else if (params.openMode === "normal") {
      this._clearPreviewTab(state, params.id);
    } else if (isNewTab) {
      state.previewTabId = params.id;
    }
    state.activeTabId ??= params.id;
    this._state.value = state;
  }

  public promoteTab(params: TreeViewSwitchTabParams): boolean {
    const state = this._requireStateClone();
    if (!state.tabs.some((tab) => tab.id === params.tabId)) {
      throw new Error("TreeView tab is missing");
    }
    if (state.previewTabId !== params.tabId) return false;
    this._clearPreviewTab(state, params.tabId);
    this._state.value = state;
    return true;
  }

  public switchTab(params: TreeViewSwitchTabParams): boolean {
    const state = this._requireStateClone();
    if (!state.tabs.some((tab) => tab.id === params.tabId)) {
      throw new Error("TreeView tab is missing");
    }
    if (state.activeTabId === params.tabId) return false;
    state.activeTabId = params.tabId;
    this._state.value = state;
    return true;
  }

  public closeTabs(params: TreeViewCloseTabsParams): void {
    const state = this._requireStateClone();
    const closingIds = new Set(params.tabIds);
    const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
    state.tabs = state.tabs.filter((tab) => !closingIds.has(tab.id));
    if (state.previewTabId !== null && closingIds.has(state.previewTabId)) {
      state.previewTabId = null;
    }
    if (state.activeTabId !== null && closingIds.has(state.activeTabId)) {
      const preferred = params.preferredActiveId;
      state.activeTabId = preferred !== undefined
        && state.tabs.some((tab) => tab.id === preferred)
        ? preferred
        : state.tabs[Math.min(activeIndex, state.tabs.length - 1)]?.id ?? null;
    }
    this._state.value = state;
  }

  public setTabPinned(params: TreeViewSetTabPinnedParams): void {
    const state = this._requireStateClone();
    this._pinTab(state, params.tabId, params.isPinned);
    if (params.isPinned) this._clearPreviewTab(state, params.tabId);
    this._state.value = state;
  }

  public reorderTabs(params: TreeViewReorderTabsParams): void {
    const state = this._requireStateClone();
    const sourceIndex = state.tabs.findIndex((tab) => tab.id === params.draggedId);
    const targetIndex = state.tabs.findIndex((tab) => tab.id === params.targetId);
    const tab = state.tabs[sourceIndex];
    const targetTab = state.tabs[targetIndex];
    if (tab === undefined || targetTab === undefined) throw new Error("TreeView reorder tab is missing");
    if (tab.isPinned !== targetTab.isPinned) {
      throw new Error("TreeView tabs cannot be reordered across the pinned boundary");
    }
    state.tabs.splice(sourceIndex, 1);
    const adjustedTarget = state.tabs.findIndex((candidate) => candidate.id === params.targetId);
    state.tabs.splice(adjustedTarget + (params.position === "after" ? 1 : 0), 0, tab);
    this._state.value = state;
  }

  public rebasePaths(sourcePath: string, targetPath: string): boolean {
    const state = this._requireStateClone();
    let hasChanged = false;
    state.tabs = state.tabs.map((tab) => {
      if (tab.path !== sourcePath && !tab.path.startsWith(`${sourcePath}/`)) return tab;
      hasChanged = true;
      return {
        ...tab,
        path: tab.path === sourcePath
          ? targetPath
          : `${targetPath}${tab.path.slice(sourcePath.length)}`,
      };
    });
    if (hasChanged) this._state.value = state;
    return hasChanged;
  }

  public closeDeleted(kind: "folder" | "item", deletedPath: string): boolean {
    const state = this._requireStateClone();
    const closingIds = state.tabs.flatMap((tab) => {
      const isDeleted = kind === "item"
        ? tab.kind === "item" && tab.path === deletedPath
        : tab.path === deletedPath || tab.path.startsWith(`${deletedPath}/`);
      return isDeleted ? [tab.id] : [];
    });
    if (closingIds.length === 0) return false;
    this.closeTabs({ tabIds: closingIds });
    return true;
  }

  public async moveTabEntity(params: TreeViewMoveParams): Promise<void> {
    const identity = this._captureOperationIdentity();
    const tab = this._state.value?.tabs.find((candidate) => (
      candidate.kind === params.kind && candidate.path === params.sourcePath
    ));
    if (tab === undefined) throw new Error("TreeView move source is missing");
    await this._getDataProvider().move(params);
    this._ensureOperationIdentity(identity);
    this.rebasePaths(params.sourcePath, params.targetPath);
  }

  public async resolveTabEntity(tab: TreeViewTab): Promise<TreeViewFolder | TreeViewItem> {
    const state = this._state.value;
    if (state === null) throw new Error("TreeView workspace is unavailable");
    const workspacePath = state.workspacePath;
    this._ensureWorkspacePath(workspacePath, tab.path);
    const entity = tab.kind === "folder"
      ? await this._getDataProvider().getFolder(tab.path, 1)
      : await this._getDataProvider().getItem(tab.path);
    const current = this._state.value;
    const currentTab = current?.tabs.find((candidate) => candidate.id === tab.id);
    if (current?.workspacePath !== workspacePath
      || currentTab?.kind !== tab.kind
      || currentTab.path !== tab.path
      || entity.path !== tab.path
      || entity.properties.id !== tab.id
      || (tab.kind === "folder") !== ("folders" in entity)) {
      throw new Error(`TreeView Tab target does not match: ${tab.path}`);
    }
    return entity;
  }

  public getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData> {
    return this._getDataProvider().getEntityData(params);
  }

  public updateEntityData(
    params: TreeViewEntityDataParams,
    data: TreeViewEntityData,
  ): Promise<void> {
    return this._getDataProvider().updateEntityData(params, data);
  }

  public async createDraft(itemPath: string): Promise<TreeViewDraftCreated> {
    const identity = this._captureOperationIdentity();
    const item = await this._getDataProvider().createItem(itemPath, { isDraft: true });
    this._ensureOperationIdentity(identity);
    this.activate({ kind: "item", id: item.properties.id, openMode: "normal" }, item.path);
    this.switchTab({ tabId: item.properties.id });
    return { workspacePath: identity.workspacePath, item };
  }

  public async publishDraft(
    params: TreeViewSaveDraftParams & { targetOrder: number },
  ): Promise<TreeViewDraftPublished> {
    const identity = this._captureOperationIdentity();
    const sourceItem = await this._getDataProvider().getItem(params.sourcePath);
    if (sourceItem.properties.id !== params.itemId) throw new Error("TreeView draft is missing");
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0) throw new Error("TreeView item name is required");
    const targetPath = join(
      params.targetFolderPath,
      `${trimmedName}${TREE_VIEW_ITEM_FILE_EXTENSION}`,
    );
    await this._getDataProvider().move({
      kind: "item",
      sourcePath: params.sourcePath,
      targetPath,
      targetOrder: params.targetOrder,
    });
    this._ensureOperationIdentity(identity);
    this.rebasePaths(params.sourcePath, targetPath);
    await this._getDataProvider().updateItem(targetPath, {
      ...structuredClone(sourceItem.properties),
      isDraft: false,
    });
    const targetItem = await this._getDataProvider().getItem(targetPath);
    this._ensureOperationIdentity(identity);
    this.activate({ kind: "item", id: params.itemId, openMode: "normal" }, targetPath);
    return {
      workspacePath: identity.workspacePath,
      sourceItem,
      targetItem,
      targetFolderPath: params.targetFolderPath,
    };
  }

  public async discardDraft(itemId: string): Promise<TreeViewDraftDiscarded> {
    const identity = this._captureOperationIdentity();
    const tab = this.getTab(itemId);
    if (tab?.kind !== "item") throw new Error("TreeView draft is missing");
    const item = await this._getDataProvider().getItem(tab.path);
    if (item.properties.id !== itemId || !item.properties.isDraft) {
      throw new Error("TreeView draft is missing");
    }
    await this._runRemote((operationId) => (
      this._getDataProvider().deleteItem(operationId, item.path)
    ));
    this._ensureOperationIdentity(identity);
    this.closeTabs({ tabIds: [itemId] });
    return { workspacePath: identity.workspacePath, itemId, path: item.path };
  }

  private _requireStateClone(): TreeViewTabsState {
    const state = this._state.value;
    if (state === null) throw new Error("TreeView workspace is not loaded");
    return structuredClone(state);
  }

  private _getDataProvider(): TreeViewTabsDataProvider {
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView Tabs DataProvider is not initialized");
    return dataProvider;
  }

  private _runRemote(start: (operationId: string) => Promise<void>): Promise<void> {
    const runRemoteOperation = this._runRemoteOperation;
    if (runRemoteOperation === null) {
      throw new Error("TreeView Tabs operation runner is not initialized");
    }
    return runRemoteOperation(start);
  }

  private _pinTab(state: TreeViewTabsState, tabId: string, isPinned: boolean): void {
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    const tab = state.tabs[index];
    if (tab === undefined) throw new Error("TreeView tab is missing");
    if (tab.isPinned === isPinned) return;
    state.tabs.splice(index, 1);
    tab.isPinned = isPinned;
    const firstUnpinned = state.tabs.findIndex((candidate) => !candidate.isPinned);
    const insertionIndex = firstUnpinned < 0 ? state.tabs.length : firstUnpinned;
    state.tabs.splice(insertionIndex, 0, tab);
  }

  private _clearPreviewTab(state: TreeViewTabsState, tabId: string): void {
    if (state.previewTabId === tabId) state.previewTabId = null;
  }

  private _ensureWorkspacePath(workspacePath: string, targetPath: string): void {
    if (targetPath === workspacePath || targetPath.startsWith(`${workspacePath}/`)) return;
    throw new Error("TreeView target is outside the current Workspace");
  }

  private _captureOperationIdentity(): TreeViewTabsOperationIdentity {
    const workspacePath = this._state.value?.workspacePath;
    if (workspacePath === undefined) throw new Error("TreeView workspace is unavailable");
    return { workspacePath, installRevision: this._installRevision };
  }

  private _ensureOperationIdentity(identity: TreeViewTabsOperationIdentity): void {
    if (this._state.value?.workspacePath !== identity.workspacePath
      || this._installRevision !== identity.installRevision) {
      throw new Error("TreeView Workspace changed during operation");
    }
  }

  public readonly tabs: ComputedRef<readonly TreeViewTab[]>;
  public readonly activeTab: ComputedRef<TreeViewTab | null>;
  public readonly previewTabId: ComputedRef<string | null>;

  private _dataProvider: TreeViewTabsDataProvider | null = null;
  private _runRemoteOperation: TreeViewRemoteOperationRunner | null = null;
  private _installRevision = 0;
  private readonly _state = shallowRef<TreeViewTabsState | null>(null);
  private readonly _incompleteEntities = shallowRef<ReadonlyMap<string, string>>(new Map());
}
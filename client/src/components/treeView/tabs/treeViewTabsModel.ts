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
  | "getAvailableItemPath"
  | "createItem"
  | "updateItem"
  | "deleteItem"
  | "getEntityData"
  | "updateEntityData"
  | "move"
>;

type TreeViewTabsOperationIdentity = Readonly<{
  workspacePath: string;
  installRevision: number;
}>;

export type TreeViewTabsSnapshot = Pick<
  TreeViewWorkspace,
  "tabs" | "activeTabPath" | "previewTabPath"
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
  path: string;
}>;

export class TreeViewTabsModel {
  public constructor() {
    this.tabs = computed(() => this._state.value?.tabs ?? []);
    this.activeTab = computed(() => {
      const state = this._state.value;
      return state?.tabs.find((tab) => tab.path === state.activeTabPath) ?? null;
    });
    this.previewTabPath = computed(() => this._state.value?.previewTabPath ?? null);
  }

  public initialize(dataProvider: TreeViewTabsDataProvider): void {
    this._dataProvider = dataProvider;
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
      activeTabPath: snapshot.activeTabPath === null ? null : join(workspacePath, snapshot.activeTabPath),
      previewTabPath: snapshot.previewTabPath === null ? null : join(workspacePath, snapshot.previewTabPath),
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
      activeTabPath: state.activeTabPath === null ? null : relative(state.workspacePath, state.activeTabPath) || ".",
      previewTabPath: state.previewTabPath === null ? null : relative(state.workspacePath, state.previewTabPath) || ".",
    };
  }

  public getTab(tabPath: string): TreeViewTab | null {
    return this._state.value?.tabs.find((tab) => tab.path === tabPath) ?? null;
  }

  public getPageKey(tab: TreeViewTab): number {
    const existing = this._pageKeys.get(tab);
    if (existing !== undefined) return existing;
    const key = this._nextPageKey++;
    this._pageKeys.set(tab, key);
    return key;
  }

  public isTabEntityComplete(tab: TreeViewTab): boolean {
    return this._incompleteEntities.value.get(tab.path) !== tab.path;
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
      const current = this.getTab(tab.path);
      if (current?.kind === tab.kind && current.path === tab.path && results[index] === false) {
        incompleteEntities.set(tab.path, tab.path);
      }
    }
    this._incompleteEntities.value = incompleteEntities;
  }

  public activate(params: TreeViewActivateParams): void {
    const state = this._requireStateClone();
    const existingIndex = state.tabs.findIndex((tab) => tab.path === params.path);
    if (existingIndex < 0 && params.openMode !== "normal" && params.openMode !== "pinned") {
      const previewTabPath = state.previewTabPath;
      if (previewTabPath !== null) {
        const previewIndex = state.tabs.findIndex((tab) => tab.path === previewTabPath);
        if (previewIndex >= 0) {
          state.tabs[previewIndex] = {
            kind: params.kind,
            path: params.path,
            isPinned: false,
          };
          state.previewTabPath = params.path;
          if (state.activeTabPath === previewTabPath) state.activeTabPath = params.path;
        }
      }
    }
    const isNewTab = !state.tabs.some((tab) => tab.path === params.path);
    if (isNewTab) {
      state.tabs.push({ kind: params.kind, path: params.path, isPinned: false });
    }
    if (params.openMode === "pinned") {
      this._pinTab(state, params.path, true);
      this._clearPreviewTab(state, params.path);
    } else if (params.openMode === "normal") {
      this._clearPreviewTab(state, params.path);
    } else if (isNewTab) {
      state.previewTabPath = params.path;
    }
    state.activeTabPath ??= params.path;
    this._state.value = state;
  }

  public promoteTab(params: TreeViewSwitchTabParams): boolean {
    const state = this._requireStateClone();
    if (!state.tabs.some((tab) => tab.path === params.tabPath)) {
      throw new Error("TreeView tab is missing");
    }
    if (state.previewTabPath !== params.tabPath) return false;
    this._clearPreviewTab(state, params.tabPath);
    this._state.value = state;
    return true;
  }

  public switchTab(params: TreeViewSwitchTabParams): boolean {
    const state = this._requireStateClone();
    if (!state.tabs.some((tab) => tab.path === params.tabPath)) {
      throw new Error("TreeView tab is missing");
    }
    if (state.activeTabPath === params.tabPath) return false;
    state.activeTabPath = params.tabPath;
    this._state.value = state;
    return true;
  }

  public closeTabs(params: TreeViewCloseTabsParams): void {
    const state = this._requireStateClone();
    const closingPaths = new Set(params.tabPaths);
    const activeIndex = state.tabs.findIndex((tab) => tab.path === state.activeTabPath);
    state.tabs = state.tabs.filter((tab) => !closingPaths.has(tab.path));
    if (state.previewTabPath !== null && closingPaths.has(state.previewTabPath)) {
      state.previewTabPath = null;
    }
    if (state.activeTabPath !== null && closingPaths.has(state.activeTabPath)) {
      const preferred = params.preferredActivePath;
      state.activeTabPath = preferred !== undefined
        && state.tabs.some((tab) => tab.path === preferred)
        ? preferred
        : state.tabs[Math.min(activeIndex, state.tabs.length - 1)]?.path ?? null;
    }
    this._state.value = state;
  }

  public setTabPinned(params: TreeViewSetTabPinnedParams): void {
    const state = this._requireStateClone();
    this._pinTab(state, params.tabPath, params.isPinned);
    if (params.isPinned) this._clearPreviewTab(state, params.tabPath);
    this._state.value = state;
  }

  public reorderTabs(params: TreeViewReorderTabsParams): void {
    const state = this._requireStateClone();
    const sourceIndex = state.tabs.findIndex((tab) => tab.path === params.draggedPath);
    const targetIndex = state.tabs.findIndex((tab) => tab.path === params.targetPath);
    const tab = state.tabs[sourceIndex];
    const targetTab = state.tabs[targetIndex];
    if (tab === undefined || targetTab === undefined) throw new Error("TreeView reorder tab is missing");
    if (tab.isPinned !== targetTab.isPinned) {
      throw new Error("TreeView tabs cannot be reordered across the pinned boundary");
    }
    state.tabs.splice(sourceIndex, 1);
    const adjustedTarget = state.tabs.findIndex((candidate) => candidate.path === params.targetPath);
    state.tabs.splice(adjustedTarget + (params.position === "after" ? 1 : 0), 0, tab);
    this._state.value = state;
  }

  public rebasePaths(sourcePath: string, targetPath: string): boolean {
    const state = this._requireStateClone();
    const rebase = (value: string): string => value === sourcePath || value.startsWith(`${sourcePath}/`)
      ? `${targetPath}${value.slice(sourcePath.length)}`
      : value;
    let hasChanged = false;
    state.tabs = state.tabs.map((tab) => {
      if (tab.path !== sourcePath && !tab.path.startsWith(`${sourcePath}/`)) return tab;
      hasChanged = true;
      const rebased = { ...tab, path: rebase(tab.path) };
      this._pageKeys.set(rebased, this.getPageKey(tab));
      return rebased;
    });
    if (state.workspacePath === sourcePath) {
      state.workspacePath = targetPath;
      hasChanged = true;
    }
    if (hasChanged) {
      if (state.activeTabPath !== null) state.activeTabPath = rebase(state.activeTabPath);
      if (state.previewTabPath !== null) state.previewTabPath = rebase(state.previewTabPath);
      this._incompleteEntities.value = new Map(
        [...this._incompleteEntities.value].map(([key, value]) => [rebase(key), rebase(value)]),
      );
      this._state.value = state;
    }
    return hasChanged;
  }

  public closeDeleted(kind: "folder" | "item", deletedPath: string): boolean {
    const state = this._requireStateClone();
    const closingPaths = state.tabs.flatMap((tab) => {
      const isDeleted = kind === "item"
        ? tab.kind === "item" && tab.path === deletedPath
        : tab.path === deletedPath || tab.path.startsWith(`${deletedPath}/`);
      return isDeleted ? [tab.path] : [];
    });
    if (closingPaths.length === 0) return false;
    this.closeTabs({ tabPaths: closingPaths });
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
    const currentTab = current?.tabs.find((candidate) => candidate.path === tab.path);
    if (current?.workspacePath !== workspacePath
      || currentTab?.kind !== tab.kind
      || currentTab.path !== tab.path
      || entity.path !== tab.path
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
    const availablePath = await this._getDataProvider().getAvailableItemPath(itemPath);
    const item = await this._getDataProvider().createItem(availablePath, { isDraft: true, iconDescription: "" });
    this._ensureOperationIdentity(identity);
    this.activate({ kind: "item", path: item.path, openMode: "normal" });
    this.switchTab({ tabPath: item.path });
    return { workspacePath: identity.workspacePath, item };
  }

  public async publishDraft(
    params: TreeViewSaveDraftParams & { targetOrder: number },
  ): Promise<TreeViewDraftPublished> {
    const identity = this._captureOperationIdentity();
    const sourceItem = await this._getDataProvider().getItem(params.sourcePath);
    if (!sourceItem.properties.isDraft) throw new Error("TreeView draft is missing");
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
    this.activate({ kind: "item", path: targetPath, openMode: "normal" });
    return {
      workspacePath: identity.workspacePath,
      sourceItem,
      targetItem,
      targetFolderPath: params.targetFolderPath,
    };
  }

  public async discardDraft(itemPath: string): Promise<TreeViewDraftDiscarded> {
    const identity = this._captureOperationIdentity();
    const tab = this.getTab(itemPath);
    if (tab?.kind !== "item") throw new Error("TreeView draft is missing");
    const item = await this._getDataProvider().getItem(tab.path);
    if (item.path !== itemPath || !item.properties.isDraft) {
      throw new Error("TreeView draft is missing");
    }
    await this._getDataProvider().deleteItem(item.path);
    this._ensureOperationIdentity(identity);
    this.closeTabs({ tabPaths: [itemPath] });
    return { workspacePath: identity.workspacePath, path: item.path };
  }

  private _requireStateClone(): TreeViewTabsState {
    const state = this._state.value;
    if (state === null) throw new Error("TreeView workspace is not loaded");
    const clone = structuredClone(state);
    for (const [index, tab] of clone.tabs.entries()) {
      const original = state.tabs[index];
      if (original !== undefined) this._pageKeys.set(tab, this.getPageKey(original));
    }
    return clone;
  }

  private _getDataProvider(): TreeViewTabsDataProvider {
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView Tabs DataProvider is not initialized");
    return dataProvider;
  }

  private _pinTab(state: TreeViewTabsState, tabPath: string, isPinned: boolean): void {
    const index = state.tabs.findIndex((tab) => tab.path === tabPath);
    const tab = state.tabs[index];
    if (tab === undefined) throw new Error("TreeView tab is missing");
    if (tab.isPinned === isPinned) return;
    state.tabs.splice(index, 1);
    tab.isPinned = isPinned;
    const firstUnpinned = state.tabs.findIndex((candidate) => !candidate.isPinned);
    const insertionIndex = firstUnpinned < 0 ? state.tabs.length : firstUnpinned;
    state.tabs.splice(insertionIndex, 0, tab);
  }

  private _clearPreviewTab(state: TreeViewTabsState, tabPath: string): void {
    if (state.previewTabPath === tabPath) state.previewTabPath = null;
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
  public readonly previewTabPath: ComputedRef<string | null>;

  private _dataProvider: TreeViewTabsDataProvider | null = null;
  private _installRevision = 0;
  private _nextPageKey = 0;
  private readonly _pageKeys = new WeakMap<TreeViewTab, number>();
  private readonly _state = shallowRef<TreeViewTabsState | null>(null);
  private readonly _incompleteEntities = shallowRef<ReadonlyMap<string, string>>(new Map());
}
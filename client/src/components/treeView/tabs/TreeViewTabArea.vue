<script setup lang="ts">
import { dirname, join, relative } from "pathe";
import { computed, onMounted, onUnmounted, ref } from "vue";
import type {
  TreeViewFolder,
  TreeViewItem,
  TreeViewTab,
} from "../../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "../../../../../common/treeView";
import type { ContextMenuArea, ContextMenuPosition } from "../../contextMenuTypes";
import PersistentStack from "../../PersistentStack.vue";
import type { TreeViewController } from "../TreeView";
import TreeViewSaveDraftDialog from "./TreeViewSaveDraftDialog.vue";
import TreeViewTabPageHost from "./TreeViewTabPageHost.vue";
import TreeViewTabs from "./TreeViewTabs.vue";
import TreeViewTabContextMenu from "./TreeViewTabContextMenu.vue";
import type {
  TreeViewDraftCreated,
  TreeViewDraftPublished,
  TreeViewTabsModel,
} from "./treeViewTabsModel";

type TreeViewTabActions = Pick<
  TreeViewController,
  | "closeTabs"
  | "openPathInExplorer"
  | "switchTab"
>;

type MenuState = Readonly<{
  tabId: string;
  position: ContextMenuPosition;
}> | null;

type DraftDialogState = {
  item: TreeViewItem;
  error: string;
  isSubmitting: boolean;
};

const props = defineProps<{
  model: TreeViewTabsModel;
  actions: TreeViewTabActions;
  workspacePath: string | null;
  rootFolder: TreeViewFolder | null;
  isMultiline: boolean;
  isFolderTabVisible: boolean;
  isItemTabVisible: boolean;
  itemLabel: string;
  contextMenuArea: ContextMenuArea;
}>();

const emit = defineEmits<{
  createWorkspace: [];
  draftCreated: [change: TreeViewDraftCreated];
  draftPublished: [change: TreeViewDraftPublished];
  tabsChanged: [];
  error: [message: string];
  message: [message: string, level: "success"];
}>();

defineSlots<{
  tabHeaderLeading(): unknown;
  tabItemIcon(props: { tab: TreeViewTab; isSelected: boolean }): unknown;
  tabOverlay(props: { tab: TreeViewTab; isActive: boolean }): unknown;
  tabPage(props: {
    tab: TreeViewTab;
    entity: TreeViewFolder | TreeViewItem;
    isActive: boolean;
    notifyReady: () => void;
    requestDraftSave: () => Promise<boolean>;
  }): unknown;
}>();

const menu = ref<MenuState>(null);
const draftDialog = ref<DraftDialogState | null>(null);
let resolveDraftDialog: ((isSaved: boolean) => void) | null = null;
let integrityCheckTimer: number | undefined;
let isCheckingIntegrity = false;
const tabs = computed(() => props.model.tabs.value.filter((tab) => (
  tab.kind === "folder" ? props.isFolderTabVisible : props.isItemTabVisible
)));
const activeTab = computed(() => {
  const activeTabId = props.model.activeTab.value?.id;
  return tabs.value.find((tab) => tab.id === activeTabId) ?? null;
});
const activeTabPageKey = computed(() => {
  const tab = activeTab.value;
  return tab === null ? null : getTabPageKey(tab);
});
const contextMenuTab = computed(() => {
  const state = menu.value;
  return state === null ? null : tabs.value.find((tab) => tab.id === state.tabId) ?? null;
});
const breadcrumbPath = computed(() => {
  const tab = activeTab.value;
  if (tab === null || props.workspacePath === null) return "";
  return relative(dirname(props.workspacePath), tab.path);
});
const breadcrumbSegments = computed<readonly string[]>(() => (
  breadcrumbPath.value.length === 0 ? [] : breadcrumbPath.value.split("/")
));
const hasWorkspace = computed(() => props.workspacePath !== null);

function getTabPageKey(tab: TreeViewTab): string {
  return `${props.workspacePath ?? ""}:${tab.kind}:${tab.id}`;
}

function report(operation: Promise<unknown>): void {
  void operation.catch((reason: unknown) => {
    emit("error", reason instanceof Error ? reason.message : String(reason));
  });
}

function switchTab(tab: TreeViewTab): void {
  report(props.actions.switchTab({ tabId: tab.id }));
}

function promoteTab(tab: TreeViewTab): void {
  runTabsChange(() => props.model.promoteTab({ tabId: tab.id }));
}

function openTabMenu(event: MouseEvent, tab: TreeViewTab): void {
  menu.value = {
    tabId: tab.id,
    position: { x: event.clientX, y: event.clientY },
  };
}

function closeMenuTab(): void {
  const state = menu.value;
  menu.value = null;
  if (state !== null) report(props.actions.closeTabs({ tabIds: [state.tabId] }));
}

function closeMenuTabs(mode: "others" | "left" | "right" | "othersExceptPinned"): void {
  const target = contextMenuTab.value;
  menu.value = null;
  if (target === null) return;
  const targetIndex = tabs.value.findIndex((tab) => tab.id === target.id);
  if (targetIndex < 0) return;
  const tabIds = tabs.value.flatMap((tab, index) => {
    if (tab.id === target.id) return [];
    if (mode === "left") return index < targetIndex ? [tab.id] : [];
    if (mode === "right") return index > targetIndex ? [tab.id] : [];
    if (mode === "othersExceptPinned" && tab.isPinned) return [];
    return [tab.id];
  });
  report(props.actions.closeTabs({ tabIds, preferredActiveId: target.id }));
}

function toggleMenuTabPinned(): void {
  const tab = contextMenuTab.value;
  menu.value = null;
  if (tab !== null) {
    runTabsChange(() => props.model.setTabPinned({ tabId: tab.id, isPinned: !tab.isPinned }));
  }
}

function openMenuTargetInExplorer(): void {
  const tab = contextMenuTab.value;
  menu.value = null;
  if (tab !== null) report(props.actions.openPathInExplorer(tab.kind, tab.path));
}

async function copyMenuPath(kind: "relative" | "full"): Promise<void> {
  const targetPath = contextMenuTab.value?.path ?? null;
  menu.value = null;
  if (targetPath === null || props.workspacePath === null) return;
  const path = kind === "full" ? targetPath : relative(dirname(props.workspacePath), targetPath);
  try {
    await navigator.clipboard.writeText(path);
    emit("message", kind === "full" ? "Full path copied." : "Path copied.", "success");
  } catch (reason: unknown) {
    emit("error", "Failed to copy path.");
    console.error("Failed to copy TreeView path:", reason);
  }
}

function availableDraftName(folder: TreeViewFolder): string {
  const names = new Set(
    [...folder.folders, ...folder.items].map((entry) => entry.name.toLocaleLowerCase("en-US")),
  );
  const base = "Untitled";
  let name = base;
  let sequence = 2;
  while (names.has(name.toLocaleLowerCase("en-US"))) name = `${base} ${sequence++}`;
  return name;
}

function createDraft(): void {
  const rootFolder = props.rootFolder;
  if (rootFolder === null) return;
  const name = availableDraftName(rootFolder);
  report(props.model.createDraft(
    join(rootFolder.path, `${name}${TREE_VIEW_ITEM_FILE_EXTENSION}`),
  ).then((change) => {
    emit("draftCreated", change);
  }));
}

function openDraftDialog(item: TreeViewItem): Promise<boolean> {
  if (!item.properties.isDraft || draftDialog.value !== null) return Promise.resolve(false);
  draftDialog.value = { item, error: "", isSubmitting: false };
  return new Promise<boolean>((resolve) => {
    resolveDraftDialog = resolve;
  });
}

function requestDraftSave(entity: TreeViewFolder | TreeViewItem): Promise<boolean> {
  return isTreeViewItem(entity) ? openDraftDialog(entity) : Promise.resolve(false);
}

async function saveDraft(name: string, folderId: string): Promise<void> {
  const state = draftDialog.value;
  if (state === null || state.isSubmitting) return;
  state.isSubmitting = true;
  state.error = "";
  try {
    const targetFolder = findLoadedFolder(folderId);
    if (targetFolder === null) throw new Error("TreeView target folder is unavailable");
    const change = await props.model.publishDraft({
      itemId: state.item.properties.id,
      sourcePath: state.item.path,
      targetFolderPath: targetFolder.path,
      name,
      targetOrder: targetFolder.items.filter((item) => !item.properties.isDraft).length,
    });
    draftDialog.value = null;
    resolveDraftDialog?.(true);
    resolveDraftDialog = null;
    emit("draftPublished", change);
  } catch (reason: unknown) {
    state.error = reason instanceof Error ? reason.message : String(reason);
    state.isSubmitting = false;
  }
}

function findLoadedFolder(folderId: string): TreeViewFolder | null {
  const root = props.rootFolder;
  if (root === null) return null;
  const pending = [root];
  while (pending.length > 0) {
    const folder = pending.shift();
    if (folder === undefined) continue;
    if (folder.properties.id === folderId) return folder;
    pending.push(...folder.folders);
  }
  return null;
}

function closeDraftDialog(): void {
  if (draftDialog.value?.isSubmitting === true) return;
  draftDialog.value = null;
  resolveDraftDialog?.(false);
  resolveDraftDialog = null;
}

function setTabPinned(tab: TreeViewTab, isPinned: boolean): void {
  runTabsChange(() => props.model.setTabPinned({ tabId: tab.id, isPinned }));
}

function reorderTabs(
  draggedId: string,
  targetId: string,
  position: "before" | "after",
): void {
  runTabsChange(() => props.model.reorderTabs({ draggedId, targetId, position }));
}

function runTabsChange(change: () => boolean | void): void {
  try {
    if (change() !== false) emit("tabsChanged");
  } catch (reason: unknown) {
    emit("error", reason instanceof Error ? reason.message : String(reason));
  }
}

function isTreeViewItem(entity: TreeViewFolder | TreeViewItem): entity is TreeViewItem {
  return "isDraft" in entity.properties;
}

function closeMenu(): void {
  menu.value = null;
}

async function checkTabEntitiesIntegrity(): Promise<void> {
  if (isCheckingIntegrity) return;
  isCheckingIntegrity = true;
  try {
    await props.model.checkTabEntitiesIntegrity();
  } finally {
    isCheckingIntegrity = false;
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", closeMenu);
  integrityCheckTimer = window.setInterval(() => report(checkTabEntitiesIntegrity()), 1000);
});
onUnmounted(() => {
  window.clearInterval(integrityCheckTimer);
  window.removeEventListener("pointerdown", closeMenu);
  resolveDraftDialog?.(false);
  resolveDraftDialog = null;
});
</script>

<template>
  <main class="tree-view__workspace">
    <div class="tree-view__tab-header">
      <header class="tree-view__tabs" :class="{ 'is-multiline': isMultiline }">
        <slot name="tabHeaderLeading"></slot>
        <TreeViewTabs
          :tabs="tabs"
          :active-tab-id="activeTab?.id ?? null"
          :preview-tab-id="model.previewTabId.value"
          :is-multiline="isMultiline"
          :is-add-visible="isItemTabVisible && hasWorkspace"
          @activate="switchTab"
          @promote="promoteTab"
          @pin="setTabPinned"
          @close="report(actions.closeTabs({ tabIds: [$event.id] }))"
          @context-menu="openTabMenu"
          @reorder="reorderTabs"
          @add="createDraft"
        >
          <template v-if="$slots.tabItemIcon" #itemIcon="slotProps"><slot name="tabItemIcon" v-bind="slotProps"></slot></template>
          <template #tabOverlay="slotProps"><slot name="tabOverlay" v-bind="slotProps"></slot></template>
        </TreeViewTabs>
      </header>
      <nav v-if="activeTab" class="tree-view__breadcrumb" aria-label="Current path">
        <span class="tree-view__breadcrumb-segments" :title="breadcrumbPath">
          <template v-for="(segment, index) in breadcrumbSegments" :key="`${index}:${segment}`">
            <span v-if="index > 0" class="tree-view__breadcrumb-separator" aria-hidden="true"></span>
            <span class="tree-view__breadcrumb-segment">{{ segment }}</span>
          </template>
        </span>
      </nav>
    </div>
    <section class="tree-view__content">
      <PersistentStack
        v-if="activeTab !== null"
        :entries="tabs"
        :active-key="activeTabPageKey"
        :get-entry-key="getTabPageKey"
        defer-display-until-ready
      >
        <template #default="{ entry: tab, isActive, notifyReady }">
          <TreeViewTabPageHost
            :tab="tab"
            :is-active="isActive"
            :is-entity-complete="model.isTabEntityComplete(tab)"
            :model="model"
            :notify-ready="notifyReady"
          >
            <template #default="{ entity, notifyReady: notifyTabPageReady }">
              <slot
                name="tabPage"
                :tab="tab"
                :entity="entity"
                :is-active="isActive"
                :notify-ready="notifyTabPageReady"
                :request-draft-save="() => requestDraftSave(entity)"
              ></slot>
            </template>
          </TreeViewTabPageHost>
        </template>
      </PersistentStack>
      <div v-if="!hasWorkspace" class="tree-view__empty">
        <div class="tree-view__empty-content">
          <h2>No workspace found</h2>
          <p>Create a workspace to continue.</p>
          <button type="button" class="tree-view__empty-action" @click="emit('createWorkspace')">
            Create workspace
          </button>
        </div>
      </div>
      <p v-else-if="activeTab === null" class="tree-view__empty">Select or create an item.</p>
    </section>

    <TreeViewTabContextMenu
      v-if="menu !== null"
      :tab="contextMenuTab"
      :position="menu.position"
      :area="contextMenuArea"
      @close="closeMenuTab"
      @toggle-pinned="toggleMenuTabPinned"
      @open-in-explorer="openMenuTargetInExplorer"
      @copy-path="copyMenuPath"
      @close-others="closeMenuTabs"
    />

    <TreeViewSaveDraftDialog
      :item="draftDialog?.item ?? null"
      :root-folder="rootFolder"
      :item-label="itemLabel"
      :is-submitting="draftDialog?.isSubmitting ?? false"
      :error="draftDialog?.error ?? ''"
      @save="saveDraft"
      @cancel="closeDraftDialog"
    />
  </main>
</template>

<style scoped>
.tree-view__workspace { min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; background: transparent; }
.tree-view__tab-header { flex: none; overflow: hidden; border: 1px solid var(--color-border); border-block-end: 0; border-radius: 0; }
.tree-view__tabs { min-height: var(--tree-row-height); height: var(--tree-row-height); display: flex; align-items: end; background: var(--color-default-bg); }
.tree-view__tabs.is-multiline { height: auto; max-height: 104px; align-items: flex-start; padding-block: var(--space-1); }
.tree-view__breadcrumb { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 0 var(--space-3) var(--space-2); overflow: hidden; color: color-mix(in srgb, var(--color-text-muted) 82%, var(--color-content-bg)); background: var(--color-content-bg); font-size: 12px; line-height: 20px; white-space: nowrap; }
.tree-view__breadcrumb-segments { min-width: 0; flex: 1; display: flex; align-items: center; gap: var(--space-1); overflow-x: auto; scrollbar-width: none; user-select: none; cursor: default; }
.tree-view__breadcrumb-segments::-webkit-scrollbar { display: none; }
.tree-view__breadcrumb-segment { flex: none; user-select: none; }
.tree-view__breadcrumb-separator { width: 5px; height: 5px; flex: none; border-top: 1px solid currentColor; border-right: 1px solid currentColor; color: var(--color-text-muted); transform: rotate(45deg); }
.tree-view__content { flex: 1; min-height: 0; display: flex; overflow: auto; background: transparent; }
.tree-view__empty { flex: 1; display: grid; min-width: 0; height: 100%; place-items: center; margin: 0; color: var(--color-text-muted); border-inline: 1px solid var(--color-border); border-block-end: 1px solid var(--color-border); font-size: 13px; }
.tree-view__empty-content { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; }
.tree-view__empty-content h2 { margin: 0; color: var(--color-text); font-size: 16px; font-weight: 500; }
.tree-view__empty-content p { margin: 0 0 var(--space-2); }
.tree-view__empty-action { min-width: 128px; height: 36px; padding-inline: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: transparent; cursor: pointer; }
.tree-view__empty-action:hover { border-color: color-mix(in srgb, var(--color-text-muted) 60%, var(--color-border)); background: var(--color-surface-raised); }
.tree-view__empty-action:active { transform: translateY(1px); }
.tree-view__empty-action:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
</style>
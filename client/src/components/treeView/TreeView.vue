<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { TREE_VIEW_DEFAULT_SIDEBAR_WIDTH } from "../../../../common/treeView";
import type {
  TreeViewFolder,
  TreeViewItem,
  TreeViewTab,
} from "../../../../common/treeView";
import type { ContextMenuArea } from "../contextMenuTypes";
import type { PopupToastHandle } from "../popupToast";
import PopupToast from "../PopupToast.vue";
import SplitContainer from "../SplitContainer.vue";
import TreeViewExplorer from "./explorer/TreeViewExplorer.vue";
import type { TreeView } from "./TreeView";
import TreeViewTabArea from "./tabs/TreeViewTabArea.vue";
import TreeViewWorkspaceSelector from "./workspace/TreeViewWorkspaceSelector.vue";

type WorkspaceDialogState = {
  name: string;
  error: string;
  isSubmitting: boolean;
};

const props = withDefaults(defineProps<{
  treeView: TreeView;
  folderLabel?: string;
  itemLabel?: string;
  isTabMultiline?: boolean;
  isFolderTabVisible?: boolean;
  isItemTabVisible?: boolean;
}>(), {
  folderLabel: "Folder",
  itemLabel: "Item",
  isTabMultiline: false,
  isFolderTabVisible: true,
  isItemTabVisible: true,
});

defineSlots<{
  folderOverlay(props: { folder: TreeViewFolder; isSelected: boolean }): unknown;
  itemIcon(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  tabItemIcon(props: { tab: TreeViewTab; isSelected: boolean }): unknown;
  itemOverlay(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  tabOverlay(props: { tab: TreeViewTab; isActive: boolean }): unknown;
  tabPage(props: {
    tab: TreeViewTab;
    entity: TreeViewFolder | TreeViewItem;
    isActive: boolean;
    notifyReady: () => void;
    requestDraftSave: () => Promise<boolean>;
  }): unknown;
}>();

const treeViewElement = useTemplateRef<HTMLElement>("treeViewElement");
const popupToast = useTemplateRef<PopupToastHandle>("popupToast");
const isSidebarCollapsed = ref(false);
const sidebarWidth = ref(TREE_VIEW_DEFAULT_SIDEBAR_WIDTH);
const workspaceDialog = ref<WorkspaceDialogState | null>(null);
const contextMenuArea = ref<ContextMenuArea>({
  left: 0,
  top: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
});
const workspace = computed(() => props.treeView.workspace.value);
const hasWorkspace = computed(() => props.treeView.workspaceRefs.value.length > 0);
const isTabContentVisible = computed(() => props.isFolderTabVisible || props.isItemTabVisible);
let contextMenuResizeObserver: ResizeObserver | null = null;

watch(workspace, (value) => {
  if (value !== null) sidebarWidth.value = value.ui.layout.sidebarWidth;
}, { immediate: true });

function report(operation: Promise<unknown>): void {
  void operation.catch((reason: unknown) => {
    reportError(reason instanceof Error ? reason.message : String(reason));
  });
}

function reportError(message: string): void {
  popupToast.value?.show(message, { level: "error" });
}

function showMessage(message: string, level: "success"): void {
  popupToast.value?.show(message, { level });
}

function createWorkspace(): void {
  workspaceDialog.value = { name: "", error: "", isSubmitting: false };
}

function updateWorkspaceName(event: Event): void {
  const state = workspaceDialog.value;
  if (state === null || !(event.target instanceof HTMLInputElement)) return;
  state.name = event.target.value;
  state.error = "";
}

async function submitWorkspace(): Promise<void> {
  const state = workspaceDialog.value;
  if (state === null || state.isSubmitting) return;
  const name = state.name.trim();
  if (name.length === 0) {
    state.error = "Workspace name is required.";
    return;
  }
  state.isSubmitting = true;
  state.error = "";
  try {
    await props.treeView.controller.createWorkspace(name);
    workspaceDialog.value = null;
  } catch (reason: unknown) {
    state.error = reason instanceof Error ? reason.message : String(reason);
    state.isSubmitting = false;
  }
}

function closeWorkspaceDialog(): void {
  if (workspaceDialog.value?.isSubmitting === true) return;
  workspaceDialog.value = null;
}

function selectWorkspace(workspacePath: string): void {
  if (workspacePath !== props.treeView.selectedWorkspaceRef.value?.workspacePath) {
    report(props.treeView.controller.switchWorkspace(workspacePath));
  }
}

function resizeSidebar(_index: number, width: number): void {
  sidebarWidth.value = Math.max(200, Math.min(480, width));
}

function resetSidebarWidth(): void {
  sidebarWidth.value = TREE_VIEW_DEFAULT_SIDEBAR_WIDTH;
  saveSidebarWidth();
}

function finishSidebarResize(): void {
  saveSidebarWidth();
}

function saveSidebarWidth(): void {
  const current = workspace.value;
  if (current === null) return;
  report(props.treeView.controller.updateWorkspace({
    ...structuredClone(current),
    ui: { layout: { sidebarWidth: sidebarWidth.value } },
  }));
}

function updateContextMenuArea(): void {
  const bounds = treeViewElement.value?.getBoundingClientRect();
  contextMenuArea.value = bounds === undefined
    ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    : { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
}

onMounted(() => {
  window.addEventListener("resize", updateContextMenuArea);
  const element = treeViewElement.value;
  if (element !== null) {
    contextMenuResizeObserver = new ResizeObserver(updateContextMenuArea);
    contextMenuResizeObserver.observe(element);
  }
  updateContextMenuArea();
});

onUnmounted(() => {
  window.removeEventListener("resize", updateContextMenuArea);
  contextMenuResizeObserver?.disconnect();
  contextMenuResizeObserver = null;
});
</script>

<template>
  <div ref="treeViewElement" class="tree-view">
    <SplitContainer
      class="tree-view__layout"
      orientation="vertical"
      :has-item-borders="false"
      :separator-labels="['Resize sidebar']"
      @resize="resizeSidebar"
      @resize-end="finishSidebarResize"
      @separator-double-click="resetSidebarWidth"
    >
      <aside
        v-if="!isSidebarCollapsed"
        class="tree-view__sidebar"
        :class="{ 'is-tree-only': !isTabContentVisible }"
        :style="{ width: isTabContentVisible ? `${sidebarWidth}px` : '100%' }"
      >
        <header class="tree-view__sidebar-header" :class="{ 'is-multiline': isTabMultiline }">
          <TreeViewWorkspaceSelector
            :model="treeView.workspaceSelectorModel"
            :selected-workspace-path="treeView.selectedWorkspaceRef.value?.workspacePath ?? null"
            @workspace-selected="selectWorkspace"
          />
          <button
            v-if="hasWorkspace"
            type="button"
            class="tree-view__create-workspace"
            aria-label="Create workspace"
            title="Create workspace"
            @click="createWorkspace"
          >+</button>
          <button
            type="button"
            class="tree-view__collapse"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            @click="isSidebarCollapsed = true"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>
          </button>
        </header>
        <TreeViewExplorer
          :model="treeView.explorerModel"
          :actions="treeView.controller"
          :selected-path="treeView.selection.value"
          :workspace-path="treeView.selectedWorkspaceRef.value?.workspacePath ?? null"
          :workspace-ref="treeView.selectedWorkspaceRef.value"
          :workspace-root-key="treeView.selectedWorkspaceRef.value?.rootKey ?? null"
          :workspace-refs="treeView.workspaceRefs.value"
          :folder-label="folderLabel"
          :item-label="itemLabel"
          :context-menu-area="contextMenuArea"
          @entity-activated="report(treeView.controller.activate($event))"
          @entity-path-changed="report(treeView.synchronizeEntityPathChange($event))"
          @error="reportError"
          @message="showMessage"
        >
          <template #folderOverlay="slotProps"><slot name="folderOverlay" v-bind="slotProps"></slot></template>
          <template v-if="$slots.itemIcon" #itemIcon="slotProps"><slot name="itemIcon" v-bind="slotProps"></slot></template>
          <template #itemOverlay="slotProps"><slot name="itemOverlay" v-bind="slotProps"></slot></template>
        </TreeViewExplorer>
      </aside>

      <TreeViewTabArea
        v-if="isTabContentVisible"
        :model="treeView.tabsModel"
        :actions="treeView.controller"
        :workspace-path="treeView.selectedWorkspaceRef.value?.workspacePath ?? null"
        :root-folder="treeView.rootFolder.value"
        :is-multiline="isTabMultiline"
        :is-folder-tab-visible="isFolderTabVisible"
        :is-item-tab-visible="isItemTabVisible"
        :item-label="itemLabel"
        :context-menu-area="contextMenuArea"
        @create-workspace="createWorkspace"
        @draft-created="report(treeView.synchronizeDraftCreated($event))"
        @draft-published="report(treeView.synchronizeDraftPublished($event))"
        @tabs-changed="report(treeView.synchronizeTabs())"
        @error="reportError"
        @message="showMessage"
      >
        <template #tabHeaderLeading>
          <button
            v-if="isSidebarCollapsed"
            type="button"
            class="tree-view__expand"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            @click="isSidebarCollapsed = false"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
        </template>
        <template v-if="$slots.tabItemIcon" #tabItemIcon="slotProps"><slot name="tabItemIcon" v-bind="slotProps"></slot></template>
        <template #tabOverlay="slotProps"><slot name="tabOverlay" v-bind="slotProps"></slot></template>
        <template #tabPage="slotProps"><slot name="tabPage" v-bind="slotProps"></slot></template>
      </TreeViewTabArea>
    </SplitContainer>

    <PopupToast ref="popupToast" />

    <div
      v-if="workspaceDialog !== null"
      class="tree-view-dialog-backdrop"
      @pointerdown.self="closeWorkspaceDialog"
    >
      <form
        class="tree-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-view-create-workspace-title"
        @submit.prevent="submitWorkspace"
        @keydown.escape.prevent="closeWorkspaceDialog"
      >
        <header class="tree-view-dialog__header">
          <h2 id="tree-view-create-workspace-title">Create workspace</h2>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            :disabled="workspaceDialog.isSubmitting"
            @click="closeWorkspaceDialog"
          >×</button>
        </header>
        <label class="tree-view-dialog__body" for="tree-view-workspace-name">
          <span>Workspace name</span>
          <input
            id="tree-view-workspace-name"
            type="text"
            :value="workspaceDialog.name"
            :disabled="workspaceDialog.isSubmitting"
            :aria-invalid="workspaceDialog.error.length > 0"
            autofocus
            @input="updateWorkspaceName"
          />
          <span v-if="workspaceDialog.error.length > 0" class="tree-view-dialog__error" role="alert">
            {{ workspaceDialog.error }}
          </span>
        </label>
        <footer class="tree-view-dialog__actions">
          <button type="button" :disabled="workspaceDialog.isSubmitting" @click="closeWorkspaceDialog">Cancel</button>
          <button type="submit" class="is-primary" :disabled="workspaceDialog.isSubmitting">
            {{ workspaceDialog.isSubmitting ? "Creating..." : "Create" }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.tree-view { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; overflow: hidden; color: var(--color-text); background: transparent; font-size: 13px; line-height: 1.4; user-select: none; }
.tree-view :is(input, textarea) { user-select: text; }
.tree-view__layout { flex: 1; overflow: hidden; }
.tree-view__sidebar { min-width: 200px; max-width: 480px; flex: none; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--color-default-bg); border: 1px solid var(--color-border); border-radius: 0; }
.tree-view__sidebar.is-tree-only { max-width: none; flex: 1; }
.tree-view__sidebar-header { height: var(--tree-row-height); min-height: var(--tree-row-height); display: flex; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border-bottom: 1px solid var(--color-divider); }
.tree-view__sidebar-header.is-multiline { height: calc(var(--tree-row-height) + 2 * var(--space-1)); min-height: calc(var(--tree-row-height) + 2 * var(--space-1)); padding-block: var(--space-1); }
.tree-view__sidebar-header button { width: 28px; height: var(--tree-row-height); border: 1px solid transparent; border-radius: var(--radius-medium); color: var(--color-text-muted); background: transparent; cursor: pointer; }
.tree-view__sidebar-header button:hover, .tree-view__expand:hover { color: var(--color-text); background: var(--color-surface-raised); }
.tree-view__sidebar-header .tree-view__create-workspace { color: var(--color-text-muted); background: transparent; font-size: 16px; line-height: 1; }
.tree-view__sidebar-header .tree-view__collapse { width: 24px; height: var(--tree-row-height); display: grid; place-items: center; flex: 0 0 24px; padding: 0; border: 0; }
.tree-view__collapse svg, .tree-view__expand svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
.tree-view__expand { width: 24px; height: 32px; display: grid; place-items: center; align-self: center; flex: 0 0 24px; padding: 0; margin-inline-end: var(--space-2); border: 0; border-radius: 0; color: var(--color-text-muted); background: transparent; cursor: pointer; }
.tree-view-dialog-backdrop { position: fixed; z-index: 220; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--color-backdrop-strong); }
.tree-view-dialog { width: min(500px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-surface-raised); box-shadow: var(--shadow-dialog); }
.tree-view-dialog__header, .tree-view-dialog__actions { min-height: 48px; display: flex; align-items: center; padding-inline: var(--space-4); }
.tree-view-dialog__header { justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.tree-view-dialog__header h2 { margin: 0; font-size: 16px; }
.tree-view-dialog__header button { width: 28px; height: 28px; padding: 0; border: 0; color: var(--color-text-muted); background: transparent; font-size: 20px; cursor: pointer; }
.tree-view-dialog__body { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); color: var(--color-text-muted); font-size: 13px; }
.tree-view-dialog__body input { height: 36px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-bg); }
.tree-view-dialog__body input:focus-visible { border-color: var(--color-primary); outline: 0; box-shadow: inset 0 0 0 1px var(--color-primary); }
.tree-view-dialog__error { color: var(--color-danger); }
.tree-view-dialog__actions { justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); }
.tree-view-dialog__actions button { min-width: 72px; height: 32px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: transparent; cursor: pointer; }
.tree-view-dialog__actions button.is-primary { border-color: var(--color-primary); color: var(--color-bg); background: var(--color-primary); font-weight: 600; }
.tree-view-dialog button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef, useTemplateRef } from "vue";
import type { CommandFolderData, CommandTreeViewDataProvider } from "../../../../../../common/command";
import { commandItemDataSerializer } from "../../../../../../common/command";
import type { RemoteObject } from "../../../../../../common/ipc_bridge/rpc";
import {
  createCommandTreeViewDataProvider,
  destroyTreeViewDataProvider,
  initializeTreeViewDataNotifier,
} from "../../../../bridge/remote_rpc_objects/treeViewDataProvider";
import { confirmDialog, hasConfirmDialogRequest } from "../../../../components/confirmDialog";
import type { ConfirmDialogAction } from "../../../../components/confirmDialogTypes";
import { runWithOperationProgress } from "../../../../components/operationProgressDialog";
import {
  TreeView,
  TreeViewComponent,
  TreeViewDataNotifierRpcObject,
} from "../../../../components/treeView";
import { gMainApplication } from "../../main";
import CommandScriptIcon from "./CommandScriptIcon.vue";
import { gCommandSettings } from "./commandSettings";
import CommandTabPage from "./CommandTabPage.vue";
import type {
  CommandTabPageApi,
  CommandTabPageState,
} from "./commandTabPageTypes";

type GuardDecision = "save" | "discard" | "cancel";
type GuardReason = "close-tabs" | "switch-workspace";
type RunningGuardDecision = "close-all" | "skip" | "cancel";
type DeleteStorageDecision = "delete" | "cancel";
type TabState = Readonly<{
  isDirty: boolean;
  isRunning: boolean;
}>;

const treeView = shallowRef<TreeView | null>(null);
const tabStates = shallowRef<ReadonlyMap<string, TabState>>(new Map());
const error = shallowRef("");
const commandPage = useTemplateRef<HTMLElement>("commandPage");
const tabPages = new Map<string, CommandTabPageApi>();
let provider: RemoteObject<CommandTreeViewDataProvider> | null = null;
let commandTreeView: TreeView | null = null;
const GUARD_ACTIONS: readonly ConfirmDialogAction<GuardDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "discard", label: "Don't Save" },
  { id: "save", label: "Save", appearance: "primary", isDefault: true },
];
const RUNNING_CLOSE_ACTIONS: readonly ConfirmDialogAction<RunningGuardDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "skip", label: "Skip" },
  { id: "close-all", label: "Close all", appearance: "primary", isDefault: true },
];
const RUNNING_SINGLE_CLOSE_ACTIONS: readonly ConfirmDialogAction<RunningGuardDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "close-all", label: "Close", appearance: "primary", isDefault: true },
];
const RUNNING_SWITCH_ACTIONS: readonly ConfirmDialogAction<RunningGuardDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "close-all", label: "Close all", appearance: "primary", isDefault: true },
];
const DELETE_STORAGE_ACTIONS: readonly ConfirmDialogAction<DeleteStorageDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "delete", label: "Delete and reload", appearance: "primary" },
];

onMounted(() => {
  window.addEventListener("keydown", onWindowKeydown);
  void initialize().catch((reason: unknown) => {
    error.value = errorMessage(reason);
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  tabPages.clear();
  const currentProvider = provider;
  provider = null;
  if (currentProvider !== null) {
    void destroyTreeViewDataProvider(currentProvider).catch((reason: unknown) => {
      console.error("Failed to dispose Command TreeView provider:", reason);
    });
  }
});

async function initialize(): Promise<void> {
  await gCommandSettings.initialize();
  const commandProvider = await createCommandTreeViewDataProvider(
    gMainApplication.window.getPeer(),
  );
  provider = commandProvider;
  const model = new TreeView({
    dataProvider: commandProvider,
    shouldCreateDefaultWorkspace: true,
    defaultWorkspaceName: "default",
  });
  commandTreeView = model;
  installTabGuards(model);
  const notifier = new TreeViewDataNotifierRpcObject(model.controller);
  await initializeTreeViewDataNotifier(commandProvider, notifier);
  await model.controller.initialize();
  treeView.value = model;
}

async function revealCommandStorage(): Promise<void> {
  try {
    await requireProvider().revealStorage();
  } catch (reason: unknown) {
    error.value = errorMessage(reason);
  }
}

async function deleteCommandStorageAndReload(): Promise<void> {
  const decision = await confirmDialog({
    title: "Delete old Command data?",
    descriptions: [
      "All Command workspaces, folders, commands, and parameters will be permanently deleted.",
      "A new default workspace will be created after deletion.",
    ],
    actions: DELETE_STORAGE_ACTIONS,
    cancelActionId: "cancel",
  });
  if (decision === "cancel") return;
  try {
    await runWithOperationProgress("Deleting old Command data...", async () => {
      const commandProvider = requireProvider();
      const model = commandTreeView;
      if (model === null) throw new Error("Command workspace is unavailable");
      await commandProvider.deleteStorage();
      await model.controller.initialize();
      tabPages.clear();
      tabStates.value = new Map();
      treeView.value = model;
      error.value = "";
    });
  } catch (reason: unknown) {
    error.value = errorMessage(reason);
  }
}

function requireProvider(): RemoteObject<CommandTreeViewDataProvider> {
  if (provider === null) throw new Error("Command storage is unavailable");
  return provider;
}

function installTabGuards(model: TreeView): void {
  const closeTabs = model.operations.closeTabs;
  const switchWorkspace = model.operations.switchWorkspace;
  model.operations.closeTabs = async (params): Promise<void> => {
    const dirtyIds = params.tabIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
    if (!await prepareToLeave("close-tabs", dirtyIds)) return;
    const skippedIds = await prepareRunningTerminals("close-tabs", params.tabIds);
    if (skippedIds === null) return;
    const tabIds = params.tabIds.filter((id) => !skippedIds.has(id));
    if (tabIds.length > 0) await closeTabs({ ...params, tabIds });
  };
  model.operations.switchWorkspace = async (workspaceName): Promise<void> => {
    const pageIds = [...tabPages.keys()];
    const dirtyIds = pageIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
    if (!await prepareToLeave("switch-workspace", dirtyIds)) return;
    if (await prepareRunningTerminals("switch-workspace", pageIds) === null) return;
    await switchWorkspace(workspaceName);
  };
}

async function prepareToLeave(
  reason: GuardReason,
  dirtyIds: readonly string[],
): Promise<boolean> {
  if (dirtyIds.length === 0) return true;
  const decision = await confirmDialog({
    title: "Unsaved changes",
    descriptions: [
      dirtyIds.length === 1
        ? "This editor has unsaved changes."
        : `${dirtyIds.length} editors have unsaved changes.`,
      reason === "switch-workspace" ? "Save before switching workspace?" : "Save before closing?",
    ],
    actions: GUARD_ACTIONS,
    cancelActionId: "cancel",
  });
  if (decision === "cancel") return false;
  if (decision === "save") {
    for (const id of dirtyIds) await tabPages.get(id)?.save();
  }
  return true;
}

async function prepareRunningTerminals(
  reason: GuardReason,
  pageIds: readonly string[],
): Promise<ReadonlySet<string> | null> {
  const runningPages = pageIds
    .map((id) => tabPages.get(id))
    .filter((page): page is CommandTabPageApi => page?.isRunning() ?? false);
  if (runningPages.length === 0) return new Set();
  const decision = await confirmDialog({
    title: "Commands are running",
    descriptions: [
      runningPages.length === 1
        ? "A running command will be affected."
        : `${runningPages.length} running commands will be affected.`,
      reason === "switch-workspace"
        ? "Stop running commands before switching workspace?"
        : "Stop running commands before closing?",
    ],
    details: runningPages.map((page) => ({
      id: page.id,
      label: treeView.value?.getItemById(page.id)?.name ?? "Command",
    })),
    actions: reason === "switch-workspace"
      ? RUNNING_SWITCH_ACTIONS
      : runningPages.length === 1 ? RUNNING_SINGLE_CLOSE_ACTIONS : RUNNING_CLOSE_ACTIONS,
    cancelActionId: "cancel",
  });
  if (decision === "cancel") return null;
  if (decision === "skip" && reason === "close-tabs") {
    return new Set(runningPages.map((page) => page.id));
  }
  for (const page of runningPages) await page.stopRunning();
  return new Set();
}

function registerTabPage(api: CommandTabPageApi): void {
  tabPages.set(api.id, api);
}

function unregisterTabPage(api: CommandTabPageApi): void {
  if (tabPages.get(api.id) !== api) return;
  tabPages.delete(api.id);
  const next = new Map(tabStates.value);
  next.delete(api.id);
  tabStates.value = next;
}

function updateTabState(state: CommandTabPageState): void {
  const next = new Map(tabStates.value);
  next.set(state.id, {
    isDirty: state.isDirty,
    isRunning: state.isRunning,
  });
  tabStates.value = next;
}

function getOpenFolderData(id: string): CommandFolderData | null {
  return tabPages.get(id)?.getFolderData() ?? null;
}

function onWindowKeydown(event: KeyboardEvent): void {
  const page = commandPage.value;
  if (event.altKey
    || (!event.ctrlKey && !event.metaKey)
    || event.key.toLocaleLowerCase("en-US") !== "s"
    || page === null
    || page.getClientRects().length === 0
    || hasConfirmDialogRequest()) return;
  const activeTabId = treeView.value?.activeTab?.id;
  if (activeTabId === undefined) return;
  const activeTabPage = tabPages.get(activeTabId);
  if (activeTabPage === undefined) return;
  event.preventDefault();
  if (!activeTabPage.isDirty()) return;
  void activeTabPage.save().catch(() => undefined);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
</script>

<template>
  <section ref="commandPage" class="command-page">
    <TreeViewComponent
      v-if="treeView !== null"
      :tree-view="treeView"
      :create-item-data="commandItemDataSerializer.getDefault"
      :is-tab-multiline="true"
      folder-label="Folder"
      item-label="Command"
    >
      <template #itemIcon="{ item }">
        <span
          v-if="tabStates.get(item.properties.id)?.isRunning"
          class="command-running-indicator"
          role="status"
          aria-label="Command is running"
          title="Command is running"
        ></span>
        <CommandScriptIcon v-else :item="item" />
      </template>

      <template #tabOverlay="{ entity }">
        <span
          v-if="tabStates.get(entity.properties.id)?.isDirty"
          class="command-tab-dirty"
          aria-label="Unsaved changes"
          title="Unsaved changes"
        ></span>
      </template>

      <template #tabPage="{ entity, requestDraftSave }">
        <CommandTabPage
          :entity="entity"
          :tree-view="treeView"
          :get-open-folder-data="getOpenFolderData"
          :request-draft-save="requestDraftSave"
          @register="registerTabPage"
          @unregister="unregisterTabPage"
          @state-change="updateTabState"
        />
      </template>
    </TreeViewComponent>

    <div v-else-if="error.length > 0" class="command-page__error" role="alert">
      <p>{{ error }}</p>
      <div class="command-page__error-actions">
        <button type="button" @click="revealCommandStorage">Reveal in File Explorer</button>
        <button type="button" class="is-danger" @click="deleteCommandStorageAndReload">
          Delete Old Data and Reload
        </button>
      </div>
    </div>
    <p v-else class="command-page__state" role="status">Loading Command workspace...</p>

  </section>
</template>

<style scoped>
.command-page {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.command-page__state {
  margin: auto;
  color: var(--color-text-muted);
}

.command-page__error {
  max-width: min(560px, calc(100% - 32px));
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
}

.command-page__error p {
  margin: 0;
}

.command-page__error-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.command-page__error-actions button {
  min-height: 32px;
  padding-inline: var(--space-4);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  cursor: pointer;
}

.command-page__error-actions button:hover {
  background: color-mix(in srgb, var(--color-text) 9%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-border) 58%, var(--color-text-muted));
}

.command-page__error-actions button.is-danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 65%, var(--color-border));
}

.command-page__error-actions button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.command-page :deep(.tree-view__breadcrumb) {
  padding-block: 0;
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.command-tab-dirty {
  position: absolute;
  top: 50%;
  right: 27px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  transform: translateY(-50%);
  box-shadow: 0 0 0 2px var(--color-surface-raised);
}

.command-running-indicator {
  display: block;
  width: 14px;
  height: 14px;
  margin: 1px;
  border: 2px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  border-block-start-color: var(--color-primary);
  border-radius: 50%;
  animation: command-running-spin 0.8s linear infinite;
}

@keyframes command-running-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .command-running-indicator {
    animation: none;
    border-color: var(--color-primary);
  }
}

</style>

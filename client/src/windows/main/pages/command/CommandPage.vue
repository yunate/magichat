<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  commandParamSerializer,
  commandWorkspaceDataSerializer,
  type CommandEnvTarget,
  type CommandEnvUpdate,
  type CommandFolderData,
  type CommandItemData,
  type CommandParam,
  type CommandParamGroup,
  type CommandStorageServerRpcApi,
  type CommandWorkspaceData,
} from "../../../../../../common/command";
import {
  commandConfigSerializer,
  type CommandConfig,
} from "../../../../../../common/config/command";
import type { ScriptType } from "../../../../../../common/tasks/scriptTaskDefinition";
import type { TerminalRunRequest } from "../../../../../../common/terminal";
import type {
  TreeViewEntityData,
  TreeViewFolder,
  TreeViewItem,
} from "../../../../../../common/treeView";
import type { RemoteObject } from "../../../../../../common/ipc_bridge/rpc";
import {
  disposeCommandClient,
  initializeCommandClient,
} from "../../../../bridge/remote_rpc_objects/commandStorage";
import {
  confirmActionDialog,
  confirmDialog,
  hasConfirmDialogRequest,
  showAlertDialog,
} from "../../../../components/confirmDialog";
import type { ConfirmDialogAction } from "../../../../components/confirmDialogTypes";
import { runWithOperationProgress } from "../../../../components/operationProgressDialog";
import { gMessageStore } from "../../../../messages/messageStore";
import {
  TreeView,
  TreeViewComponent,
} from "../../../../components/treeView";
import { gMainApplication } from "../../main";
import {
  createCommandCliRunRequest,
  resolveCommandMacroTarget,
  type CommandMacroTarget,
} from "./commandCli";
import CommandScriptIcon from "./CommandScriptIcon.vue";
import { CommandClientRpcObject } from "./commandClientRpcObject";
import CommandEnvPanel from "./CommandEnvPanel.vue";
import {
  gCommandBeforeAppQuitCallback,
  gCommandBeforeSettingsSaveCallback,
  gCommandEnvCallback,
  gCommandEnvPanelOpen,
  gCommandRefreshCallback,
} from "./commandPageCallbacks";
import { gCommandSettings } from "./commandSettings";
import CommandTabPage from "./CommandTabPage.vue";
import type {
  CommandTabPageApi,
  CommandTabPageState,
} from "./commandTabPageTypes";

type GuardDecision = "save" | "discard" | "cancel";
type GuardReason = "close-tabs" | "switch-workspace" | "refresh" | "close-app";
type RunningGuardDecision = "close-all" | "skip" | "cancel";
type TabState = Readonly<{
  isDirty: boolean;
  isRunning: boolean;
  scriptType: ScriptType | null;
}>;

const treeView = shallowRef<TreeView | null>(null);
const tabStates = shallowRef<ReadonlyMap<string, TabState>>(new Map());
const itemScriptTypes = shallowRef<ReadonlyMap<string, ScriptType>>(new Map());
const error = shallowRef("");
const currentConfig = ref<CommandConfig>(commandConfigSerializer.getDefault());
const workspaceData = shallowRef<CommandWorkspaceData>(commandWorkspaceDataSerializer.getDefault());
const commandPage = useTemplateRef<HTMLElement>("commandPage");
const envPanel = useTemplateRef<{ requestClose: () => Promise<boolean> }>("envPanel");
const workspaceName = computed(() => treeView.value?.selectedWorkspaceRef.value?.workspaceName ?? null);
const tabPages = new Map<string, CommandTabPageApi>();
let commandStorage: RemoteObject<CommandStorageServerRpcApi> | null = null;
let commandTreeView: TreeView | null = null;
let unregisterBeforeAppQuitHandler: (() => void) | null = null;
let unregisterBeforeSettingsSaveHandler: (() => void) | null = null;
let unregisterEnvHandler: (() => void) | null = null;
let unregisterRefreshHandler: (() => void) | null = null;
let unregisterItemScriptTypeLoader: (() => void) | null = null;
let workspaceDataOperation: Promise<void> = Promise.resolve();
let workspaceExtensions: TreeViewEntityData["extends"] = [];
let scriptTypeWorkspacePath: string | null = null;
const attemptedScriptTypeItems = new Set<string>();
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

onMounted(() => {
  unregisterBeforeAppQuitHandler = gCommandBeforeAppQuitCallback.register(beforeAppQuit);
  unregisterBeforeSettingsSaveHandler = gCommandBeforeSettingsSaveCallback.register(
    beforeSettingsSave,
  );
  unregisterEnvHandler = gCommandEnvCallback.register(toggleEnvPanel);
  unregisterRefreshHandler = gCommandRefreshCallback.register(refreshCurrentRoot);
  window.addEventListener("keydown", onWindowKeydown);
  void initializePage();
});

onUnmounted(() => {
  unregisterBeforeAppQuitHandler?.();
  unregisterBeforeAppQuitHandler = null;
  unregisterBeforeSettingsSaveHandler?.();
  unregisterBeforeSettingsSaveHandler = null;
  unregisterEnvHandler?.();
  unregisterEnvHandler = null;
  unregisterRefreshHandler?.();
  unregisterRefreshHandler = null;
  unregisterItemScriptTypeLoader?.();
  unregisterItemScriptTypeLoader = null;
  gCommandEnvPanelOpen.value = false;
  window.removeEventListener("keydown", onWindowKeydown);
  tabPages.clear();
  const currentTreeView = commandTreeView;
  commandTreeView = null;
  if (currentTreeView !== null) {
    void currentTreeView.dispose().catch((reason: unknown) => {
      console.error("Failed to dispose Command TreeView provider:", reason);
    });
  }
  const currentCommandStorage = commandStorage;
  commandStorage = null;
  if (currentCommandStorage !== null) {
    void disposeCommandClient(currentCommandStorage).catch((reason: unknown) => {
      console.error("Failed to dispose Command Client:", reason);
    });
  }
});

async function initialize(): Promise<void> {
  currentConfig.value = await gCommandSettings.getConfig();
  commandStorage = await gMainApplication.window.getCommandStorageServerRpcObject();
  await initializeCommandClient(
    commandStorage,
    new CommandClientRpcObject(setEnv, call),
  );
  const activeRoot = currentConfig.value.roots.find(
    (root) => root.key === currentConfig.value.activeRootKey,
  );
  if (activeRoot === undefined) throw new Error("Command active root does not exist");
  const storageRoots = await commandStorage.resolveRoots([activeRoot]);
  const model = new TreeView({
    storageRoots,
  });
  commandTreeView = model;
  installTabGuards(model);
  unregisterItemScriptTypeLoader = watch(model.rootFolder, () => {
    scheduleItemScriptTypes(model);
  });
  await model.controller.initialize();
  treeView.value = model;
}

async function loadWorkspaceData(model: TreeView): Promise<void> {
  const workspaceRef = model.selectedWorkspaceRef.value;
  resetItemScriptTypes(workspaceRef?.workspacePath ?? null);
  if (workspaceRef === null) {
    workspaceData.value = commandWorkspaceDataSerializer.getDefault();
    workspaceExtensions = [];
    return;
  }
  const entityData = await model.operations.getEntityData({
    kind: "workspace",
    path: workspaceRef.workspacePath,
  });
  workspaceData.value = entityData.dataJson === null
    ? commandWorkspaceDataSerializer.getDefault()
    : commandWorkspaceDataSerializer.fromJson(entityData.dataJson);
  workspaceExtensions = entityData.extends;
  scheduleItemScriptTypes(model);
}

function scheduleItemScriptTypes(model: TreeView): void {
  const workspacePath = model.selectedWorkspaceRef.value?.workspacePath ?? null;
  if (workspacePath !== scriptTypeWorkspacePath) resetItemScriptTypes(workspacePath);
  if (workspacePath === null) return;
  const items = collectTreeItems(model.rootFolder.value);
  for (const item of items) {
    const key = `${item.properties.id}:${item.path}`;
    if (attemptedScriptTypeItems.has(key)) continue;
    attemptedScriptTypeItems.add(key);
    model.enqueueBackgroundTask(async () => {
      try {
        const entityData = await model.operations.getEntityData({ kind: "item", path: item.path });
        const data = commandItemDataSerializer.fromEntityData(entityData);
        const currentItem = model.findLoadedItemByPath(item.path);
        if (model.selectedWorkspaceRef.value?.workspacePath !== workspacePath
          || currentItem?.properties.id !== item.properties.id) return;
        const next = new Map(itemScriptTypes.value);
        next.set(item.properties.id, data.scriptType);
        itemScriptTypes.value = next;
      } catch (reason: unknown) {
        console.warn(`[command] skipped invalid item "${item.path}"`, reason);
      }
    });
  }
}

function resetItemScriptTypes(workspacePath: string | null): void {
  scriptTypeWorkspacePath = workspacePath;
  attemptedScriptTypeItems.clear();
  itemScriptTypes.value = new Map();
}

function collectTreeItems(root: TreeViewFolder | null): TreeViewItem[] {
  if (root === null) return [];
  return [
    ...root.items,
    ...root.folders.flatMap((folder) => collectTreeItems(folder)),
  ];
}

async function call(
  requestedPath: string,
  sourceCommandPath: string | null,
): Promise<TerminalRunRequest> {
  return createCommandCliRunRequest(
    commandTreeView,
    getSelectedEnvParams(workspaceData.value),
    requestedPath,
    sourceCommandPath,
  );
}

function enqueueWorkspaceDataOperation(operation: () => Promise<void>): Promise<void> {
  const result = workspaceDataOperation.then(operation);
  workspaceDataOperation = result.then(() => undefined, () => undefined);
  return result;
}

async function setEnv(
  updates: readonly CommandEnvUpdate[],
  target: CommandEnvTarget | null,
): Promise<void> {
  try {
    await enqueueWorkspaceDataOperation(async () => {
      if (updates.length === 0) throw new Error("At least one environment variable is required");
      for (const update of updates) {
        commandParamSerializer.validate({ ...update, enabled: true });
      }
      const model = commandTreeView;
      const workspaceRef = model?.selectedWorkspaceRef.value;
      if (model === null || workspaceRef === null || workspaceRef === undefined) {
        throw new Error("Command workspace is unavailable");
      }
      if (target !== null) {
        await persistTargetParams(model, await resolveCommandMacroTarget(model, target), updates);
        return;
      }
      const entityData = await model.controller.getEntityData({
        kind: "workspace",
        path: workspaceRef.workspacePath,
      });
      const current = entityData.dataJson === null
        ? commandWorkspaceDataSerializer.getDefault()
        : commandWorkspaceDataSerializer.fromJson(entityData.dataJson);
      const nextData: CommandWorkspaceData = {
        ...current,
        envGroups: current.envGroups.map((group) => group.id === current.selectedEnvGroupId
          ? {
              ...group,
              params: updates.reduce(
                (params, update) => updateEnv(params, update.key, update.value),
                [...group.params],
              ),
            }
          : group),
      };
      await persistWorkspaceData(model, workspaceRef.workspacePath, nextData, entityData.extends);
    });
  } catch (reason: unknown) {
    gMessageStore.pushMessage("error", errorMessage(reason));
    throw reason;
  }
}

async function persistTargetParams(
  model: TreeView,
  target: CommandMacroTarget,
  updates: readonly CommandEnvUpdate[],
): Promise<void> {
  const entityData = await model.controller.getEntityData(target);
  if (target.kind === "workspace") {
    const current = entityData.dataJson === null
      ? commandWorkspaceDataSerializer.getDefault()
      : commandWorkspaceDataSerializer.fromJson(entityData.dataJson);
    const next: CommandWorkspaceData = {
      ...current,
      envGroups: updateSelectedParamGroup(current.envGroups, current.selectedEnvGroupId, updates),
    };
    await persistWorkspaceData(model, target.path, next, entityData.extends);
    return;
  }
  if (target.kind === "folder") {
    const current = entityData.dataJson === null
      ? commandFolderDataSerializer.getDefault()
      : commandFolderDataSerializer.fromJson(entityData.dataJson);
    const next: CommandFolderData = {
      ...current,
      paramGroups: updateSelectedParamGroup(current.paramGroups, current.selectedParamGroupId, updates),
    };
    await model.controller.updateEntityData(target, {
      dataJson: commandFolderDataSerializer.toJson(next),
      extends: entityData.extends,
    });
    await notifyPersistedFolderParams(model, target.path, next, updates);
    return;
  }
  const current = commandItemDataSerializer.fromEntityData(entityData);
  const next: CommandItemData = {
    ...current,
    paramGroups: updateSelectedParamGroup(current.paramGroups, current.selectedParamGroupId, updates),
  };
  await model.controller.updateEntityData(
    target,
    commandItemDataSerializer.toEntityData(next, entityData.extends),
  );
  const tab = model.workspace.value?.tabs.find((candidate) => (
    candidate.kind === "item" && candidate.path === target.path
  ));
  if (tab !== undefined) tabPages.get(tab.id)?.applyPersistedParams(next, updates);
}

async function notifyPersistedFolderParams(
  model: TreeView,
  folderPath: string,
  data: CommandFolderData,
  updates: readonly CommandEnvUpdate[],
): Promise<void> {
  const folder = await model.resolveFolderByPath(folderPath);
  tabPages.get(folder.properties.id)?.applyPersistedParams(data, updates);
  for (const page of tabPages.values()) {
    page.applyAncestorFolderData(folder.properties.id, data);
  }
}

function updateSelectedParamGroup(
  groups: readonly CommandParamGroup[],
  selectedGroupId: string,
  updates: readonly CommandEnvUpdate[],
): CommandParamGroup[] {
  return groups.map((group) => group.id === selectedGroupId
    ? {
        ...group,
        params: updates.reduce(
          (params, update) => updateEnv(params, update.key, update.value),
          [...group.params],
        ),
      }
    : group);
}

function saveWorkspaceData(data: CommandWorkspaceData): Promise<void> {
  return enqueueWorkspaceDataOperation(async () => {
    commandWorkspaceDataSerializer.validate(data);
    const model = commandTreeView;
    const workspaceRef = model?.selectedWorkspaceRef.value;
    if (model === null || workspaceRef === null || workspaceRef === undefined) {
      throw new Error("Command workspace is unavailable");
    }
    await persistWorkspaceData(model, workspaceRef.workspacePath, data);
  });
}

async function persistWorkspaceData(
  model: TreeView,
  workspacePath: string,
  data: CommandWorkspaceData,
  extensions: TreeViewEntityData["extends"] = workspaceExtensions,
): Promise<void> {
  const persisted = commandWorkspaceDataSerializer.fromJson(
    commandWorkspaceDataSerializer.toJson(data),
  );
  await model.controller.updateEntityData(
    { kind: "workspace", path: workspacePath },
    {
      dataJson: commandWorkspaceDataSerializer.toJson(persisted),
      extends: extensions,
    },
  );
  workspaceData.value = persisted;
  workspaceExtensions = extensions;
}

function updateEnv(env: readonly CommandParam[], key: string, value: string): CommandParam[] {
  const index = env.findIndex((param) => param.key === key);
  if (index < 0) return [...env.map((param) => ({ ...param })), { key, value, enabled: true }];
  return env.map((param, paramIndex) => paramIndex === index
    ? { key, value, enabled: true }
    : { ...param });
}

function getWorkspaceEnv(): readonly CommandParam[] {
  return getSelectedEnvParams(workspaceData.value);
}

function getSelectedEnvParams(data: CommandWorkspaceData): readonly CommandParam[] {
  const group = data.envGroups.find((candidate) => candidate.id === data.selectedEnvGroupId);
  if (group === undefined) throw new Error("Selected Workspace Environment group is unavailable");
  return group.params;
}

async function toggleEnvPanel(): Promise<void> {
  if (!gCommandEnvPanelOpen.value) {
    gCommandEnvPanelOpen.value = true;
    return;
  }
  await envPanel.value?.requestClose();
}

function closeEnvPanel(): void {
  gCommandEnvPanelOpen.value = false;
}

async function prepareEnvPanelClose(): Promise<boolean> {
  if (!gCommandEnvPanelOpen.value) return true;
  const panel = envPanel.value;
  return panel !== null && await panel.requestClose();
}

async function initializePage(): Promise<void> {
  try {
    await initialize();
  } catch (reason: unknown) {
    const message = errorMessage(reason);
    error.value = message;
    await showAlertDialog({
      title: "Command failed to load",
      descriptions: [message],
    });
  }
}

async function updateTreeViewRoots(config: CommandConfig): Promise<boolean> {
  if (!await prepareEnvPanelClose()) return false;
  const pageIds = [...tabPages.keys()];
  const dirtyIds = pageIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
  if (!await prepareToLeave("switch-workspace", dirtyIds)) return false;
  if (await prepareRunningTerminals("switch-workspace", pageIds) === null) return false;
  const model = commandTreeView;
  if (model === null) throw new Error("Command workspace is unavailable");
  const activeRoot = config.roots.find((root) => root.key === config.activeRootKey);
  if (activeRoot === undefined) throw new Error("Command active root does not exist");
  const storageRoots = await requireCommandStorage().resolveRoots([activeRoot]);
  tabStates.value = new Map();
  await model.controller.setStorageRoots(storageRoots);
  await nextTick();
  tabPages.clear();
  error.value = "";
  return true;
}

async function beforeSettingsSave(current: unknown): Promise<boolean> {
  try {
    commandConfigSerializer.validate(current);
    const nextConfig = commandConfigSerializer.fromJson(
      commandConfigSerializer.toJson(current),
    );
    const isRootConfigChanged = currentConfig.value.activeRootKey !== nextConfig.activeRootKey
      || JSON.stringify(currentConfig.value.roots) !== JSON.stringify(nextConfig.roots);
    if (isRootConfigChanged && !await updateTreeViewRoots(nextConfig)) return false;
    currentConfig.value = nextConfig;
    return true;
  } catch (reason: unknown) {
    gMessageStore.pushMessage("error", errorMessage(reason));
    throw reason;
  }
}

async function refreshCurrentRoot(): Promise<void> {
  if (!await prepareEnvPanelClose()) return;
  const model = commandTreeView;
  if (model === null) throw new Error("Command workspace is unavailable");
  const pageIds = [...tabPages.keys()];
  const dirtyIds = pageIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
  const discardedDraftIds = await prepareToLeave("refresh", dirtyIds);
  if (discardedDraftIds === null) return;
  if (await prepareRunningTerminals("refresh", pageIds) === null) return;
  await discardDrafts(discardedDraftIds);
  await model.controller.initialize();
  treeView.value = null;
  await nextTick();
  tabPages.clear();
  tabStates.value = new Map();
  treeView.value = model;
  error.value = "";
  gMessageStore.pushMessage("success", "Command root refreshed.");
}

async function revealCommandStorage(): Promise<void> {
  try {
    await requireCommandStorage().revealStorage(requireStorageRootPath());
  } catch (reason: unknown) {
    const message = errorMessage(reason);
    error.value = message;
    await showAlertDialog({
      title: "Command data could not be revealed",
      descriptions: [message],
    });
  }
}

async function deleteCommandStorageAndReload(): Promise<void> {
  const decision = await confirmActionDialog({
    title: "Delete old Command data?",
    descriptions: [
      "All Command workspaces, folders, commands, and parameters will be permanently deleted.",
      "A new default workspace will be created after deletion.",
    ],
    actionId: "delete",
    actionLabel: "Delete and reload",
  });
  if (decision === "cancel") return;
  try {
    await runWithOperationProgress("Deleting old Command data...", async () => {
      const storage = requireCommandStorage();
      const model = commandTreeView;
      if (model === null) throw new Error("Command workspace is unavailable");
      await storage.deleteStorage(requireStorageRootPath());
      await model.controller.initialize();
      tabPages.clear();
      tabStates.value = new Map();
      treeView.value = model;
      error.value = "";
    });
  } catch (reason: unknown) {
    const message = errorMessage(reason);
    error.value = message;
    await showAlertDialog({
      title: "Command data could not be deleted",
      descriptions: [message],
    });
  }
}

function requireCommandStorage(): RemoteObject<CommandStorageServerRpcApi> {
  if (commandStorage === null) throw new Error("Command storage is unavailable");
  return commandStorage;
}

function requireStorageRootPath(): string {
  const root = commandTreeView?.storageRoots[0];
  if (root === undefined) throw new Error("Command storage root is unavailable");
  return root.path;
}

function installTabGuards(model: TreeView): void {
  const initialize = model.operations.initialize;
  const reload = model.operations.reload;
  const setStorageRoots = model.operations.setStorageRoots;
  const createWorkspace = model.operations.createWorkspace;
  const deleteWorkspace = model.operations.deleteWorkspace;
  const deleteFolder = model.operations.deleteFolder;
  const deleteItem = model.operations.deleteItem;
  const closeTabs = model.operations.closeTabs;
  const switchWorkspace = model.operations.switchWorkspace;
  model.operations.initialize = async (): Promise<void> => {
    await initialize();
    await loadWorkspaceData(model);
  };
  model.operations.reload = async (): Promise<void> => {
    await reload();
    await loadWorkspaceData(model);
  };
  model.operations.setStorageRoots = async (storageRoots): Promise<void> => {
    await setStorageRoots(storageRoots);
    await loadWorkspaceData(model);
  };
  model.operations.createWorkspace = async (workspaceName): Promise<void> => {
    await createWorkspace(workspaceName);
    await loadWorkspaceData(model);
  };
  model.operations.deleteWorkspace = async (workspacePath): Promise<void> => {
    if (!await prepareEnvPanelClose()) return;
    await deleteWorkspace(workspacePath);
    await loadWorkspaceData(model);
  };
  model.operations.deleteFolder = async (folderId): Promise<void> => {
    const folder = model.getFolderById(folderId);
    if (folder === null) throw new Error("Command folder is unavailable");
    const tabIds = model.workspace.value?.tabs
      .filter((tab) => tab.path === folder.path || tab.path.startsWith(`${folder.path}/`))
      .map((tab) => tab.id) ?? [];
    if (!await prepareEntityDeletion(tabIds)) return;
    await deleteFolder(folderId);
  };
  model.operations.deleteItem = async (itemId): Promise<void> => {
    const item = model.getItemById(itemId);
    if (item === null) throw new Error("Command item is unavailable");
    const tabIds = model.workspace.value?.tabs
      .filter((tab) => tab.kind === "item" && tab.path === item.path)
      .map((tab) => tab.id) ?? [];
    if (!await prepareEntityDeletion(tabIds)) return;
    await deleteItem(itemId);
  };
  model.operations.closeTabs = async (params): Promise<void> => {
    const unsavedIds = params.tabIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
    const discardedDraftIds = await prepareToLeave("close-tabs", unsavedIds);
    if (discardedDraftIds === null) return;
    const skippedIds = await prepareRunningTerminals("close-tabs", params.tabIds);
    if (skippedIds === null) return;
    const closableIds = params.tabIds.filter((id) => !skippedIds.has(id));
    const discardedIds = [...discardedDraftIds].filter((id) => closableIds.includes(id));
    await discardDrafts(discardedIds);
    const tabIds = closableIds.filter((id) => !discardedDraftIds.has(id));
    if (tabIds.length > 0) await closeTabs({ ...params, tabIds });
  };
  model.operations.switchWorkspace = async (workspaceName): Promise<void> => {
    if (!await prepareEnvPanelClose()) return;
    const pageIds = [...tabPages.keys()];
    const unsavedIds = pageIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
    const discardedDraftIds = await prepareToLeave("switch-workspace", unsavedIds);
    if (discardedDraftIds === null) return;
    if (await prepareRunningTerminals("switch-workspace", pageIds) === null) return;
    await discardDrafts(discardedDraftIds);
    await switchWorkspace(workspaceName);
    await loadWorkspaceData(model);
  };
}

async function prepareEntityDeletion(tabIds: readonly string[]): Promise<boolean> {
  const dirtyIds = tabIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
  if (await prepareToLeave("close-tabs", dirtyIds) === null) return false;
  return await prepareRunningTerminals("close-tabs", tabIds) !== null;
}

async function beforeAppQuit(): Promise<boolean> {
  if (!await prepareEnvPanelClose()) return false;
  const pageIds = [...tabPages.keys()];
  const unsavedIds = pageIds.filter((id) => tabPages.get(id)?.isDirty() ?? false);
  const discardedDraftIds = await prepareToLeave("close-app", unsavedIds);
  if (discardedDraftIds === null) return false;
  if (await prepareRunningTerminals("close-app", pageIds) === null) return false;
  await discardDrafts(discardedDraftIds);
  return true;
}

async function prepareToLeave(
  reason: GuardReason,
  unsavedIds: readonly string[],
): Promise<ReadonlySet<string> | null> {
  if (unsavedIds.length === 0) return new Set();
  const decision = await confirmDialog({
    title: "Unsaved changes",
    descriptions: [
      unsavedIds.length === 1
        ? "This editor has unsaved changes."
        : `${unsavedIds.length} editors have unsaved changes.`,
      reason === "switch-workspace"
        ? "Save before switching workspace?"
        : reason === "refresh"
          ? "Save before refreshing?"
          : "Save before closing?",
    ],
    actions: GUARD_ACTIONS,
    cancelActionId: "cancel",
  });
  if (decision === "cancel") return null;
  if (decision === "save") {
    for (const id of unsavedIds) {
      if (await tabPages.get(id)?.save() === false) return null;
    }
    return new Set();
  }
  return new Set(unsavedIds.filter((id) => tabPages.get(id)?.isDraft() ?? false));
}

async function discardDrafts(draftIds: ReadonlySet<string> | readonly string[]): Promise<void> {
  for (const id of draftIds) await tabPages.get(id)?.discardDraft();
}

async function prepareRunningTerminals(
  reason: GuardReason,
  pageIds: readonly string[],
): Promise<ReadonlySet<string> | null> {
  const runningPages = pageIds
    .map((id) => tabPages.get(id))
    .filter((page): page is CommandTabPageApi => page?.isRunning() ?? false);
  if (runningPages.length === 0) return new Set();
  const dialogContent = {
    title: "Commands are running",
    descriptions: [
      runningPages.length === 1
        ? "A running command will be affected."
        : `${runningPages.length} running commands will be affected.`,
      reason === "switch-workspace"
        ? "Stop running commands before switching workspace?"
        : reason === "refresh"
          ? "Stop running commands before refreshing?"
          : "Stop running commands before closing?",
    ],
    details: runningPages.map((page) => ({
      id: page.id,
      label: treeView.value?.getItemById(page.id)?.name ?? "Command",
    })),
  };
  const decision: RunningGuardDecision = reason === "close-tabs" && runningPages.length > 1
    ? await confirmDialog({
      ...dialogContent,
      actions: RUNNING_CLOSE_ACTIONS,
      cancelActionId: "cancel",
    })
    : await confirmActionDialog({
      ...dialogContent,
      actionId: "close-all",
      actionLabel: reason === "close-tabs" ? "Close" : "Close all",
      isActionDefault: true,
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
    scriptType: state.scriptType,
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
      :is-tab-multiline="true"
      folder-label="Folder"
      item-label="Command"
    >
      <template #itemIcon="{ item }">
        <CommandScriptIcon
          :script-type="tabStates.get(item.properties.id)?.scriptType
            ?? itemScriptTypes.get(item.properties.id)"
          :is-running="tabStates.get(item.properties.id)?.isRunning"
        />
      </template>

      <template #tabItemIcon="{ tab }">
        <CommandScriptIcon
          :script-type="tabStates.get(tab.id)?.scriptType
            ?? itemScriptTypes.get(tab.id)"
          :is-running="tabStates.get(tab.id)?.isRunning"
        />
      </template>

      <template #tabOverlay="{ tab }">
        <span
          v-if="tabStates.get(tab.id)?.isDirty"
          class="command-tab-dirty"
          aria-label="Unsaved changes"
          title="Unsaved changes"
        ></span>
      </template>

      <template #tabPage="{ tab, entity, isActive, notifyReady, requestDraftSave }">
        <CommandTabPage
          :tab="tab"
          :entity="entity"
          :is-active="isActive"
          :notify-ready="notifyReady"
          :terminal-placement="currentConfig.terminalPlacement"
          :terminal-initial-path="currentConfig.terminalInitialPath"
          :tree-view="treeView"
          :get-open-folder-data="getOpenFolderData"
          :get-workspace-env="getWorkspaceEnv"
          :request-draft-save="requestDraftSave"
          @register="registerTabPage"
          @unregister="unregisterTabPage"
          @state-change="updateTabState"
        />
      </template>
    </TreeViewComponent>

    <div v-else-if="error.length > 0" class="command-page__error" role="alert">
      <h2>Error</h2>
      <pre class="command-page__error-message" aria-label="Error details">{{ error }}</pre>
      <div class="command-page__error-actions">
        <button type="button" @click="revealCommandStorage">Reveal in File Explorer</button>
        <button type="button" class="is-danger" @click="deleteCommandStorageAndReload">
          Delete Old Data and Reload
        </button>
      </div>
    </div>
    <p v-else class="command-page__state" role="status">Loading Command workspace...</p>

    <CommandEnvPanel
      v-if="gCommandEnvPanelOpen"
      ref="envPanel"
      :workspace-name="workspaceName"
      :data="workspaceData"
      :save-data="saveWorkspaceData"
      @close="closeEnvPanel"
    />

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
  width: calc(100% - var(--space-8));
  max-width: 460px;
  min-width: 0;
  flex: none;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.command-page__error h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
}

.command-page__error-message {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 72px;
  margin: 0;
  padding: var(--space-3);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: var(--color-text-muted);
  background: var(--color-default-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  line-height: 1.5;
  user-select: text;
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
  border-radius: var(--radius-medium);
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

</style>

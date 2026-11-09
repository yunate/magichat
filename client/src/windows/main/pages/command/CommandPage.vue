<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowReactive, shallowRef, useTemplateRef } from "vue";
import { dirname, join, relative } from "pathe";
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
import { MacroParser } from "../../../../../../common/macroParser";
import { TREE_VIEW_ITEM_FILE_EXTENSION, TreeViewPath } from "../../../../../../common/treeView";
import type {
  TreeViewEntityData,
  TreeViewStorageRoot,
} from "../../../../../../common/treeView";
import { BridgeRouter, type RemoteObject } from "../../../../../../common/ipc_bridge/rpc";
import { disposeCommandClient } from "../../../../bridge/remote_rpc_objects/commandStorage";
import {
  confirmActionDialog,
  confirmDialog,
  hasConfirmDialogRequest,
  showAlertDialog,
} from "../../../../components/confirmDialog";
import type { ConfirmDialogAction } from "../../../../components/confirmDialogTypes";
import { runWithOperationProgress } from "../../../../components/operationProgressDialog";
import {
  resolveTextEditText,
  type TextEditAdditionalParamScope,
  type TextEditParamGroup,
} from "../../../../components/textEdit";
import { gMessageStore } from "../../../../messages/messageStore";
import {
  TreeView,
  TreeViewComponent,
} from "../../../../components/treeView";
import { gMainApplication } from "../../main";
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
type CommandMacroTarget = Readonly<{
  kind: "workspace" | "folder" | "item";
  path: string;
}>;
type TabState = Readonly<{
  isDirty: boolean;
  isRunning: boolean;
  scriptType: ScriptType | null;
}>;

const treeView = shallowRef<TreeView | null>(null);
const tabStates = shallowRef<ReadonlyMap<string, TabState>>(new Map());
const error = shallowRef("");
const currentConfig = ref<CommandConfig>(commandConfigSerializer.getDefault());
const workspaceData = shallowRef<CommandWorkspaceData>(commandWorkspaceDataSerializer.getDefault());
const commandPage = useTemplateRef<HTMLElement>("commandPage");
const envPanel = useTemplateRef<{ requestClose: () => Promise<boolean> }>("envPanel");
const workspaceName = computed(() => treeView.value?.selectedWorkspaceRef.value?.workspaceName ?? null);
const tabPages = shallowReactive(new Map<string, CommandTabPageApi>());
let commandStorage: RemoteObject<CommandStorageServerRpcApi> | null = null;
let commandTreeView: TreeView | null = null;
let unregisterBeforeAppQuitHandler: (() => void) | null = null;
let unregisterBeforeSettingsSaveHandler: (() => void) | null = null;
let unregisterEnvHandler: (() => void) | null = null;
let unregisterRefreshHandler: (() => void) | null = null;
let workspaceDataOperation: Promise<void> = Promise.resolve();
let workspaceExtensions: TreeViewEntityData["extends"] = [];
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
  await commandStorage.init(
    BridgeRouter.returnRemoteObj(new CommandClientRpcObject(setEnv, call, getEnv)),
  );
  const activeRoot = currentConfig.value.roots.find(
    (root) => root.key === currentConfig.value.activeRootKey,
  );
  if (activeRoot === undefined) throw new Error("Command active root does not exist");
  const storageRoots = await commandStorage.resolveRoots([activeRoot]);
  await recreateTreeView(null, storageRoots);
}

async function recreateTreeView(
  previousTreeView: TreeView | null,
  storageRoots: readonly TreeViewStorageRoot[],
  operation?: () => Promise<void>,
): Promise<void> {
  if (commandTreeView !== previousTreeView) return;
  const storage = commandStorage;
  treeView.value = null;
  previousTreeView?.explorerModel.dispose();
  await nextTick();
  if (commandTreeView !== previousTreeView || commandStorage !== storage) return;
  try {
    if (operation !== undefined) await operation();
    if (previousTreeView !== null) await previousTreeView.dispose();
    if (commandTreeView !== previousTreeView || commandStorage !== storage) return;
    tabPages.clear();
    tabStates.value = new Map();
    workspaceData.value = commandWorkspaceDataSerializer.getDefault();
    workspaceExtensions = [];
    const model = new TreeView({ storageRoots });
    commandTreeView = model;
    await model.controller.initialize();
    if (commandTreeView !== model || commandStorage !== storage) return;
    installTabGuards(model);
    await loadWorkspaceData(model);
    if (commandTreeView !== model || commandStorage !== storage) return;
    error.value = "";
    treeView.value = model;
  } catch (reason: unknown) {
    error.value = errorMessage(reason);
    throw reason;
  }
}

async function loadWorkspaceData(model: TreeView): Promise<void> {
  if (commandTreeView !== model) return;
  const workspaceRef = model.selectedWorkspaceRef.value;
  if (workspaceRef === null) {
    workspaceData.value = commandWorkspaceDataSerializer.getDefault();
    workspaceExtensions = [];
    return;
  }
  const entityData = await model.operations.getEntityData({
    kind: "workspace",
    path: workspaceRef.workspacePath,
  });
  if (commandTreeView !== model) return;
  workspaceData.value = entityData.dataJson === null
    ? commandWorkspaceDataSerializer.getDefault()
    : commandWorkspaceDataSerializer.fromJson(entityData.dataJson);
  workspaceExtensions = entityData.extends;
}

function resolveIconScriptType(description: string | undefined): ScriptType | undefined {
  if (description === "powershell" || description === "node"
    || description === "python" || description === "cmd") return description;
  return undefined;
}

async function call(
  requestedPath: string,
  sourceCommandPath: string | null,
): Promise<TerminalRunRequest> {
  const model = commandTreeView;
  const workspaceRef = model?.selectedWorkspaceRef.value;
  if (model === null || workspaceRef === null || workspaceRef === undefined) {
    throw new Error("Command workspace is unavailable");
  }
  const workspaceEnv = getSelectedEnvParams(workspaceData.value);
  const itemPath = resolveCliPath(requestedPath, workspaceRef.workspacePath, sourceCommandPath);
  const item = await model.resolveItemByPath(itemPath);
  const entityData = await model.controller.getEntityData({ kind: "item", path: item.path });
  const data = commandItemDataSerializer.fromEntityData(entityData);
  if (data.content.length === 0) {
    throw new Error(`Called Command has no content: ${JSON.stringify(requestedPath)}`);
  }

  const folderScopes: TextEditAdditionalParamScope[] = [];
  for (const folderPath of collectAncestorFolderPaths(workspaceRef.workspacePath, item.path)) {
    const { dataJson: folderDataJson } = await model.controller.getEntityData({
      kind: "folder",
      path: folderPath,
    });
    const folderData = folderDataJson === null
      ? commandFolderDataSerializer.getDefault()
      : commandFolderDataSerializer.fromJson(folderDataJson);
    const group = getSelectedParamGroup(folderData.paramGroups, folderData.selectedParamGroupId, "folder");
    folderScopes.push({
      label: "Folder",
      sourcePath: relative(dirname(workspaceRef.workspacePath), folderPath),
      params: group.params,
    });
  }
  const selectedGroup = getSelectedParamGroup(data.paramGroups, data.selectedParamGroupId, "Command");
  const itemGroup: TextEditParamGroup = {
    id: selectedGroup.id,
    name: selectedGroup.name,
    sourceType: "Command",
    sourcePath: relative(dirname(workspaceRef.workspacePath), item.path),
    params: selectedGroup.params,
  };
  const environmentScopes: readonly TextEditAdditionalParamScope[] = [{
    label: "Environment",
    sourcePath: workspaceRef.workspaceName,
    params: workspaceEnv,
  }];
  const resolution = resolveTextEditText(data.content, itemGroup, folderScopes, environmentScopes);
  if (!resolution.successful) throw new Error(resolution.error ?? "Command content could not be resolved");
  return {
    scriptId: crypto.randomUUID(),
    commandPath: item.path,
    scriptType: data.scriptType,
    scriptContent: resolution.value,
  };
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
      if (model === null) throw new Error("Command workspace is unavailable");
      await persistTargetParams(model, await resolveCommandMacroTarget(model, target), updates);
    });
  } catch (reason: unknown) {
    gMessageStore.pushMessage("error", errorMessage(reason));
    throw reason;
  }
}

async function getEnv(key: string, target: CommandEnvTarget | null): Promise<string> {
  await workspaceDataOperation;
  const model = commandTreeView;
  const workspaceRef = model?.selectedWorkspaceRef.value;
  if (model === null || workspaceRef === null || workspaceRef === undefined) {
    throw new Error("Command workspace is unavailable");
  }
  let resolvedTarget: CommandMacroTarget;
  let entityData: TreeViewEntityData;
  try {
    resolvedTarget = await resolveCommandMacroTarget(model, target);
    entityData = await model.controller.getEntityData(resolvedTarget);
  } catch (reason: unknown) {
    if (reason instanceof Error && (
      reason.message === "File does not exist" || reason.message === "Folder does not exist"
    )) return "";
    throw reason;
  }
  let params: readonly CommandParam[];
  if (resolvedTarget.kind === "workspace") {
    const data = entityData.dataJson === null
      ? commandWorkspaceDataSerializer.getDefault()
      : commandWorkspaceDataSerializer.fromJson(entityData.dataJson);
    params = getSelectedEnvParams(data);
  } else {
    const data = resolvedTarget.kind === "item"
      ? commandItemDataSerializer.fromEntityData(entityData)
      : entityData.dataJson === null
        ? commandFolderDataSerializer.getDefault()
        : commandFolderDataSerializer.fromJson(entityData.dataJson);
    params = getSelectedParamGroup(data.paramGroups, data.selectedParamGroupId, "Command").params;
  }
  const values = new Map(params.filter((param) => param.enabled).map((param) => [param.key, param.value]));
  if (!values.has(key)) return "";
  return MacroParser.replaceMacrosInText(MacroParser.formatReference(key), values);
}

async function resolveCommandMacroTarget(
  model: TreeView,
  target: CommandEnvTarget | null,
): Promise<CommandMacroTarget> {
  const workspaceRef = model.selectedWorkspaceRef.value;
  if (workspaceRef === null) throw new Error("Command workspace is unavailable");
  if (target === null || target.path === "__root__") {
    return { kind: "workspace", path: workspaceRef.workspacePath };
  }
  const targetPath = resolveCliPath(target.path, workspaceRef.workspacePath, target.sourceCommandPath);
  if (targetPath.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)) {
    await model.resolveItemByPath(targetPath);
    return { kind: "item", path: targetPath };
  }
  await model.resolveFolderByPath(targetPath);
  return { kind: "folder", path: targetPath };
}

function resolveCliPath(
  requestedPath: string,
  workspacePath: string,
  sourceCommandPath: string | null,
): string {
  const path = requestedPath.replaceAll("\\", "/");
  const isAbsolute = /^[a-zA-Z]:\//.test(path) || path.startsWith("/");
  const isExplicitRelative = path === "."
    || path === ".."
    || path.startsWith("./")
    || path.startsWith("../");
  if (isExplicitRelative && sourceCommandPath === null) {
    throw new Error("Relative paths must run from a MagicHat Command");
  }
  if (path === "." || path === "./") return sourceCommandPath ?? workspacePath;
  return TreeViewPath.normalize(
    isAbsolute
      ? path
      : join(isExplicitRelative ? sourceCommandPath ?? workspacePath : dirname(workspacePath), path),
    "CLI path",
  );
}

function collectAncestorFolderPaths(workspacePath: string, itemPath: string): string[] {
  const ancestors: string[] = [];
  let folderPath = dirname(itemPath);
  while (true) {
    ancestors.unshift(folderPath);
    if (folderPath === workspacePath) return ancestors;
    folderPath = dirname(folderPath);
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
  const tab = model.tabsModel.tabs.value.find((candidate) => (
    candidate.kind === "item" && candidate.path === target.path
  ));
  if (tab !== undefined) tabPages.get(tab.path)?.applyPersistedParams(next, updates);
}

async function notifyPersistedFolderParams(
  model: TreeView,
  folderPath: string,
  data: CommandFolderData,
  updates: readonly CommandEnvUpdate[],
): Promise<void> {
  const folder = await model.resolveFolderByPath(folderPath);
  tabPages.get(folder.path)?.applyPersistedParams(data, updates);
  onFolderDataSaved(folder.path, data);
}

function onFolderDataSaved(folderId: string, data: CommandFolderData): void {
  for (const page of tabPages.values()) {
    page.applyAncestorFolderData(folderId, data);
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
  return getSelectedParamGroup(data.envGroups, data.selectedEnvGroupId, "Workspace Environment").params;
}

function getSelectedParamGroup(
  groups: readonly CommandParamGroup[],
  selectedGroupId: string,
  label: string,
): CommandParamGroup {
  const group = groups.find((candidate) => candidate.id === selectedGroupId);
  if (group === undefined) {
    const groupLabel = label === "Workspace Environment" ? "group" : "param group";
    throw new Error(`Selected ${label} ${groupLabel} is unavailable`);
  }
  return group;
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
  const pages = [...tabPages.values()];
  const dirtyIds = pages.filter((page) => page.isDirty()).map((page) => page.path);
  if (!await prepareToLeave("switch-workspace", dirtyIds)) return false;
  if (await prepareRunningTerminals("switch-workspace", pages) === null) return false;
  const model = commandTreeView;
  if (model === null) throw new Error("Command workspace is unavailable");
  const activeRoot = config.roots.find((root) => root.key === config.activeRootKey);
  if (activeRoot === undefined) throw new Error("Command active root does not exist");
  const storageRoots = await requireCommandStorage().resolveRoots([activeRoot]);
  if (commandTreeView !== model) return false;
  await model.controller.setStorageRoots(storageRoots);
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
  const pages = [...tabPages.values()];
  const dirtyIds = pages.filter((page) => page.isDirty()).map((page) => page.path);
  const discardedDraftIds = await prepareToLeave("refresh", dirtyIds);
  if (discardedDraftIds === null) return;
  if (await prepareRunningTerminals("refresh", pages) === null) return;
  await discardDrafts(discardedDraftIds);
  await model.controller.initialize();
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
  const createWorkspace = model.operations.createWorkspace;
  const deleteWorkspace = model.operations.deleteWorkspace;
  const deleteFolder = model.operations.deleteFolder;
  const deleteItem = model.operations.deleteItem;
  const closeTabs = model.operations.closeTabs;
  const switchWorkspace = model.operations.switchWorkspace;
  model.operations.initialize = async (): Promise<void> => {
    await recreateTreeView(model, model.storageRoots);
  };
  model.operations.reload = async (): Promise<void> => {
    if (commandTreeView !== model || !await prepareEnvPanelClose()) return;
    const pages = [...tabPages.values()];
    const dirtyPaths = pages.filter((page) => page.isDirty()).map((page) => page.path);
    const discardedDrafts = await prepareToLeave("refresh", dirtyPaths);
    if (discardedDrafts === null) return;
    if (await prepareRunningTerminals("refresh", pages) === null) return;
    await discardDrafts(discardedDrafts);
    await recreateTreeView(model, model.storageRoots);
  };
  model.operations.setStorageRoots = async (storageRoots): Promise<void> => {
    await recreateTreeView(model, storageRoots);
  };
  model.operations.createWorkspace = async (workspaceName): Promise<void> => {
    if (commandTreeView !== model) return;
    if (model.selectedWorkspaceRef.value === null) {
      await recreateTreeView(model, model.storageRoots, () => createWorkspace(workspaceName));
      return;
    }
    await createWorkspace(workspaceName);
    await loadWorkspaceData(model);
  };
  model.operations.deleteWorkspace = async (workspacePath): Promise<void> => {
    if (commandTreeView !== model) return;
    if (!await prepareEnvPanelClose()) return;
    if (model.selectedWorkspaceRef.value?.workspacePath === workspacePath) {
      await recreateTreeView(model, model.storageRoots, () => deleteWorkspace(workspacePath));
      return;
    }
    await deleteWorkspace(workspacePath);
    await loadWorkspaceData(model);
  };
  model.operations.deleteFolder = async (folderPath): Promise<void> => {
    const folder = model.findLoadedFolderByPath(folderPath);
    if (folder === null) throw new Error("Command folder is unavailable");
    const tabPaths = model.tabsModel.tabs.value
      .filter((tab) => tab.path === folder.path || tab.path.startsWith(`${folder.path}/`))
      .map((tab) => tab.path);
    if (!await prepareEntityDeletion(tabPaths)) return;
    await deleteFolder(folderPath);
  };
  model.operations.deleteItem = async (itemPath): Promise<void> => {
    const item = model.findLoadedItemByPath(itemPath);
    if (item === null) throw new Error("Command item is unavailable");
    const tabPaths = model.tabsModel.tabs.value
      .filter((tab) => tab.kind === "item" && tab.path === item.path)
      .map((tab) => tab.path);
    if (!await prepareEntityDeletion(tabPaths)) return;
    await deleteItem(itemPath);
  };
  model.operations.closeTabs = async (params): Promise<void> => {
    const requestedPages = new Map<string, CommandTabPageApi>();
    for (const path of params.tabPaths) {
      const page = tabPages.get(path);
      if (page !== undefined) requestedPages.set(path, page);
    }
    const preferredPage = params.preferredActivePath === undefined
      ? undefined : tabPages.get(params.preferredActivePath);
    const unsavedIds = params.tabPaths.filter((path) => tabPages.get(path)?.isDirty() ?? false);
    const discardedDraftIds = await prepareToLeave("close-tabs", unsavedIds);
    if (discardedDraftIds === null) return;
    const requestedPaths = params.tabPaths.map((path) => requestedPages.get(path)?.path ?? path);
    const skippedIds = await prepareRunningTerminals("close-tabs", [...requestedPages.values()]);
    if (skippedIds === null) return;
    const closableIds = requestedPaths.filter((path) => !skippedIds.has(path));
    const discardedIds = [...discardedDraftIds].filter((id) => closableIds.includes(id));
    await discardDrafts(discardedIds);
    const tabPaths = closableIds.filter((path) => !discardedDraftIds.has(path));
    if (tabPaths.length > 0) await closeTabs({
      ...params,
      tabPaths,
      preferredActivePath: preferredPage?.path ?? params.preferredActivePath,
    });
  };
  model.operations.switchWorkspace = async (workspacePath): Promise<void> => {
    if (commandTreeView !== model
      || model.selectedWorkspaceRef.value?.workspacePath === workspacePath) return;
    if (!await prepareEnvPanelClose()) return;
    const pages = [...tabPages.values()];
    const unsavedIds = pages.filter((page) => page.isDirty()).map((page) => page.path);
    const discardedDraftIds = await prepareToLeave("switch-workspace", unsavedIds);
    if (discardedDraftIds === null) return;
    if (await prepareRunningTerminals("switch-workspace", pages) === null) return;
    await discardDrafts(discardedDraftIds);
    await recreateTreeView(model, model.storageRoots, () => switchWorkspace(workspacePath));
  };
}

async function prepareEntityDeletion(tabIds: readonly string[]): Promise<boolean> {
  const pages = tabIds.map((path) => tabPages.get(path))
    .filter((page): page is CommandTabPageApi => page !== undefined);
  const dirtyIds = pages.filter((page) => page.isDirty()).map((page) => page.path);
  if (await prepareToLeave("close-tabs", dirtyIds) === null) return false;
  return await prepareRunningTerminals("close-tabs", pages) !== null;
}

async function beforeAppQuit(): Promise<boolean> {
  if (!await prepareEnvPanelClose()) return false;
  const pages = [...tabPages.values()];
  const unsavedIds = pages.filter((page) => page.isDirty()).map((page) => page.path);
  const discardedDraftIds = await prepareToLeave("close-app", unsavedIds);
  if (discardedDraftIds === null) return false;
  if (await prepareRunningTerminals("close-app", pages) === null) return false;
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
  pages: readonly CommandTabPageApi[],
): Promise<ReadonlySet<string> | null> {
  const runningPages = pages.filter((page) => page.isRunning());
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
      id: page.path,
      label: treeView.value?.findLoadedItemByPath(page.path)?.name ?? "Command",
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
    return new Set(runningPages.map((page) => page.path));
  }
  for (const page of runningPages) await page.stopRunning();
  return new Set();
}

function registerTabPage(api: CommandTabPageApi): void {
  const next = new Map(tabStates.value);
  for (const [path, page] of tabPages) {
    if (page !== api || path === api.path) continue;
    tabPages.delete(path);
    const state = next.get(path);
    if (state !== undefined) next.set(api.path, state);
    next.delete(path);
  }
  tabStates.value = next;
  tabPages.set(api.path, api);
}

function unregisterTabPage(api: CommandTabPageApi): void {
  if (tabPages.get(api.path) !== api) return;
  tabPages.delete(api.path);
  const next = new Map(tabStates.value);
  next.delete(api.path);
  tabStates.value = next;
}

function updateTabState(state: CommandTabPageState): void {
  const next = new Map(tabStates.value);
  next.set(state.path, {
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
  const activeTabPath = treeView.value?.activeTab?.path;
  if (activeTabPath === undefined) return;
  const activeTabPage = tabPages.get(activeTabPath);
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
          :script-type="tabStates.get(item.path)?.scriptType
            ?? resolveIconScriptType(item.properties.iconDescription)"
          :is-running="tabStates.get(item.path)?.isRunning"
        />
      </template>

      <template #tabItemIcon="{ tab }">
        <CommandScriptIcon
          :script-type="tabStates.get(tab.path)?.scriptType
            ?? resolveIconScriptType(treeView.findLoadedItemByPath(tab.path)?.properties.iconDescription)"
          :is-running="tabStates.get(tab.path)?.isRunning"
        />
      </template>

      <template #tabOverlay="{ tab }">
        <span
          v-if="tabStates.get(tab.path)?.isDirty"
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
          :default-code-view-placement="currentConfig.codeViewPlacement"
          :terminal-initial-path="currentConfig.terminalInitialPath"
          :tree-view="treeView"
          :get-open-folder-data="getOpenFolderData"
          :get-workspace-env="getWorkspaceEnv"
          :request-draft-save="requestDraftSave"
          @register="registerTabPage"
          @unregister="unregisterTabPage"
          @folder-data-saved="onFolderDataSaved"
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
  right: calc(var(--space-1) + 10px);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  transform: translate(50%, -50%);
  box-shadow: 0 0 0 2px var(--color-surface-raised);
}

.command-page :deep(.tree-tab:has(.command-tab-dirty) .tree-tab__icon:not(:hover):not(:focus-visible) svg) {
  opacity: 0;
}

.command-page :deep(.tree-tab:has(.tree-tab__icon:hover, .tree-tab__icon:focus-visible) .command-tab-dirty) {
  opacity: 0;
}

</style>

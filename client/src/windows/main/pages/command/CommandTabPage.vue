<script setup lang="ts">
import { dirname, join, relative } from "pathe";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  type CommandEnvUpdate,
  type CommandFolderData,
  type CommandItemData,
  type CommandParam,
  type CommandParamGroup,
} from "../../../../../../common/command";
import {
  SCRIPT_TYPES,
  isScriptType,
  type ScriptType,
} from "../../../../../../common/tasks/scriptTaskDefinition";
import type {
  TreeViewEntityData,
  TreeViewFolder,
  TreeViewItem,
  TreeViewTab,
} from "../../../../../../common/treeView";
import type { TerminalPlacement } from "../../../../../../common/config/command";
import {
  TREE_VIEW_ITEM_FILE_EXTENSION,
  TreeViewPath,
} from "../../../../../../common/treeView";
import { confirmActionDialog, showAlertDialog } from "../../../../components/confirmDialog";
import { runWithOperationProgress } from "../../../../components/operationProgressDialog";
import type { PopupToastHandle } from "../../../../components/popupToast";
import PopupSelect from "../../../../components/PopupSelect.vue";
import PopupToast from "../../../../components/PopupToast.vue";
import SplitContainer from "../../../../components/SplitContainer.vue";
import { TextEditComponent } from "../../../../components/textEdit";
import type {
  TextEditAdditionalParamScope,
  TextEditCompletion,
  TextEditCompletionContext,
  TextEditParamGroup,
  TextEditTextResolution,
} from "../../../../components/textEdit";
import { TerminalComponent, type TerminalExposed } from "../../../../components/terminal";
import type { TreeView } from "../../../../components/treeView";
import type {
  CommandTabPageApi,
  CommandTabPageState,
} from "./commandTabPageTypes";
import { gMessageStore } from "../../../../messages/messageStore";
import { IS_DEBUG } from "../../../../environment";

type CommandFolderDraft = Readonly<{
  kind: "folder";
  id: string;
  data: CommandFolderData;
  baseline: CommandFolderData;
  extends: TreeViewEntityData["extends"];
}>;

type CommandItemDraft = Readonly<{
  kind: "item";
  id: string;
  data: CommandItemData;
  baseline: CommandItemData;
  extends: TreeViewEntityData["extends"];
}>;

type CommandEditorDraft = CommandFolderDraft | CommandItemDraft;
type TextEditExposed = { getResolvedText(): TextEditTextResolution };
type TerminalStatus = Readonly<{
  kind: "info" | "error";
  message: string;
}>;

type Props = {
  tab: TreeViewTab;
  entity: TreeViewFolder | TreeViewItem;
  isActive: boolean;
  notifyReady: () => void;
  terminalPlacement: TerminalPlacement;
  terminalInitialPath: string;
  treeView: TreeView;
  getOpenFolderData: (id: string) => CommandFolderData | null;
  getWorkspaceEnv: () => readonly CommandParam[];
  requestDraftSave: () => Promise<boolean>;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  register: [api: CommandTabPageApi];
  unregister: [api: CommandTabPageApi];
  stateChange: [state: CommandTabPageState];
}>();

const draft = shallowRef<CommandEditorDraft | null>(null);
const isLoading = ref(false);
const loadError = shallowRef("");
const isSaving = ref(false);
const titleError = shallowRef("");
const isTerminalActive = ref(false);
const isCommandRunning = ref(false);
const terminalStatus = shallowRef<TerminalStatus>({
  kind: "info",
  message: "Terminal not ready.",
});
const isAncestorDataLoading = ref(false);
const ancestorDataError = shallowRef("");
const ancestorDataRevision = ref(0);
const popupToast = useTemplateRef<PopupToastHandle>("popupToast");
const terminal = useTemplateRef<TerminalExposed>("terminal");
const textEdit = useTemplateRef<TextEditExposed>("textEdit");
let itemRenameOperation: Promise<string | null> | null = null;
let tabPromoteOperation: Promise<void> | null = null;
let isMounted = false;
let isRegistered = false;
let ancestorDataLoadId = 0;
const ancestorFolderData = new Map<string, CommandFolderData>();
const ancestorFolders = shallowRef<readonly TreeViewFolder[]>([]);
const TERMINAL_STATUS_CHECK_INTERVAL_MS = 1000;
const PARAM_PRIORITY_DESCRIPTION = "Priority, highest first: Workspace Environment, current group, nearest parent Folder, then outer parent Folders.";
const scriptTypeOptions = SCRIPT_TYPES.map((scriptType) => ({
  value: scriptType,
  label: scriptType,
}));
const SCRIPT_HELPERS: readonly Readonly<{
  name: string;
  description: string;
  insertText: Readonly<Record<ScriptType, string>>;
}>[] = [
  {
    name: "mhsetenv",
    description: "Persist Macro values in the selected Workspace Environment group or an optional target path.",
    insertText: {
      powershell: 'mhsetenv "${1:KEY}" "${2:value}"',
      cmd: 'call mhsetenv "${1:KEY}" "${2:value}"',
      node: 'mhsetenv({ "${1:KEY}": "${2:value}" });',
      python: 'mhsetenv({"${1:KEY}": "${2:value}"})',
    },
  },
  {
    name: "mhcall",
    description: "Run another saved Command synchronously and continue after it finishes.",
    insertText: {
      powershell: 'mhcall "${1:path/to/command.mh}"',
      cmd: 'call mhcall "${1:path/to/command.mh}"',
      node: 'mhcall("${1:path/to/command.mh}");',
      python: 'mhcall("${1:path/to/command.mh}")',
    },
  },
];

const isDirty = computed(() => draft.value !== null && isDraftDirty(draft.value));
const scriptType = computed(() => {
  const current = draft.value;
  return current?.kind === "item" ? current.data.scriptType : null;
});
const isItemDraft = ref(isTreeViewItem(props.entity) && props.entity.properties.isDraft);
const isSaveDisabled = computed(() => (!isDirty.value && !isItemDraft.value) || isSaving.value);
const paramGroups = computed<readonly TextEditParamGroup[]>(() => {
  const current = draft.value;
  if (current === null) return [];
  return current.data.paramGroups.map((group) => ({
    id: group.id,
    name: group.name,
    sourceType: current.kind === "folder" ? "Folder" : "Command",
    sourcePath: workspaceRelativePath(props.tab.path),
    params: group.params,
  }));
});
const isSideBySide = computed(() => ["left", "right"].includes(props.terminalPlacement));
const isScriptBeforeTerminal = computed(() => ["right", "bottom"].includes(
  props.terminalPlacement,
));
const api: CommandTabPageApi = {
  id: props.entity.properties.id,
  isDirty: () => isDirty.value || isItemDraft.value,
  isDraft: () => isItemDraft.value,
  isRunning: () => isCommandRunning.value,
  save,
  discardDraft,
  stopRunning,
  getFolderData,
  applyPersistedParams,
  applyAncestorFolderData,
};

watch([isDirty, isItemDraft, isCommandRunning, scriptType], () => emitState());
watch(() => props.entity.name, () => {
  titleError.value = "";
});
watch(() => props.tab.path, (path, previousPath) => {
  if (!isMounted || draft.value === null || dirname(path) === dirname(previousPath)) return;
  void refreshAncestorFolderData(path);
});
watch(() => props.isActive, (isActive) => {
  if (isMounted && isActive) void loadDraft();
});

onMounted(() => {
  isMounted = true;
  if (props.isActive) void loadDraft();
});

onUnmounted(() => {
  isMounted = false;
  if (isRegistered) emit("unregister", api);
});

function emitState(): void {
  emit("stateChange", {
    id: api.id,
    isDirty: isDirty.value || isItemDraft.value,
    isRunning: isCommandRunning.value,
    scriptType: scriptType.value,
  });
}

function onTerminalRunStatusChange(isRunning: boolean): void {
  isCommandRunning.value = isRunning;
}

function terminalMessageHandler(message: string): void {
  terminalStatus.value = { kind: "info", message };
}

function requestTabPromoted(): void {
  void ensureTabPromoted().catch((reason: unknown) => {
    popupToast.value?.show(errorMessage(reason), { level: "error" });
  });
}

async function ensureTabPromoted(): Promise<void> {
  const pendingOperation = tabPromoteOperation;
  if (pendingOperation !== null) {
    await pendingOperation;
    return;
  }
  if (props.treeView.previewTabId.value !== api.id) return;
  const operation = props.treeView.controller.promoteTab({ tabId: api.id });
  tabPromoteOperation = operation;
  try {
    await operation;
  } finally {
    if (tabPromoteOperation === operation) tabPromoteOperation = null;
  }
}

async function loadDraft(): Promise<void> {
  if (draft.value !== null || isLoading.value || loadError.value.length > 0) return;
  isLoading.value = true;
  let shouldNotifyReady = false;
  try {
    replaceAncestorFolderData(await loadAncestorFolderData(props.tab.path));
    const kind = isTreeViewItem(props.entity) ? "item" : "folder";
    const entityData = await props.treeView.controller.getEntityData({
      kind,
      path: props.tab.path,
    });
    const loadedDraft = createDraft(props.entity, entityData);
    if (!isMounted) return;
    draft.value = loadedDraft;
    isRegistered = true;
    emit("register", api);
    emitState();
    shouldNotifyReady = true;
  } catch (reason: unknown) {
    if (isMounted) {
      loadError.value = errorMessage(reason);
      popupToast.value?.show(loadError.value, { level: "error" });
      shouldNotifyReady = true;
    }
  } finally {
    if (isMounted) isLoading.value = false;
  }
  if (!shouldNotifyReady || !isMounted) return;
  await nextTick();
  if (isMounted) props.notifyReady();
}

async function refreshAncestorFolderData(entityPath: string): Promise<void> {
  const loadId = ++ancestorDataLoadId;
  isAncestorDataLoading.value = true;
  ancestorDataError.value = "";
  try {
    const loadedData = await loadAncestorFolderData(entityPath);
    if (!isMounted || loadId !== ancestorDataLoadId
      || dirname(props.tab.path) !== dirname(entityPath)) return;
    replaceAncestorFolderData(loadedData);
  } catch (reason: unknown) {
    if (!isMounted || loadId !== ancestorDataLoadId
      || dirname(props.tab.path) !== dirname(entityPath)) return;
    ancestorDataError.value = errorMessage(reason);
    popupToast.value?.show(ancestorDataError.value, { level: "error" });
  } finally {
    if (isMounted && loadId === ancestorDataLoadId) isAncestorDataLoading.value = false;
  }
}

async function loadAncestorFolderData(entityPath: string): Promise<Map<string, CommandFolderData>> {
  const loadedData = new Map<string, CommandFolderData>();
  const folders = await resolveAncestorFolders(entityPath);
  ancestorFolders.value = folders;
  for (const folder of folders) {
    const entityData = await props.treeView.controller.getEntityData({
      kind: "folder",
      path: folder.path,
    });
    loadedData.set(folder.properties.id, entityData.dataJson === null
      ? commandFolderDataSerializer.getDefault()
      : commandFolderDataSerializer.fromJson(entityData.dataJson));
  }
  return loadedData;
}

async function resolveAncestorFolders(entityPath: string): Promise<TreeViewFolder[]> {
  const workspacePath = props.treeView.selectedWorkspaceRef.value?.workspacePath;
  if (workspacePath === undefined) throw new Error("Command workspace is unavailable");
  if (entityPath === workspacePath) return [];
  const paths: string[] = [];
  let parentPath = dirname(entityPath);
  while (true) {
    paths.unshift(parentPath);
    if (parentPath === workspacePath) break;
    const nextParentPath = dirname(parentPath);
    if (nextParentPath === parentPath) throw new Error("Command ancestor path is invalid");
    parentPath = nextParentPath;
  }
  const folders: TreeViewFolder[] = [];
  for (const path of paths) folders.push(await props.treeView.resolveFolderByPath(path));
  return folders;
}

function replaceAncestorFolderData(loadedData: ReadonlyMap<string, CommandFolderData>): void {
  ancestorFolderData.clear();
  for (const [folderId, data] of loadedData) ancestorFolderData.set(folderId, data);
}

function createDraft(
  entity: TreeViewFolder | TreeViewItem,
  entityData: TreeViewEntityData,
): CommandEditorDraft {
  if (isTreeViewItem(entity)) {
    const data = cloneItemData(commandItemDataSerializer.fromEntityData(entityData));
    return {
      kind: "item",
      id: entity.properties.id,
      data,
      baseline: cloneItemData(data),
      extends: entityData.extends,
    };
  }
  const data = cloneFolderData(entityData.dataJson === null
    ? commandFolderDataSerializer.getDefault()
    : commandFolderDataSerializer.fromJson(entityData.dataJson));
  return {
    kind: "folder",
    id: entity.properties.id,
    data,
    baseline: cloneFolderData(data),
    extends: entityData.extends,
  };
}

function requireDraft(): CommandEditorDraft {
  const current = draft.value;
  if (current === null) throw new Error("Command data is not loaded");
  return current;
}

function getItemDraft(): CommandItemDraft {
  const current = requireDraft();
  if (current.kind !== "item") throw new Error("Command draft is unavailable");
  return current;
}

function getFolderDraft(): CommandFolderDraft {
  const current = requireDraft();
  if (current.kind !== "folder") throw new Error("Command folder draft is unavailable");
  return current;
}

function replaceDraft(value: CommandEditorDraft): void {
  draft.value = value;
  if (isDraftDirty(value)) requestTabPromoted();
}

function paramGroupsUpdateHandler(groups: TextEditParamGroup[]): void {
  if (groups.length === 0) return;
  const current = requireDraft();
  const paramGroups = groups.map(toCommandParamGroup);
  if (current.kind === "folder") {
    replaceDraft({ ...current, data: { ...current.data, paramGroups } });
  } else {
    replaceDraft({ ...current, data: { ...current.data, paramGroups } });
  }
}

function selectedParamGroupUpdateHandler(groupId: string | null): void {
  const current = requireDraft();
  if (groupId === null || !current.data.paramGroups.some((group) => group.id === groupId)) return;
  if (current.kind === "folder") {
    replaceDraft({ ...current, data: { ...current.data, selectedParamGroupId: groupId } });
  } else {
    replaceDraft({ ...current, data: { ...current.data, selectedParamGroupId: groupId } });
  }
}

function itemContentUpdateHandler(content: string): void {
  const current = requireDraft();
  if (current.kind === "item") replaceDraft({ ...current, data: { ...current.data, content } });
}

function getScriptCompletions(context: TextEditCompletionContext): readonly TextEditCompletion[] {
  const scriptType = getItemDraft().data.scriptType;
  const partialName = /\b(mh[a-z]*)$/iu.exec(context.linePrefix)?.[1];
  if (partialName === undefined) return [];
  const hasCallPrefix = /\bcall\s+mh[a-z]*$/iu.test(context.linePrefix);
  return SCRIPT_HELPERS
    .filter((helper) => helper.name.startsWith(partialName.toLowerCase()))
    .map((helper) => ({
      label: helper.name,
      detail: "Command helper",
      documentation: helper.description,
      insertText: scriptType === "cmd" && hasCallPrefix
        ? helper.insertText[scriptType].slice("call ".length)
        : helper.insertText[scriptType],
      isSnippet: true,
    }));
}

function updateItemScriptType(scriptType: ScriptType): void {
  const current = requireDraft();
  if (current.kind === "item") replaceDraft({ ...current, data: { ...current.data, scriptType } });
}

async function save(): Promise<boolean> {
  const current = requireDraft();
  if (isSaving.value) return false;
  if (!isDraftDirty(current)) {
    return publishItemDraft();
  }
  isSaving.value = true;
  try {
    const renameOperation = itemRenameOperation;
    if (renameOperation !== null) {
      const renameError = await renameOperation;
      if (renameError !== null) throw new Error(renameError);
    }
    if (current.kind === "folder") {
      await props.treeView.controller.updateEntityData(
        { kind: "folder", path: props.tab.path },
        {
          dataJson: commandFolderDataSerializer.toJson(cloneFolderData(current.data)),
          extends: current.extends,
        },
      );
    } else {
      await props.treeView.controller.updateEntityData(
        { kind: "item", path: props.tab.path },
        commandItemDataSerializer.toEntityData(cloneItemData(current.data), current.extends),
      );
    }
    const latest = draft.value;
    if (latest?.kind === "folder" && current.kind === "folder") {
      replaceDraft({ ...latest, baseline: cloneFolderData(current.data) });
    } else if (latest?.kind === "item" && current.kind === "item") {
      replaceDraft({ ...latest, baseline: cloneItemData(current.data) });
    }
    return await publishItemDraft();
  } catch (reason: unknown) {
    popupToast.value?.show(errorMessage(reason), { level: "error" });
    throw reason;
  } finally {
    isSaving.value = false;
  }
}

async function publishItemDraft(): Promise<boolean> {
  if (!isItemDraft.value) return true;
  const isSaved = await props.requestDraftSave();
  if (isSaved) isItemDraft.value = false;
  return isSaved;
}

async function discardDraft(): Promise<void> {
  if (!isItemDraft.value) return;
  await props.treeView.controller.discardDraft(api.id);
}

async function saveClickHandler(): Promise<void> {
  if (isSaveDisabled.value) return;
  try {
    await save();
  } catch {
    return;
  }
}

async function renameItem(name: string): Promise<string | null> {
  try {
    TreeViewPath.ensureName(name, "Command title");
    if (name === props.entity.name) return null;
    const parent = await props.treeView.resolveFolderByPath(dirname(props.tab.path));
    const targetOrder = parent.items.findIndex((item) => item.properties.id === api.id);
    if (targetOrder < 0) return "Command order is unavailable";
    await props.treeView.controller.move({
      kind: "item",
      sourcePath: props.tab.path,
      targetPath: join(parent.path, `${name}${TREE_VIEW_ITEM_FILE_EXTENSION}`),
      targetOrder,
    });
    requestTabPromoted();
    return null;
  } catch (reason: unknown) {
    return errorMessage(reason);
  }
}

async function itemTitleBlurHandler(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  const input = event.target;
  const name = input.value.trim();
  const operation = renameItem(name);
  itemRenameOperation = operation;
  let message: string | null;
  try {
    message = await operation;
  } finally {
    if (itemRenameOperation === operation) itemRenameOperation = null;
  }
  if (message !== null) {
    titleError.value = message;
    popupToast.value?.show(message, { level: "error" });
    return;
  }
  titleError.value = "";
  input.value = name;
}

function itemTitleEnterHandler(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement) event.target.blur();
}

function collectAdditionalParams(): readonly TextEditAdditionalParamScope[] {
  void ancestorDataRevision.value;
  return ancestorFolders.value.map((folder) => {
    const data = props.getOpenFolderData(folder.properties.id)
      ?? ancestorFolderData.get(folder.properties.id);
    if (data === undefined) throw new Error("Command folder data is not loaded");
    const selectedGroup = data.paramGroups.find((group) => group.id === data.selectedParamGroupId);
    if (selectedGroup === undefined) throw new Error("Selected folder param group is unavailable");
    return {
      label: "Folder",
      sourcePath: workspaceRelativePath(folder.path),
      params: selectedGroup.params,
    };
  });
}

function collectWorkspaceEnv(): readonly TextEditAdditionalParamScope[] {
  return [{
    label: "Environment",
    sourcePath: workspaceRelativePath(props.treeView.selectedWorkspaceRef.value?.workspacePath ?? ""),
    params: props.getWorkspaceEnv(),
  }];
}

function workspaceRelativePath(entityPath: string): string {
  const workspacePath = props.treeView.selectedWorkspaceRef.value?.workspacePath;
  return workspacePath === undefined
    ? entityPath
    : relative(dirname(workspacePath), entityPath);
}

async function runHandler(): Promise<void> {
  if (isCommandRunning.value || isAncestorDataLoading.value || ancestorDataError.value.length > 0) return;
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    const current = getItemDraft();
    if (current.data.content.length === 0) {
      popupToast.value?.show("Command content is empty.", { level: "warning" });
      return;
    }
    const resolution = textEdit.value?.getResolvedText();
    if (resolution === undefined || !resolution.successful) {
      const message = resolution?.error ?? "Command content could not be resolved";
      popupToast.value?.show(message, { level: "error" });
      reportTerminalError(message);
      return;
    }
    if (!await prepareTerminalForRun(terminalApi, current.data.scriptType)) return;
    await terminalApi.run({
      scriptId: current.id,
      commandPath: props.tab.path,
      scriptType: current.data.scriptType,
      scriptContent: resolution.value,
    });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

async function prepareTerminalForRun(
  terminalApi: TerminalExposed,
  scriptType: ScriptType,
): Promise<boolean> {
  if (!await terminalApi.isActive()) {
    const isCreated = await runWithOperationProgress("Preparing Terminal...", async () => {
      await terminalApi.initialize();
      if (!await createTerminalPty(terminalApi, toTerminalType(scriptType))) return false;
      isTerminalActive.value = true;
      requestTabPromoted();
      return true;
    });
    return isCreated;
  }
  if (!terminalApi.isTerminalRunning()) return true;
  const action = await confirmActionDialog({
    title: "The Terminal is not clean",
    descriptions: [
      "Clear and run will interrupt the current input or process, clear the Terminal, and then run the command.",
    ],
    actionId: "clearAndRun",
    actionLabel: "Clear and run",
    isActionDefault: true,
  });
  if (action === "cancel") return false;
  await runWithOperationProgress("Clearing Terminal...", async () => {
    await terminalApi.stop();
    await terminalApi.clear();
  });
  return true;
}

async function stopRunning(): Promise<void> {
  if (!isCommandRunning.value) return;
  const terminalApi = terminal.value;
  if (terminalApi === null) throw new Error("Terminal is unavailable");
  await terminalApi.stop();
}

async function openHandler(): Promise<void> {
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    await runWithOperationProgress("Opening Terminal...", async () => {
      if (await terminalApi.isActive()) return;
      await terminalApi.initialize();
      if (!await createTerminalPty(terminalApi, toTerminalType(getItemDraft().data.scriptType))) return;
      isTerminalActive.value = true;
      requestTabPromoted();
    });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

async function closeHandler(): Promise<void> {
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    await runWithOperationProgress("Closing Terminal...", async () => {
      await terminalApi.destroyPty();
      isTerminalActive.value = false;
    });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

async function terminalErrorHandler(message: string): Promise<void> {
  reportTerminalError(message);
  const terminalApi = terminal.value;
  if (terminalApi === null) {
    isTerminalActive.value = false;
    return;
  }
  try {
    isTerminalActive.value = await terminalApi.isActive();
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

async function clearHandler(): Promise<void> {
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    await runWithOperationProgress("Clearing Terminal...", async () => {
      const shouldClearShell = !terminalApi.isTerminalRunning();
      await terminalApi.clear();
      if (shouldClearShell) await terminalApi.write("cls\r");
    });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

function toTerminalType(scriptType: ScriptType): "cmd" | "powershell" {
  return scriptType === "cmd" ? "cmd" : "powershell";
}

function createTerminalPty(
  terminalApi: TerminalExposed,
  terminalType: "cmd" | "powershell",
): Promise<boolean> {
  return terminalApi.createPty(
    terminalType,
    props.terminalInitialPath,
    TERMINAL_STATUS_CHECK_INTERVAL_MS,
    onTerminalRunStatusChange,
  ).then(() => true).catch(async (reason: unknown) => {
    const message = errorMessage(reason);
    reportTerminalError(message);
    await showAlertDialog({
      title: "Terminal could not be opened",
      descriptions: [
        "MagicHat could not prepare the configured initial folder or start the Terminal process. The Terminal was not opened.",
      ],
      details: [{ id: "error", label: message }],
    });
    return false;
  });
}

async function scriptTypeChangeHandler(value: string): Promise<void> {
  const current = getItemDraft();
  if (!isScriptType(value) || value === current.data.scriptType) return;
  if (toTerminalType(value) === toTerminalType(current.data.scriptType)) {
    updateItemScriptType(value);
    return;
  }
  const terminalApi = terminal.value;
  if (terminalApi === null) {
    updateItemScriptType(value);
    return;
  }
  try {
    if (await terminalApi.isActive()) {
      const action = await confirmActionDialog({
        title: "Close active Terminal?",
        descriptions: ["The active Terminal must close before changing its type."],
        actionId: "confirm",
        actionLabel: "Close and change",
      });
      if (action === "cancel") return;
      await runWithOperationProgress("Changing Terminal type...", async () => {
        if (isCommandRunning.value) {
          await terminalApi.stop();
        }
        await terminalApi.destroyPty();
        isTerminalActive.value = false;
      });
    }
    updateItemScriptType(value);
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

function getFolderData(): CommandFolderData | null {
  const current = draft.value;
  return current?.kind === "folder" ? cloneFolderData(current.data) : null;
}

function applyPersistedParams(
  data: CommandFolderData | CommandItemData,
  updates: readonly CommandEnvUpdate[],
): void {
  const current = draft.value;
  if (current === null) return;
  if (current.kind === "folder" && !isCommandFolderData(data)) return;
  if (current.kind === "item" && isCommandFolderData(data)) return;
  const persistedGroup = data.paramGroups.find((group) => group.id === data.selectedParamGroupId);
  if (persistedGroup === undefined) return;
  if (current.kind === "folder") {
    const folderData = data;
    if (!isCommandFolderData(folderData)) return;
    draft.value = {
      ...current,
      data: mergeExternalUpdates(current.data, persistedGroup.id, updates),
      baseline: mergePersistedParams(current.baseline, persistedGroup),
    };
  } else {
    if (isCommandFolderData(data)) return;
    draft.value = {
      ...current,
      data: mergeExternalUpdates(current.data, persistedGroup.id, updates),
      baseline: mergePersistedParams(current.baseline, persistedGroup),
    };
  }
  emitState();
}

function applyAncestorFolderData(folderId: string, data: CommandFolderData): void {
  if (!ancestorFolderData.has(folderId)) return;
  ancestorFolderData.set(folderId, cloneFolderData(data));
  ancestorDataRevision.value += 1;
}

function mergeExternalUpdates<TData extends CommandFolderData | CommandItemData>(
  data: TData,
  groupId: string,
  updates: readonly CommandEnvUpdate[],
): TData {
  return {
    ...data,
    paramGroups: data.paramGroups.map((group) => group.id === groupId
      ? {
          ...group,
          params: updates.reduce(
            (params, update) => updateCommandParams(params, update),
            cloneParams(group.params),
          ),
        }
      : group),
  };
}

function updateCommandParams(
  params: readonly CommandParam[],
  update: CommandEnvUpdate,
): CommandParam[] {
  const index = params.findIndex((param) => param.key === update.key);
  if (index < 0) return [...params, { ...update, enabled: true }];
  return params.map((param, paramIndex) => paramIndex === index
    ? { ...update, enabled: true }
    : param);
}

function mergePersistedParams<TData extends CommandFolderData | CommandItemData>(
  data: TData,
  persistedGroup: CommandParamGroup,
): TData {
  return {
    ...data,
    paramGroups: data.paramGroups.map((group) => group.id === persistedGroup.id
      ? { ...group, params: cloneParams(persistedGroup.params) }
      : group),
  };
}

function isCommandFolderData(
  data: CommandFolderData | CommandItemData,
): data is CommandFolderData {
  return !("content" in data);
}

function isDraftDirty(value: CommandEditorDraft): boolean {
  return value.kind === "folder"
    ? !areFolderDataEqual(value.data, value.baseline)
    : !areItemDataEqual(value.data, value.baseline);
}

function areFolderDataEqual(left: CommandFolderData, right: CommandFolderData): boolean {
  return left.selectedParamGroupId === right.selectedParamGroupId
    && areParamGroupsEqual(left.paramGroups, right.paramGroups);
}

function areItemDataEqual(left: CommandItemData, right: CommandItemData): boolean {
  return left.scriptType === right.scriptType
    && left.content === right.content
    && left.selectedParamGroupId === right.selectedParamGroupId
    && areParamGroupsEqual(left.paramGroups, right.paramGroups);
}

function areParamGroupsEqual(left: readonly CommandParamGroup[], right: readonly CommandParamGroup[]): boolean {
  return left.length === right.length && left.every((group, index) => {
    const other = right[index];
    return other !== undefined
      && group.id === other.id
      && group.name === other.name
      && areParamsEqual(group.params, other.params);
  });
}

function areParamsEqual(left: CommandParamGroup["params"], right: CommandParamGroup["params"]): boolean {
  return left.length === right.length && left.every((param, index) => {
    const other = right[index];
    return other !== undefined
      && param.key === other.key
      && param.value === other.value
      && param.enabled === other.enabled;
  });
}

function cloneFolderData(data: CommandFolderData): CommandFolderData {
  return {
    selectedParamGroupId: data.selectedParamGroupId,
    paramGroups: cloneParamGroups(data.paramGroups),
  };
}

function cloneItemData(data: CommandItemData): CommandItemData {
  return {
    scriptType: data.scriptType,
    content: data.content,
    selectedParamGroupId: data.selectedParamGroupId,
    paramGroups: cloneParamGroups(data.paramGroups),
  };
}

function cloneParamGroups(groups: readonly CommandParamGroup[]): CommandParamGroup[] {
  return groups.map((group) => ({
    ...group,
    params: cloneParams(group.params),
  }));
}

function cloneParams(params: CommandParamGroup["params"]): CommandParam[] {
  return params.map((param) => ({ ...param }));
}

function toCommandParamGroup(group: TextEditParamGroup): CommandParamGroup {
  return {
    id: group.id,
    name: group.name,
    params: group.params.map((param) => ({ ...param })),
  };
}

function isTreeViewItem(entity: TreeViewFolder | TreeViewItem): entity is TreeViewItem {
  return "isDraft" in entity.properties;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function reportTerminalError(message: string): void {
  terminalStatus.value = { kind: "error", message };
  gMessageStore.pushMessage("error", message);
}

function reportTerminalLastLine(): void {
  const currentLine = terminal.value?.getCurrentLine() ?? "";
  gMessageStore.pushMessage("info", `Terminal last line: ${JSON.stringify(currentLine)}`);
}
</script>

<template>
  <p
    v-if="isLoading"
    class="command-editor-state command-editor-state--page"
    role="status"
  >Loading Command data...</p>
  <p
    v-else-if="loadError.length > 0"
    class="command-editor-state command-editor-state--page"
    role="status"
  >
    {{ isTreeViewItem(entity)
      ? `Command item file failed to load: ${loadError}`
      : `Command folder file failed to load: ${loadError}` }}
  </p>
  <section v-else-if="draft?.kind === 'folder'" class="command-folder-editor">
    <header class="command-editor-toolbar">
      <strong>Folder parameters</strong>
      <button
        type="button"
        class="command-editor-save"
        :disabled="isSaveDisabled"
        title="Save (Ctrl+S)"
        @click="saveClickHandler"
      >{{ isSaving ? "Saving..." : "Save" }}</button>
    </header>
    <p v-if="isAncestorDataLoading" class="command-editor-state" role="status">
      Loading Folder parameters...
    </p>
    <p v-else-if="ancestorDataError.length > 0" class="command-editor-state" role="status">
      Folder parameters are unavailable.
    </p>
    <TextEditComponent
      v-else
      :param-groups="paramGroups"
      :selected-group-id="getFolderDraft().data.selectedParamGroupId"
      :is-text-area-visible="false"
      :is-param-expanded-initially="true"
      :get-additional-params="collectAdditionalParams"
      :get-override-params="collectWorkspaceEnv"
      :param-priority-description="PARAM_PRIORITY_DESCRIPTION"
      @update-param-groups="paramGroupsUpdateHandler"
      @update-selected-group-id="selectedParamGroupUpdateHandler"
    />
  </section>

  <SplitContainer
    v-else-if="draft?.kind === 'item'"
    class="command-workbench"
    :class="`command-workbench--terminal-${terminalPlacement}`"
    :orientation="isSideBySide ? 'vertical' : 'horizontal'"
    :is-reversed="!isScriptBeforeTerminal"
    :has-item-borders="false"
    :separator-labels="['Resize script editor and terminal']"
  >
    <section class="command-script-editor">
      <header class="command-editor-toolbar">
        <label class="command-editor-title">
          <span class="sr-only">Command title</span>
          <input
            type="text"
            :value="entity.name"
            :aria-invalid="titleError.length > 0"
            @blur="itemTitleBlurHandler"
            @keydown.enter.prevent="itemTitleEnterHandler"
          />
        </label>
        <div class="command-editor-interpreter">
          <PopupSelect
            :value="getItemDraft().data.scriptType"
            :options="scriptTypeOptions"
            accessible-label="Script interpreter"
            @update-value="scriptTypeChangeHandler"
          />
        </div>
        <button
          type="button"
          class="command-editor-save"
          :disabled="isSaveDisabled"
          title="Save (Ctrl+S)"
          @click="saveClickHandler"
        >{{ isSaving ? "Saving..." : "Save" }}</button>
        <button
          type="button"
          class="command-editor-run is-primary"
          :disabled="isCommandRunning || isAncestorDataLoading || ancestorDataError.length > 0"
          :aria-disabled="isCommandRunning || isAncestorDataLoading || ancestorDataError.length > 0"
          :aria-busy="isCommandRunning"
          :title="isCommandRunning
            ? 'Command is running'
            : isAncestorDataLoading
              ? 'Folder parameters are loading'
              : ancestorDataError.length > 0
                ? 'Folder parameters are unavailable'
                : 'Run command'"
          @click="runHandler"
        >Run</button>
      </header>
      <p v-if="isAncestorDataLoading" class="command-editor-state" role="status">
        Loading Folder parameters...
      </p>
      <p v-else-if="ancestorDataError.length > 0" class="command-editor-state" role="status">
        Folder parameters are unavailable.
      </p>
      <TextEditComponent
        v-else
        ref="textEdit"
        :param-groups="paramGroups"
        :text="getItemDraft().data.content"
        :selected-group-id="getItemDraft().data.selectedParamGroupId"
        :get-additional-params="collectAdditionalParams"
        :get-override-params="collectWorkspaceEnv"
        :param-priority-description="PARAM_PRIORITY_DESCRIPTION"
        :text-identity="entity.properties.id"
        :script-type="getItemDraft().data.scriptType"
        :get-completions="getScriptCompletions"
        @update-param-groups="paramGroupsUpdateHandler"
        @update-selected-group-id="selectedParamGroupUpdateHandler"
        @update-text="itemContentUpdateHandler"
      />
    </section>

    <section class="command-terminal" aria-label="Terminal">
      <header class="command-terminal__toolbar">
        <span class="command-terminal__title">Terminal</span>
        <output
          class="command-terminal__status"
          :class="{ 'is-error': terminalStatus.kind === 'error' }"
          :title="terminalStatus.message"
          aria-live="polite"
        >{{ terminalStatus.message }}</output>
        <button
          v-if="IS_DEBUG"
          type="button"
          title="Send the current Terminal line to messages"
          @click="reportTerminalLastLine"
        >Last line</button>
        <button
          type="button"
          :disabled="!isTerminalActive"
          title="Clear Terminal"
          @click="clearHandler"
        >Clear</button>
        <button
          v-if="isTerminalActive"
          type="button"
          class="command-terminal-toggle"
          title="Close Terminal"
          @click="closeHandler"
        >Close</button>
        <button
          v-else
          type="button"
          class="command-terminal-toggle is-primary"
          title="Open Terminal"
          @click="openHandler"
        >Open</button>
      </header>
      <TerminalComponent
        ref="terminal"
        @error="terminalErrorHandler"
        @message="terminalMessageHandler"
      />
    </section>

  </SplitContainer>

  <PopupToast ref="popupToast" />

</template>

<style scoped>
.command-editor-state--page {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  margin: 0;
  overflow-wrap: anywhere;
  border: 1px solid var(--color-border);
  border-radius: 0;
  text-align: center;
}

.command-folder-editor,
.command-script-editor,
.command-terminal {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.command-folder-editor {
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0;
}

.command-folder-editor:has(.text-edit.is-param-expanded) {
  border-block-end: 0;
}

.command-workbench {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.command-script-editor {
  flex: 1 1 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0;
}

.command-terminal {
  flex: 1 1 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0;
}

:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-script-editor {
  min-width: 360px;
}

:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-terminal {
  min-width: 320px;
}

:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-script-editor,
:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-terminal {
  min-height: 220px;
}

.command-editor-toolbar,
.command-terminal__toolbar {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.command-editor-toolbar strong,
.command-terminal__title {
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
}

.command-terminal__status {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: color-mix(in srgb, var(--color-text-muted) 68%, var(--color-surface));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-terminal__status.is-error {
  color: color-mix(in srgb, var(--color-danger) 72%, var(--color-surface));
}

.command-editor-title {
  min-width: 120px;
  flex: 1;
}

.command-editor-title input {
  width: 100%;
  height: 30px;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.command-editor-title input:focus-visible {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-raised));
  outline: 0;
}

.command-editor-title input[aria-invalid="true"] {
  border-color: var(--color-danger);
}

.command-editor-toolbar button,
.command-terminal__toolbar button {
  min-height: 30px;
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  cursor: pointer;
}

.command-editor-toolbar :is(.command-editor-save, .command-editor-run) {
  width: 76px;
  flex: 0 0 76px;
  padding-inline: 0;
  text-align: center;
}

.command-terminal__toolbar .command-terminal-toggle {
  width: calc(5ch + 2 * var(--space-3) + 2px);
  flex: 0 0 calc(5ch + 2 * var(--space-3) + 2px);
  text-align: center;
}

.command-editor-interpreter {
  min-width: 130px;
  width: 130px;
}

.command-editor-toolbar button.is-primary {
  color: var(--color-bg);
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 600;
}

:is(.command-editor-toolbar, .command-terminal__toolbar) button:not(:disabled):hover {
  background: color-mix(in srgb, var(--color-text) 8%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-border) 62%, var(--color-text-muted));
}

.command-editor-toolbar button.is-primary:not(:disabled):hover {
  background: var(--color-primary-emphasis);
  border-color: var(--color-primary-emphasis);
}

:is(.command-editor-toolbar, .command-terminal__toolbar) button:not(:disabled):active {
  transform: translateY(1px);
}

.command-editor-toolbar button:disabled,
.command-terminal__toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:is(.command-editor-toolbar, .command-terminal__toolbar) button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  type CommandFolderData,
  type CommandItemData,
  type CommandParamGroup,
} from "../../../../../../common/command";
import {
  SCRIPT_TYPES,
  isScriptType,
  type ScriptType,
} from "../../../../../../common/tasks/scriptTaskDefinition";
import type {
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
} from "../../../../../../common/treeView";
import { ensureTreeViewName, getTreeViewParentPath } from "../../../../../../common/treeView";
import { confirmDialog } from "../../../../components/confirmDialog";
import type { ConfirmDialogAction } from "../../../../components/confirmDialogTypes";
import { runWithOperationProgress } from "../../../../components/operationProgressDialog";
import PopupSelect from "../../../../components/PopupSelect.vue";
import { TextEditComponent } from "../../../../components/textEdit";
import type {
  TextEditAdditionalParamScope,
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
import { gCommandSettings } from "./commandSettings";

type CommandFolderDraft = Readonly<{
  kind: "folder";
  id: string;
  data: CommandFolderData;
  baseline: CommandFolderData;
}>;

type CommandItemDraft = Readonly<{
  kind: "item";
  id: string;
  data: CommandItemData;
  baseline: CommandItemData;
}>;

type CommandEditorDraft = CommandFolderDraft | CommandItemDraft;
type TerminalTypeDialogAction = "confirm" | "cancel";
type RestartDialogAction = "restart" | "cancel";
type BusyTerminalDialogAction = "clearAndRun" | "cancel";
type TextEditExposed = { getResolvedText(): TextEditTextResolution };

type Props = {
  entity: TreeViewFolder | TreeViewItem;
  treeView: TreeView;
  getOpenFolderData: (id: string) => CommandFolderData | null;
  requestDraftSave: () => void;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  register: [api: CommandTabPageApi];
  unregister: [api: CommandTabPageApi];
  stateChange: [state: CommandTabPageState];
}>();

const draft = shallowRef<CommandEditorDraft>(createDraft(props.entity));
const isSaving = ref(false);
const saveError = shallowRef("");
const titleError = shallowRef("");
const isTerminalActive = ref(false);
const isCommandRunning = ref(false);
const commandWorkbench = useTemplateRef<HTMLElement>("commandWorkbench");
const terminal = useTemplateRef<TerminalExposed>("terminal");
const textEdit = useTemplateRef<TextEditExposed>("textEdit");
const scriptPaneSize = ref<number | null>(null);
let workbenchResizeStart: Readonly<{ pointerPosition: number; paneSize: number }> | null = null;
let previousResizeCursor = "";
let previousResizeUserSelect = "";
const MIN_SCRIPT_PANE_WIDTH = 360;
const MIN_TERMINAL_PANE_WIDTH = 320;
const MIN_SCRIPT_PANE_HEIGHT = 220;
const MIN_TERMINAL_PANE_HEIGHT = 220;
const WORKBENCH_SPLITTER_WIDTH = 5;
const WORKBENCH_KEYBOARD_RESIZE_STEP = 16;
const TERMINAL_TYPE_ACTIONS: readonly ConfirmDialogAction<TerminalTypeDialogAction>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "confirm", label: "Stop and change", appearance: "primary" },
];
const RESTART_ACTIONS: readonly ConfirmDialogAction<RestartDialogAction>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "restart", label: "Stop and restart", appearance: "primary", isDefault: true },
];
const BUSY_TERMINAL_ACTIONS: readonly ConfirmDialogAction<BusyTerminalDialogAction>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "clearAndRun", label: "Clear and run", appearance: "primary", isDefault: true },
];
const TERMINAL_IDLE_PROMPT_PATTERN = /^(?:PS|CMD) [A-Za-z]:\\.*>$/;
const scriptTypeOptions = SCRIPT_TYPES.map((scriptType) => ({
  value: scriptType,
  label: scriptType,
}));

const isDirty = computed(() => isDraftDirty(draft.value));
const isItemDraft = computed(() => isTreeViewItem(props.entity) && props.entity.properties.isDraft);
const paramGroups = computed<readonly TextEditParamGroup[]>(() => draft.value.data.paramGroups.map((group) => ({
  id: group.id,
  name: group.name,
  sourceType: draft.value.kind === "folder" ? "Folder" : "Command",
  sourcePath: props.entity.path,
  params: group.params,
})));
const isSideBySide = computed(() => ["left", "right"].includes(gCommandSettings.terminalPlacement.value));
const isScriptBeforeTerminal = computed(() => ["right", "bottom"].includes(
  gCommandSettings.terminalPlacement.value,
));
const commandWorkbenchStyle = computed<CSSProperties>(() => scriptPaneSize.value === null
  ? {}
  : { "--command-script-pane-size": `${scriptPaneSize.value}px` });
const api: CommandTabPageApi = {
  id: props.entity.properties.id,
  isDirty: () => isDirty.value,
  isRunning: () => isCommandRunning.value,
  save,
  stopRunning,
  getFolderData,
};

watch([isDirty, isCommandRunning], () => emitState());
watch(() => props.entity.name, () => {
  titleError.value = "";
});
watch(gCommandSettings.terminalPlacement, () => {
  stopWorkbenchResize();
  scriptPaneSize.value = null;
});

onMounted(() => {
  emit("register", api);
  emitState();
});

onUnmounted(() => {
  stopWorkbenchResize();
  emit("unregister", api);
});

function emitState(): void {
  emit("stateChange", {
    id: api.id,
    isDirty: isDirty.value,
    isRunning: isCommandRunning.value,
  });
}

function createDraft(entity: TreeViewFolder | TreeViewItem): CommandEditorDraft {
  if (isTreeViewItem(entity)) {
    const data = cloneItemData(commandItemDataSerializer.fromValue(entity.properties.data));
    return { kind: "item", id: entity.properties.id, data, baseline: cloneItemData(data) };
  }
  const data = cloneFolderData(commandFolderDataSerializer.fromValue(entity.properties.data));
  return { kind: "folder", id: entity.properties.id, data, baseline: cloneFolderData(data) };
}

function getItemDraft(): CommandItemDraft {
  const current = draft.value;
  if (current.kind !== "item") throw new Error("Command draft is unavailable");
  return current;
}

function getFolderDraft(): CommandFolderDraft {
  const current = draft.value;
  if (current.kind !== "folder") throw new Error("Command folder draft is unavailable");
  return current;
}

function replaceDraft(value: CommandEditorDraft): void {
  draft.value = value;
}

function paramGroupsUpdateHandler(groups: TextEditParamGroup[]): void {
  if (groups.length === 0) return;
  const current = draft.value;
  const paramGroups = groups.map(toCommandParamGroup);
  if (current.kind === "folder") {
    replaceDraft({ ...current, data: { ...current.data, paramGroups } });
  } else {
    replaceDraft({ ...current, data: { ...current.data, paramGroups } });
  }
}

function selectedParamGroupUpdateHandler(groupId: string | null): void {
  const current = draft.value;
  if (groupId === null || !current.data.paramGroups.some((group) => group.id === groupId)) return;
  if (current.kind === "folder") {
    replaceDraft({ ...current, data: { ...current.data, selectedParamGroupId: groupId } });
  } else {
    replaceDraft({ ...current, data: { ...current.data, selectedParamGroupId: groupId } });
  }
}

function itemContentUpdateHandler(content: string): void {
  const current = draft.value;
  if (current.kind === "item") replaceDraft({ ...current, data: { ...current.data, content } });
}

function updateItemScriptType(scriptType: ScriptType): void {
  const current = draft.value;
  if (current.kind === "item") replaceDraft({ ...current, data: { ...current.data, scriptType } });
}

async function save(): Promise<void> {
  const current = draft.value;
  if (isSaving.value || !isDraftDirty(current)) return;
  isSaving.value = true;
  saveError.value = "";
  const savedData = current.kind === "folder"
    ? cloneFolderData(current.data)
    : cloneItemData(current.data);
  try {
    if (current.kind === "folder") {
      commandFolderDataSerializer.validate(savedData);
      const folder = props.treeView.getFolderById(current.id);
      if (folder === null) throw new Error("Command folder is no longer available");
      const properties: TreeViewFolderProperties = {
        ...structuredClone(folder.properties),
        data: savedData,
      };
      await props.treeView.controller.updateFolder(folder.path, properties);
    } else {
      commandItemDataSerializer.validate(savedData);
      const item = props.treeView.getItemById(current.id);
      if (item === null) throw new Error("Command item is no longer available");
      const properties: TreeViewItemProperties = {
        ...structuredClone(item.properties),
        data: savedData,
      };
      await props.treeView.controller.updateItem(item.path, properties);
    }
    const latest = draft.value;
    if (latest.kind === "folder" && current.kind === "folder") {
      replaceDraft({ ...latest, baseline: cloneFolderData(current.data) });
    } else if (latest.kind === "item" && current.kind === "item") {
      replaceDraft({ ...latest, baseline: cloneItemData(current.data) });
    }
  } catch (reason: unknown) {
    saveError.value = errorMessage(reason);
    throw reason;
  } finally {
    isSaving.value = false;
  }
}

async function saveClickHandler(): Promise<void> {
  try {
    await save();
    if (isItemDraft.value) props.requestDraftSave();
  } catch {
    return;
  }
}

async function renameItem(name: string): Promise<string | null> {
  const entity = props.treeView.getItemById(api.id);
  if (entity === null) return "Command is no longer available";
  try {
    ensureTreeViewName(name, "Command title");
    if (name === entity.name) return null;
    const parentPath = getTreeViewParentPath(entity.path);
    const parent = parentPath === null ? null : findFolderByPath(props.treeView.rootFolder.value, parentPath);
    if (parent === null) return "Command parent folder is unavailable";
    const targetOrder = parent.items.findIndex((item) => item.properties.id === api.id);
    if (targetOrder < 0) return "Command order is unavailable";
    await props.treeView.controller.move({
      kind: "item",
      sourcePath: entity.path,
      targetPath: `${parent.path}/${name}`,
      targetOrder,
    });
    return null;
  } catch (reason: unknown) {
    return errorMessage(reason);
  }
}

async function itemTitleBlurHandler(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  const input = event.target;
  const name = input.value.trim();
  const message = await renameItem(name);
  if (message !== null) {
    titleError.value = message;
    return;
  }
  titleError.value = "";
  input.value = name;
}

function itemTitleEnterHandler(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement) event.target.blur();
}

function collectAdditionalParams(): readonly TextEditAdditionalParamScope[] {
  const ancestors: TreeViewFolder[] = [];
  let parentPath = getTreeViewParentPath(props.entity.path);
  while (parentPath !== null) {
    const folder = findFolderByPath(props.treeView.rootFolder.value, parentPath);
    if (folder === null) break;
    ancestors.unshift(folder);
    parentPath = getTreeViewParentPath(parentPath);
  }
  return ancestors.map((folder) => {
    const data = props.getOpenFolderData(folder.properties.id)
      ?? commandFolderDataSerializer.fromValue(folder.properties.data);
    const selectedGroup = data.paramGroups.find((group) => group.id === data.selectedParamGroupId);
    if (selectedGroup === undefined) throw new Error("Selected folder param group is unavailable");
    return {
      label: "Folder",
      sourcePath: folder.path,
      params: selectedGroup.params,
    };
  });
}

function findFolderByPath(root: TreeViewFolder | null, path: string): TreeViewFolder | null {
  if (root === null) return null;
  const pending = [root];
  while (pending.length > 0) {
    const folder = pending.shift();
    if (folder === undefined) continue;
    if (folder.path === path) return folder;
    pending.push(...folder.folders);
  }
  return null;
}

async function runHandler(): Promise<void> {
  if (isCommandRunning.value) return;
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    const current = getItemDraft();
    if (current.data.content.length === 0) return;
    const resolution = textEdit.value?.getResolvedText();
    if (resolution === undefined || !resolution.successful) {
      reportTerminalError(resolution?.error ?? "Command content could not be resolved");
      return;
    }
    if (!await prepareTerminalForRun(terminalApi, current.data.scriptType)) return;
    isCommandRunning.value = true;
    await terminalApi.run({ scriptType: current.data.scriptType, scriptContent: resolution.value });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  } finally {
    isCommandRunning.value = false;
  }
}

async function prepareTerminalForRun(
  terminalApi: TerminalExposed,
  scriptType: ScriptType,
): Promise<boolean> {
  if (!await terminalApi.isActive()) {
    await runWithOperationProgress("Preparing Terminal...", async () => {
      await terminalApi.initialize();
      await terminalApi.createPty(toTerminalType(scriptType));
      isTerminalActive.value = true;
    });
    return true;
  }
  if (TERMINAL_IDLE_PROMPT_PATTERN.test(terminalApi.getCurrentLine())) return true;
  const action = await confirmDialog({
    title: "The Terminal is not clean",
    descriptions: [
      "Clear and run will interrupt the current input or process, clear the Terminal, and then run the command.",
    ],
    actions: BUSY_TERMINAL_ACTIONS,
    cancelActionId: "cancel",
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
  isCommandRunning.value = false;
}

async function openHandler(): Promise<void> {
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    await runWithOperationProgress("Opening Terminal...", async () => {
      if (await terminalApi.isActive()) return;
      await terminalApi.initialize();
      await terminalApi.createPty(toTerminalType(getItemDraft().data.scriptType));
      isTerminalActive.value = true;
    });
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

async function restartHandler(): Promise<void> {
  try {
    const terminalApi = terminal.value;
    if (terminalApi === null) throw new Error("Terminal is unavailable");
    if (isCommandRunning.value) {
      const action = await confirmDialog({
        title: "Restart running Terminal?",
        descriptions: [
          "The running command will be stopped.",
          "The current Terminal process will be closed and recreated.",
        ],
        actions: RESTART_ACTIONS,
        cancelActionId: "cancel",
      });
      if (action === "cancel") return;
    }
    await runWithOperationProgress("Restarting Terminal...", async () => {
      await terminalApi.initialize();
      if (isCommandRunning.value) {
        await terminalApi.stop();
        isCommandRunning.value = false;
      }
      await terminalApi.destroyPty();
      await terminalApi.createPty(toTerminalType(getItemDraft().data.scriptType));
      isTerminalActive.value = true;
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
    await runWithOperationProgress("Clearing Terminal...", () => terminalApi.clear());
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

function toTerminalType(scriptType: ScriptType): "cmd" | "powershell" {
  return scriptType === "cmd" ? "cmd" : "powershell";
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
      const action = await confirmDialog({
        title: "Close active Terminal?",
        descriptions: ["The active Terminal must close before changing its type."],
        actions: TERMINAL_TYPE_ACTIONS,
        cancelActionId: "cancel",
      });
      if (action === "cancel") return;
      await runWithOperationProgress("Changing Terminal type...", async () => {
        if (isCommandRunning.value) {
          await terminalApi.stop();
          isCommandRunning.value = false;
        }
        await terminalApi.destroyPty();
        await terminalApi.createPty(toTerminalType(value));
        isTerminalActive.value = true;
      });
    }
    updateItemScriptType(value);
  } catch (reason: unknown) {
    reportTerminalError(errorMessage(reason));
  }
}

function getFolderData(): CommandFolderData | null {
  const current = draft.value;
  return current.kind === "folder" ? cloneFolderData(current.data) : null;
}

function workbenchPointerDownHandler(event: PointerEvent): void {
  if (event.button !== 0 || commandWorkbench.value === null) return;
  event.preventDefault();
  const scriptPanel = commandWorkbench.value.querySelector(".command-script-editor");
  if (!(scriptPanel instanceof HTMLElement)) return;
  const scriptBounds = scriptPanel.getBoundingClientRect();
  workbenchResizeStart = {
    pointerPosition: isSideBySide.value ? event.clientX : event.clientY,
    paneSize: isSideBySide.value ? scriptBounds.width : scriptBounds.height,
  };
  previousResizeCursor = document.body.style.cursor;
  previousResizeUserSelect = document.body.style.userSelect;
  document.body.style.cursor = isSideBySide.value ? "col-resize" : "row-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeWorkbench);
  window.addEventListener("pointerup", stopWorkbenchResize);
  window.addEventListener("pointercancel", stopWorkbenchResize);
}

function resizeWorkbench(event: PointerEvent): void {
  if (workbenchResizeStart === null) return;
  const pointerPosition = isSideBySide.value ? event.clientX : event.clientY;
  const pointerDelta = pointerPosition - workbenchResizeStart.pointerPosition;
  const scriptDelta = isScriptBeforeTerminal.value ? pointerDelta : -pointerDelta;
  setScriptPaneSize(workbenchResizeStart.paneSize + scriptDelta);
}

function stopWorkbenchResize(): void {
  if (workbenchResizeStart === null) return;
  workbenchResizeStart = null;
  document.body.style.cursor = previousResizeCursor;
  document.body.style.userSelect = previousResizeUserSelect;
  window.removeEventListener("pointermove", resizeWorkbench);
  window.removeEventListener("pointerup", stopWorkbenchResize);
  window.removeEventListener("pointercancel", stopWorkbenchResize);
}

function workbenchKeydownHandler(event: KeyboardEvent): void {
  const currentSize = currentScriptPaneSize();
  let nextSize: number;
  switch (event.key) {
    case "ArrowLeft":
      if (!isSideBySide.value) return;
      nextSize = currentSize + (isScriptBeforeTerminal.value ? -1 : 1) * WORKBENCH_KEYBOARD_RESIZE_STEP;
      break;
    case "ArrowRight":
      if (!isSideBySide.value) return;
      nextSize = currentSize + (isScriptBeforeTerminal.value ? 1 : -1) * WORKBENCH_KEYBOARD_RESIZE_STEP;
      break;
    case "ArrowUp":
      if (isSideBySide.value) return;
      nextSize = currentSize + (isScriptBeforeTerminal.value ? -1 : 1) * WORKBENCH_KEYBOARD_RESIZE_STEP;
      break;
    case "ArrowDown":
      if (isSideBySide.value) return;
      nextSize = currentSize + (isScriptBeforeTerminal.value ? 1 : -1) * WORKBENCH_KEYBOARD_RESIZE_STEP;
      break;
    case "Home": nextSize = minimumScriptPaneSize(); break;
    case "End": nextSize = maximumScriptPaneSize(); break;
    default: return;
  }
  event.preventDefault();
  setScriptPaneSize(nextSize);
}

function setScriptPaneSize(size: number): void {
  scriptPaneSize.value = Math.round(Math.min(
    maximumScriptPaneSize(),
    Math.max(minimumScriptPaneSize(), size),
  ));
}

function currentScriptPaneSize(): number {
  if (scriptPaneSize.value !== null) return scriptPaneSize.value;
  const scriptPanel = commandWorkbench.value?.querySelector(".command-script-editor");
  if (!(scriptPanel instanceof HTMLElement)) return minimumScriptPaneSize();
  const bounds = scriptPanel.getBoundingClientRect();
  return isSideBySide.value ? bounds.width : bounds.height;
}

function minimumScriptPaneSize(): number {
  return isSideBySide.value ? MIN_SCRIPT_PANE_WIDTH : MIN_SCRIPT_PANE_HEIGHT;
}

function maximumScriptPaneSize(): number {
  const workbench = commandWorkbench.value;
  const availableSize = isSideBySide.value ? workbench?.clientWidth ?? 0 : workbench?.clientHeight ?? 0;
  const minimumTerminalSize = isSideBySide.value ? MIN_TERMINAL_PANE_WIDTH : MIN_TERMINAL_PANE_HEIGHT;
  return Math.max(
    minimumScriptPaneSize(),
    availableSize - WORKBENCH_SPLITTER_WIDTH - minimumTerminalSize,
  );
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
    params: group.params.map((param) => ({ ...param })),
  }));
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
  gMessageStore.pushMessage("error", message);
}

function reportTerminalLastLine(): void {
  const currentLine = terminal.value?.getCurrentLine() ?? "";
  gMessageStore.pushMessage("info", `Terminal last line: ${JSON.stringify(currentLine)}`);
}
</script>

<template>
  <section v-if="draft.kind === 'folder'" class="command-folder-editor">
    <header class="command-editor-toolbar">
      <strong>Folder parameters</strong>
      <button
        type="button"
        class="command-editor-save"
        :disabled="!isDirty || isSaving"
        title="Save (Ctrl+S)"
        @click="saveClickHandler"
      >{{ isSaving ? "Saving..." : "Save" }}</button>
    </header>
    <TextEditComponent
      :param-groups="paramGroups"
      :selected-group-id="getFolderDraft().data.selectedParamGroupId"
      :is-text-area-visible="false"
      :get-additional-params="collectAdditionalParams"
      @update-param-groups="paramGroupsUpdateHandler"
      @update-selected-group-id="selectedParamGroupUpdateHandler"
    />
    <p v-if="saveError.length > 0" class="command-editor-error" role="alert">{{ saveError }}</p>
  </section>

  <div
    v-else
    ref="commandWorkbench"
    class="command-workbench"
    :class="`command-workbench--terminal-${gCommandSettings.terminalPlacement.value}`"
    :style="commandWorkbenchStyle"
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
          :disabled="(!isDirty && !isItemDraft) || isSaving"
          title="Save (Ctrl+S)"
          @click="saveClickHandler"
        >{{ isSaving ? "Saving..." : "Save" }}</button>
        <button
          type="button"
          class="command-editor-run is-primary"
          :aria-disabled="isCommandRunning"
          :aria-busy="isCommandRunning"
          :title="isCommandRunning ? 'Command is running' : 'Run command'"
          @click="runHandler"
        >{{ isCommandRunning ? "Running..." : "Run" }}</button>
      </header>
      <p v-if="titleError.length > 0" class="command-editor-error" role="alert">{{ titleError }}</p>
      <TextEditComponent
        ref="textEdit"
        :param-groups="paramGroups"
        :text="getItemDraft().data.content"
        :selected-group-id="getItemDraft().data.selectedParamGroupId"
        :get-additional-params="collectAdditionalParams"
        :text-identity="entity.properties.id"
        @update-param-groups="paramGroupsUpdateHandler"
        @update-selected-group-id="selectedParamGroupUpdateHandler"
        @update-text="itemContentUpdateHandler"
      />
      <p v-if="saveError.length > 0" class="command-editor-error" role="alert">{{ saveError }}</p>
    </section>

    <div
      class="command-workbench__splitter"
      role="separator"
      aria-label="Resize script editor and terminal"
      :aria-orientation="isSideBySide ? 'vertical' : 'horizontal'"
      :aria-valuemin="minimumScriptPaneSize()"
      :aria-valuemax="maximumScriptPaneSize()"
      :aria-valuenow="Math.round(currentScriptPaneSize())"
      tabindex="0"
      @pointerdown="workbenchPointerDownHandler"
      @keydown="workbenchKeydownHandler"
    ></div>

    <section class="command-terminal" aria-label="Terminal">
      <header class="command-terminal__toolbar">
        <span>Terminal</span>
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
          class="command-terminal-restart"
          title="Restart Terminal"
          @click="restartHandler"
        >Restart</button>
        <button
          v-else
          type="button"
          class="is-primary"
          title="Open Terminal"
          @click="openHandler"
        >Open</button>
      </header>
      <TerminalComponent
        ref="terminal"
        @error="terminalErrorHandler"
      />
    </section>

  </div>

</template>

<style scoped>
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
}

.command-folder-editor :deep(.text-edit__param-toolbar),
.command-workbench :deep(.text-edit__param-toolbar) {
  background: var(--color-surface);
}

.command-workbench {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  overflow: hidden;
}

.command-workbench--terminal-right {
  grid-template-areas: "script splitter terminal";
  grid-template-columns: minmax(360px, var(--command-script-pane-size, 3fr)) 5px minmax(320px, 2fr);
}

.command-workbench--terminal-left {
  grid-template-areas: "terminal splitter script";
  grid-template-columns: minmax(320px, 2fr) 5px minmax(360px, var(--command-script-pane-size, 3fr));
}

.command-workbench--terminal-bottom {
  grid-template-areas: "script" "splitter" "terminal";
  grid-template-rows: minmax(220px, var(--command-script-pane-size, 3fr)) 5px minmax(220px, 2fr);
}

.command-workbench--terminal-top {
  grid-template-areas: "terminal" "splitter" "script";
  grid-template-rows: minmax(220px, 2fr) 5px minmax(220px, var(--command-script-pane-size, 3fr));
}

.command-script-editor {
  grid-area: script;
}

.command-terminal {
  grid-area: terminal;
}

.command-workbench__splitter {
  grid-area: splitter;
  position: relative;
  z-index: 6;
  touch-action: none;
}

:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-workbench__splitter {
  width: 5px;
  cursor: col-resize;
}

:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-workbench__splitter {
  height: 5px;
  cursor: row-resize;
}

.command-workbench__splitter::before {
  position: absolute;
  content: "";
  background: var(--color-divider);
}

:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-workbench__splitter::before {
  inset-block: 0;
  left: 2px;
  width: 1px;
}

:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-workbench__splitter::before {
  inset-inline: 0;
  top: 2px;
  height: 1px;
}

:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-workbench__splitter:hover::before,
:is(.command-workbench--terminal-left, .command-workbench--terminal-right) .command-workbench__splitter:focus-visible::before {
  left: 1px;
  width: 2px;
  background: var(--color-primary);
}

:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-workbench__splitter:hover::before,
:is(.command-workbench--terminal-top, .command-workbench--terminal-bottom) .command-workbench__splitter:focus-visible::before {
  top: 1px;
  height: 2px;
  background: var(--color-primary);
}

.command-workbench__splitter:focus-visible {
  outline: 0;
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
.command-terminal__toolbar span {
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
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
  border-radius: var(--radius-input);
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
  border-radius: var(--radius-sm);
  font: inherit;
  cursor: pointer;
}

.command-editor-toolbar :is(.command-editor-save, .command-editor-run) {
  width: 76px;
  flex: 0 0 76px;
  padding-inline: 0;
  text-align: center;
}

.command-terminal__toolbar .command-terminal-restart {
  width: 96px;
  flex: 0 0 96px;
  padding-inline: 0;
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
  background: color-mix(in srgb, var(--color-primary) 88%, white);
  border-color: color-mix(in srgb, var(--color-primary) 88%, white);
}

:is(.command-editor-toolbar, .command-terminal__toolbar) button:not(:disabled):active {
  transform: translateY(1px);
}

.command-editor-toolbar button:disabled,
.command-terminal__toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.command-terminal__toolbar span {
  margin-inline-end: auto;
}

.command-editor-error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-content-bg));
  border-block-start: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  font-size: 12px;
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

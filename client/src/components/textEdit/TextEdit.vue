<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import { MacroParser } from "../../../../common/macroParser";
import PopupSelect from "../PopupSelect.vue";
import PopupToast from "../PopupToast.vue";
import ParamEditor from "./ParamEditor.vue";
import TextAreaEditor from "./TextAreaEditor.vue";
import {
  cloneTextEditParamGroups,
  createMacroDisplayDetails,
  resolveTextEditParamGroup,
  resolveTextEditText,
  type ResolvedTextEditParamGroup,
  type TextEditAdditionalParamsProvider,
  type TextEditAdditionalParamScope,
  type TextEditParam,
  type TextEditParamGroup,
} from "./textEditTypes";
import type { TextEditTextResolution } from "./textEditTypes";

type Props = {
  paramGroups: readonly TextEditParamGroup[];
  text?: string;
  selectedGroupId?: string | null;
  isTextAreaVisible?: boolean;
  tabSize?: number;
  textIdentity?: string;
  getAdditionalParams?: TextEditAdditionalParamsProvider;
  isScriptMacroParamSyncEnabled?: boolean;
  isParamGroupManagementDisabled?: boolean;
  readonly?: boolean;
  isParamExpandedInitially?: boolean;
  accessibleLabel?: string;
};

const props = withDefaults(defineProps<Props>(), {
  text: "",
  selectedGroupId: null,
  isTextAreaVisible: true,
  tabSize: 2,
  textIdentity: "default",
  isScriptMacroParamSyncEnabled: false,
  isParamGroupManagementDisabled: false,
  readonly: false,
  isParamExpandedInitially: false,
  accessibleLabel: "Text editor",
});
const emit = defineEmits<{
  updateParamGroups: [groups: TextEditParamGroup[]];
  updateText: [text: string];
  updateSelectedGroupId: [groupId: string | null];
}>();

const groups = ref<TextEditParamGroup[]>(cloneTextEditParamGroups(props.paramGroups));
const text = ref(props.text);
const selectedGroupId = ref<string | null>(resolveSelectedGroupId(props.selectedGroupId, groups.value));
const isParamExpanded = ref(props.isParamExpandedInitially);
const textEdit = useTemplateRef<HTMLElement>("textEdit");
const paramPanel = useTemplateRef<HTMLElement>("paramPanel");
const popupToast = useTemplateRef<{ show: (text: string) => void }>("popupToast");
const paramEditor = useTemplateRef<{
  removeParam: (index: number) => void;
}>("paramEditor");
const paramPanelHeight = ref(132);
const pendingDeleteIndex = ref<number | null>(null);
const generatedMacroKeysByGroup = new Map<string, Set<string>>();
const groupSelectId = `text-edit-param-group-${crypto.randomUUID()}`;
const paramPanelId = `text-edit-param-panel-${crypto.randomUUID()}`;
const MIN_PARAM_PANEL_HEIGHT = 80;
const MIN_TEXT_AREA_HEIGHT = 120;
const SPLITTER_HEIGHT = 5;
const PARAM_TOOLBAR_HEIGHT = 40;
const KEYBOARD_RESIZE_STEP = 16;
let emittedText: string | null = null;
let resizeStart: { pointerY: number; panelHeight: number } | null = null;
let previousBodyCursor = "";
let previousBodyUserSelect = "";

watch(() => props.paramGroups, (value) => {
  const nextGroups = synchronizeScriptMacroParams(cloneTextEditParamGroups(value));
  groups.value = nextGroups;
  selectedGroupId.value = resolveSelectedGroupId(selectedGroupId.value, groups.value);
  if (!areParamGroupsEqual(value, nextGroups)) {
    emit("updateParamGroups", cloneTextEditParamGroups(nextGroups));
  }
}, { deep: true, immediate: true });
watch(() => props.text, (value) => {
  if (emittedText === value) {
    emittedText = null;
    return;
  }
  emittedText = null;
  text.value = value;
  synchronizeCurrentGroups();
});
watch(() => props.selectedGroupId, (value) => {
  selectedGroupId.value = resolveSelectedGroupId(value, groups.value);
});

const selectedGroup = computed(() => groups.value.find(
  (group) => group.id === selectedGroupId.value,
) ?? null);
const groupOptions = computed(() => groups.value.map((group) => ({
  value: group.id,
  label: group.name,
})));
const fixedParamCount = computed(() => props.isScriptMacroParamSyncEnabled
  ? MacroParser.extractKeys(text.value).length
  : 0);
const macroDetails = computed(() => createMacroDisplayDetails(
  selectedGroup.value,
  getAdditionalParams(),
));
const paramPanelStyle = computed<CSSProperties>(() => props.isTextAreaVisible
  ? { flexBasis: `${paramPanelHeight.value}px` }
  : {});

onUnmounted(() => {
  stopParamResize();
});

function onSelectGroup(groupId: string): void {
  selectedGroupId.value = resolveSelectedGroupId(groupId, groups.value);
  emit("updateSelectedGroupId", selectedGroupId.value);
}

function addParamGroup(): void {
  const sourceGroup = selectedGroup.value;
  if (sourceGroup === null) return;
  const group: TextEditParamGroup = {
    id: crypto.randomUUID(),
    name: nextParamGroupName(),
    sourceType: sourceGroup.sourceType,
    sourcePath: sourceGroup.sourcePath,
    params: [],
  };
  groups.value = [...groups.value, group];
  selectedGroupId.value = group.id;
  emit("updateParamGroups", cloneTextEditParamGroups(groups.value));
  emit("updateSelectedGroupId", group.id);
}

function removeParamGroup(groupId: string): void {
  const removedIndex = groups.value.findIndex((group) => group.id === groupId);
  if (removedIndex < 0) return;
  const removedGroup = groups.value[removedIndex];
  if (removedGroup === undefined) return;
  const remainingGroups = groups.value.filter((group) => group.id !== groupId);
  if (remainingGroups.length === 0) {
    const defaultGroup: TextEditParamGroup = {
      id: crypto.randomUUID(),
      name: "default params",
      sourceType: removedGroup.sourceType,
      sourcePath: removedGroup.sourcePath,
      params: [],
    };
    groups.value = [defaultGroup];
    selectedGroupId.value = defaultGroup.id;
    emit("updateParamGroups", cloneTextEditParamGroups(groups.value));
    emit("updateSelectedGroupId", defaultGroup.id);
    popupToast.value?.show("Created default params because no parameter groups remain.");
    return;
  }
  groups.value = remainingGroups;
  if (selectedGroupId.value === groupId) {
    selectedGroupId.value = remainingGroups[removedIndex]?.id
      ?? remainingGroups[removedIndex - 1]?.id
      ?? null;
  }
  emit("updateParamGroups", cloneTextEditParamGroups(groups.value));
  emit("updateSelectedGroupId", selectedGroupId.value);
}

function nextParamGroupName(): string {
  const names = new Set(groups.value.map((group) => group.name));
  let index = 1;
  while (names.has(`Group ${index}`)) index += 1;
  return `Group ${index}`;
}

function updateSelectedParams(params: TextEditParam[]): void {
  const groupId = selectedGroupId.value;
  groups.value = groups.value.map((group) => group.id === groupId
    ? { ...group, params: params.map((param) => ({ ...param })) }
    : group);
  emit("updateParamGroups", cloneTextEditParamGroups(groups.value));
}

function updateText(value: string): void {
  text.value = value;
  synchronizeCurrentGroups();
  emittedText = value;
  emit("updateText", value);
}

function synchronizeCurrentGroups(): void {
  const nextGroups = synchronizeScriptMacroParams(groups.value);
  if (areParamGroupsEqual(groups.value, nextGroups)) return;
  groups.value = nextGroups;
  emit("updateParamGroups", cloneTextEditParamGroups(nextGroups));
}

function synchronizeScriptMacroParams(
  sourceGroups: readonly TextEditParamGroup[],
): TextEditParamGroup[] {
  if (!props.isScriptMacroParamSyncEnabled) return cloneTextEditParamGroups(sourceGroups);
  const macroKeys = MacroParser.extractKeys(text.value);
  const activeGroupIds = new Set(sourceGroups.map((group) => group.id));
  for (const groupId of generatedMacroKeysByGroup.keys()) {
    if (!activeGroupIds.has(groupId)) generatedMacroKeysByGroup.delete(groupId);
  }
  return sourceGroups.map((group) => synchronizeGroupMacroParams(group, macroKeys));
}

function synchronizeGroupMacroParams(
  group: TextEditParamGroup,
  macroKeys: readonly string[],
): TextEditParamGroup {
  let generatedKeys = generatedMacroKeysByGroup.get(group.id);
  if (generatedKeys === undefined) {
    const macroKeySet = new Set(macroKeys);
    generatedKeys = new Set(group.params
      .filter((param) => macroKeySet.has(param.key))
      .map((param) => param.key));
    generatedMacroKeysByGroup.set(group.id, generatedKeys);
  }

  const activeMacroKeys = new Set(macroKeys);
  const remainingParams = group.params.map((param) => ({ ...param }));
  for (const key of [...generatedKeys]) {
    if (activeMacroKeys.has(key)) continue;
    const staleIndex = remainingParams.findIndex((param) => param.key === key);
    if (staleIndex >= 0) remainingParams.splice(staleIndex, 1);
    generatedKeys.delete(key);
  }

  const fixedParams: TextEditParam[] = [];
  for (const key of macroKeys) {
    const existingIndex = remainingParams.findIndex((param) => param.key === key);
    if (existingIndex >= 0) {
      const existingParam = remainingParams.splice(existingIndex, 1)[0];
      if (existingParam !== undefined) fixedParams.push(existingParam);
      continue;
    }
    fixedParams.push({ key, value: "", enabled: true });
    generatedKeys.add(key);
  }
  return { ...group, params: [...fixedParams, ...remainingParams] };
}

function areParamGroupsEqual(
  left: readonly TextEditParamGroup[],
  right: readonly TextEditParamGroup[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((group, groupIndex) => {
    const otherGroup = right[groupIndex];
    return otherGroup !== undefined
      && group.id === otherGroup.id
      && group.name === otherGroup.name
      && group.sourceType === otherGroup.sourceType
      && group.sourcePath === otherGroup.sourcePath
      && group.params.length === otherGroup.params.length
      && group.params.every((param, paramIndex) => {
        const otherParam = otherGroup.params[paramIndex];
        return otherParam !== undefined
          && param.key === otherParam.key
          && param.value === otherParam.value
          && param.enabled === otherParam.enabled;
      });
  });
}

function getRawParamGroups(): TextEditParamGroup[] {
  return cloneTextEditParamGroups(groups.value);
}

function getResolvedParamGroups(): ResolvedTextEditParamGroup[] {
  const additionalScopes = getAdditionalParams();
  return groups.value.map((group) => resolveTextEditParamGroup(group, additionalScopes));
}

function getRawText(): string {
  return text.value;
}

function getResolvedText(): TextEditTextResolution {
  return resolveTextEditText(text.value, selectedGroup.value, getAdditionalParams());
}

function getAdditionalParams(): readonly TextEditAdditionalParamScope[] {
  return props.getAdditionalParams?.() ?? [];
}

function requestDeleteParam(index: number): void {
  pendingDeleteIndex.value = index;
}

function confirmDeleteParam(): void {
  const index = pendingDeleteIndex.value;
  pendingDeleteIndex.value = null;
  if (index !== null) paramEditor.value?.removeParam(index);
}

function showCopyStatus(message: string): void {
  popupToast.value?.show(message);
}

function startParamResize(event: PointerEvent): void {
  if (event.button !== 0 || paramPanel.value === null) return;
  event.preventDefault();
  resizeStart = {
    pointerY: event.clientY,
    panelHeight: paramPanel.value.getBoundingClientRect().height,
  };
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeParamPanel);
  window.addEventListener("pointerup", stopParamResize);
  window.addEventListener("pointercancel", stopParamResize);
}

function resizeParamPanel(event: PointerEvent): void {
  if (resizeStart === null) return;
  setParamPanelHeight(resizeStart.panelHeight + event.clientY - resizeStart.pointerY);
}

function stopParamResize(): void {
  if (resizeStart === null) return;
  resizeStart = null;
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  window.removeEventListener("pointermove", resizeParamPanel);
  window.removeEventListener("pointerup", stopParamResize);
  window.removeEventListener("pointercancel", stopParamResize);
}

function resizeParamPanelByKey(event: KeyboardEvent): void {
  let targetHeight: number;
  switch (event.key) {
    case "ArrowUp": targetHeight = paramPanelHeight.value - KEYBOARD_RESIZE_STEP; break;
    case "ArrowDown": targetHeight = paramPanelHeight.value + KEYBOARD_RESIZE_STEP; break;
    case "Home": targetHeight = MIN_PARAM_PANEL_HEIGHT; break;
    case "End": targetHeight = maximumParamPanelHeight(); break;
    default: return;
  }
  event.preventDefault();
  setParamPanelHeight(targetHeight);
}

function setParamPanelHeight(height: number): void {
  paramPanelHeight.value = Math.round(Math.min(
    maximumParamPanelHeight(),
    Math.max(MIN_PARAM_PANEL_HEIGHT, height),
  ));
}

function maximumParamPanelHeight(): number {
  const availableHeight = textEdit.value?.clientHeight ?? 0;
  return Math.max(
    MIN_PARAM_PANEL_HEIGHT,
    availableHeight - PARAM_TOOLBAR_HEIGHT - SPLITTER_HEIGHT - MIN_TEXT_AREA_HEIGHT,
  );
}

function resolveSelectedGroupId(
  requestedId: string | null,
  availableGroups: readonly TextEditParamGroup[],
): string | null {
  return requestedId !== null && availableGroups.some((group) => group.id === requestedId)
    ? requestedId
    : availableGroups[0]?.id ?? null;
}

defineExpose({
  getRawParamGroups,
  getResolvedParamGroups,
  getRawText,
  getResolvedText,
});
</script>

<template>
  <section
    ref="textEdit"
    class="text-edit"
    :class="{ 'is-param-only': !isTextAreaVisible }"
    :aria-label="accessibleLabel"
  >
    <header v-if="groups.length > 0" class="text-edit__param-toolbar">
      <button
        type="button"
        class="text-edit__param-toggle"
        :aria-expanded="isParamExpanded"
        :aria-controls="paramPanelId"
        :aria-label="isParamExpanded ? 'Collapse parameters' : 'Expand parameters'"
        :title="isParamExpanded ? 'Collapse parameters' : 'Expand parameters'"
        @click="isParamExpanded = !isParamExpanded"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3" /></svg>
      </button>
      <span :id="groupSelectId">{{ isParamGroupManagementDisabled ? "Parameters" : "Parameter Group" }}</span>
      <div v-if="!isParamGroupManagementDisabled" class="text-edit__group-select">
        <PopupSelect
          :value="selectedGroupId ?? ''"
          :options="groupOptions"
          accessible-label="Parameter group"
          :labelled-by="groupSelectId"
          :is-option-removal-enabled="true"
          @update-value="onSelectGroup"
          @remove-option="removeParamGroup"
        />
      </div>
      <button
        v-if="!isParamGroupManagementDisabled"
        type="button"
        class="text-edit__add-group"
        aria-label="Add parameter group"
        title="Add parameter group"
        @click="addParamGroup"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </header>
    <div
      v-if="selectedGroup !== null"
      v-show="isParamExpanded"
      :id="paramPanelId"
      ref="paramPanel"
      class="text-edit__param-panel"
      :style="paramPanelStyle"
    >
      <ParamEditor
        ref="paramEditor"
        :group="selectedGroup"
        :macro-details="macroDetails"
        :fixed-param-count="fixedParamCount"
        :readonly="readonly"
        @update="updateSelectedParams"
        @copy-status="showCopyStatus"
        @request-delete="requestDeleteParam"
      />
    </div>
    <p v-else class="text-edit__empty">No parameter groups.</p>
    <div
      v-if="isTextAreaVisible && isParamExpanded"
      class="text-edit__splitter"
      role="separator"
      aria-label="Resize parameter and text areas"
      aria-orientation="horizontal"
      :aria-valuemin="MIN_PARAM_PANEL_HEIGHT"
      :aria-valuemax="maximumParamPanelHeight()"
      :aria-valuenow="paramPanelHeight"
      tabindex="0"
      @pointerdown="startParamResize"
      @keydown="resizeParamPanelByKey"
    ></div>
    <TextAreaEditor
      v-if="isTextAreaVisible"
      :value="text"
      :identity="textIdentity"
      :macro-details="macroDetails"
      :tab-size="tabSize"
      :readonly="readonly"
      @update="updateText"
    />
    <PopupToast ref="popupToast" />
    <div
      v-if="pendingDeleteIndex !== null"
      class="text-edit__dialog-backdrop"
      @pointerdown.self="pendingDeleteIndex = null"
    >
      <section
        class="text-edit__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-param-title"
        @keydown.escape.prevent="pendingDeleteIndex = null"
      >
        <h2 id="delete-param-title">Delete parameter?</h2>
        <p>This parameter will be deleted.</p>
        <footer>
          <button type="button" @click="pendingDeleteIndex = null">Cancel</button>
          <button type="button" class="is-danger" autofocus @click="confirmDeleteParam">Delete</button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.text-edit {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-content-bg);
}

.text-edit::before {
  position: absolute;
  z-index: 5;
  top: 40px;
  bottom: 0;
  left: 43px;
  width: 1px;
  content: "";
  background: var(--color-border);
  pointer-events: none;
}

.text-edit__param-toolbar {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
  background: color-mix(in srgb, var(--color-surface) 72%, var(--color-content-bg));
}

.text-edit__param-toggle {
  width: 24px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.text-edit__param-toggle:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.text-edit__param-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.text-edit__param-toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  transition: transform 0.15s ease;
}

.text-edit__param-toggle[aria-expanded="false"] svg {
  transform: rotate(-90deg);
}

.text-edit__param-toolbar > span {
  margin-inline-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.text-edit__group-select {
  width: 160px;
}

.text-edit__group-select :deep(.popup-select__trigger) {
  border-color: var(--color-border);
}

.text-edit__add-group,
.text-edit__param-action {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.text-edit__add-group:hover,
.text-edit__param-action:hover:not(:disabled) {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
}

.text-edit__add-group:focus-visible,
.text-edit__param-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.text-edit__add-group svg,
.text-edit__param-action svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}

.text-edit__param-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.text-edit__param-action.is-danger:hover:not(:disabled) {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 55%, var(--color-border));
}

.text-edit__select-all {
  width: 36px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 36px;
}

.text-edit__select-all input {
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.text-edit__param-panel {
  min-height: 80px;
  flex: 0 1 auto;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  background: color-mix(in srgb, var(--color-surface) 42%, var(--color-content-bg));
}

.text-edit.is-param-only .text-edit__param-panel {
  min-height: 0;
  flex: 1;
}

.text-edit__splitter {
  position: relative;
  z-index: 4;
  height: 5px;
  flex: 0 0 5px;
  background: transparent;
  cursor: row-resize;
  touch-action: none;
}

.text-edit__splitter::before {
  position: absolute;
  top: 2px;
  right: 0;
  left: 0;
  height: 1px;
  content: "";
  background: var(--color-border);
}

.text-edit__splitter:hover::before,
.text-edit__splitter:focus-visible::before {
  height: 2px;
  background: var(--color-primary);
}

.text-edit__splitter:focus-visible {
  outline: 0;
}

.text-edit__empty {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
}

.text-edit__dialog-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 58%);
}

.text-edit__dialog {
  width: min(420px, calc(100% - 32px));
  padding: var(--space-4);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 20px 56px rgb(0 0 0 / 42%);
}

.text-edit__dialog h2,
.text-edit__dialog p {
  margin: 0;
}

.text-edit__dialog h2 {
  font-size: 16px;
}

.text-edit__dialog p {
  margin-block-start: var(--space-2);
  color: var(--color-text-muted);
}

.text-edit__dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-block-start: var(--space-4);
}

.text-edit__dialog button {
  min-height: 30px;
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.text-edit__dialog button.is-danger {
  color: var(--color-bg);
  background: var(--color-danger);
  border-color: var(--color-danger);
}

.text-edit__dialog button:focus-visible,
.text-edit__select-all input:focus-visible {
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

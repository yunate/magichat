<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import { FunnelTask } from "../../../../common/funnelTask";
import { MacroParser } from "../../../../common/macroParser";
import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import type { PopupToastHandle } from "../popupToast";
import PopupSelect from "../PopupSelect.vue";
import PopupToast from "../PopupToast.vue";
import SplitContainer from "../SplitContainer.vue";
import ParamEditor from "./ParamEditor.vue";
import TextAreaEditor from "./TextAreaEditor.vue";
import {
  cloneTextEditParamGroups,
  createMacroDisplayDetails,
  resolveTextEditParamGroup,
  resolveTextEditText,
  type MacroAnalysis,
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
  getOverrideParams?: TextEditAdditionalParamsProvider;
  isScriptMacroParamSyncEnabled?: boolean;
  isParamGroupManagementDisabled?: boolean;
  readonly?: boolean;
  isParamExpandedInitially?: boolean;
  paramPriorityDescription?: string;
  accessibleLabel?: string;
  scriptType?: ScriptType;
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
const groupRenameInput = useTemplateRef<HTMLInputElement>("groupRenameInput");
const paramHelpButton = useTemplateRef<HTMLButtonElement>("paramHelpButton");
const paramHelp = useTemplateRef<HTMLElement>("paramHelp");
const popupToast = useTemplateRef<PopupToastHandle>("popupToast");
const paramEditor = useTemplateRef<{
  removeParam: (index: number) => void;
}>("paramEditor");
const paramPanelHeight = ref(132);
const isParamHelpOpen = ref(false);
const isGroupRenaming = ref(false);
const groupRenameValue = ref("");
const paramHelpStyle = ref<CSSProperties>({});
const macroAnalysis = shallowRef<MacroAnalysis | null>(null);
const generatedMacroKeysByGroup = reactive(new Map<string, Set<string>>());
const groupSelectId = `text-edit-param-group-${crypto.randomUUID()}`;
const paramPanelId = `text-edit-param-panel-${crypto.randomUUID()}`;
const MIN_PARAM_PANEL_HEIGHT = 80;
const MIN_TEXT_AREA_HEIGHT = 120;
const SPLITTER_HEIGHT = 12;
const PARAM_TOOLBAR_HEIGHT = 40;
const PARAM_HELP_MARGIN = 8;
const PARAM_HELP_GAP = 8;
let emittedText: string | null = null;
let macroRevision = 0;
const macroAnalysisFunnelTask = new FunnelTask(computeMacroAnalysis, 300);

watch(() => props.paramGroups, (value) => {
  const nextGroups = cloneTextEditParamGroups(value);
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
  invalidateMacroAnalysis();
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
const fixedParamCount = computed(() => selectedGroup.value === null
  ? 0
  : generatedMacroKeysByGroup.get(selectedGroup.value.id)?.size ?? 0);
const macroScope = computed(() => ({
  selectedGroup: selectedGroup.value,
  additionalScopes: getAdditionalParams(),
  overrideScopes: getOverrideParams(),
}));
const macroDetails = computed(() => macroAnalysis.value?.details ?? new Map());
const paramPanelStyle = computed<CSSProperties>(() => props.isTextAreaVisible
  ? { flexBasis: `${paramPanelHeight.value}px` }
  : {});

watch(macroScope, invalidateMacroAnalysis, { deep: true, immediate: true });
watch(() => props.textIdentity, invalidateMacroAnalysis);
onMounted(() => {
  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("resize", closeParamHelp);
  window.addEventListener("scroll", closeParamHelp, true);
});
onUnmounted(() => {
  macroAnalysisFunnelTask.cancel();
  window.removeEventListener("pointerdown", onWindowPointerDown);
  window.removeEventListener("resize", closeParamHelp);
  window.removeEventListener("scroll", closeParamHelp, true);
});

function onSelectGroup(groupId: string): void {
  cancelGroupRename();
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

function beginGroupRename(): void {
  const group = selectedGroup.value;
  if (group === null) return;
  groupRenameValue.value = group.name;
  isGroupRenaming.value = true;
  void nextTick(() => {
    groupRenameInput.value?.focus();
    groupRenameInput.value?.select();
  });
}

function updateGroupRenameValue(event: Event): void {
  if (event.target instanceof HTMLInputElement) groupRenameValue.value = event.target.value;
}

function commitGroupRename(): void {
  if (!isGroupRenaming.value) return;
  const group = selectedGroup.value;
  if (group === null) {
    cancelGroupRename();
    return;
  }
  const name = groupRenameValue.value.trim();
  if (name.length === 0) {
    popupToast.value?.show("Parameter group name is required.", { level: "warning" });
    cancelGroupRename();
    return;
  }
  if (groups.value.some((candidate) => candidate.id !== group.id && candidate.name === name)) {
    popupToast.value?.show("Parameter group names must be unique.", { level: "warning" });
    cancelGroupRename();
    return;
  }
  isGroupRenaming.value = false;
  if (name === group.name) return;
  groups.value = groups.value.map((candidate) => candidate.id === group.id
    ? { ...candidate, name }
    : candidate);
  emit("updateParamGroups", cloneTextEditParamGroups(groups.value));
}

function cancelGroupRename(): void {
  isGroupRenaming.value = false;
  groupRenameValue.value = "";
}

function removeParamGroup(groupId: string): void {
  cancelGroupRename();
  const removedIndex = groups.value.findIndex((group) => group.id === groupId);
  if (removedIndex < 0) return;
  const removedGroup = groups.value[removedIndex];
  if (removedGroup === undefined) return;
  const remainingGroups = groups.value.filter((group) => group.id !== groupId);
  if (remainingGroups.length === 0) {
    const defaultGroup: TextEditParamGroup = {
      id: crypto.randomUUID(),
      name: "default",
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
  invalidateMacroAnalysis();
  emittedText = value;
  emit("updateText", value);
}

function synchronizeCurrentGroups(macroKeys: readonly string[]): void {
  const nextGroups = synchronizeScriptMacroParams(groups.value, macroKeys);
  if (areParamGroupsEqual(groups.value, nextGroups)) return;
  groups.value = nextGroups;
  emit("updateParamGroups", cloneTextEditParamGroups(nextGroups));
}

function synchronizeScriptMacroParams(
  sourceGroups: readonly TextEditParamGroup[],
  macroKeys: readonly string[],
): TextEditParamGroup[] {
  if (!props.isScriptMacroParamSyncEnabled) return cloneTextEditParamGroups(sourceGroups);
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
  const overrideScopes = getOverrideParams();
  return groups.value.map((group) => resolveTextEditParamGroup(
    group,
    additionalScopes,
    overrideScopes,
  ));
}

function getRawText(): string {
  return text.value;
}

function getResolvedText(): TextEditTextResolution {
  return ensureMacroAnalysisCurrent().textResolution;
}

function invalidateMacroAnalysis(): void {
  macroRevision += 1;
  macroAnalysisFunnelTask.schedule();
}

function ensureMacroAnalysisCurrent(): MacroAnalysis {
  const current = macroAnalysis.value;
  if (current !== null && current.revision === macroRevision) return current;
  macroAnalysisFunnelTask.cancel();
  return computeMacroAnalysis();
}

function computeMacroAnalysis(): MacroAnalysis {
  const scope = macroScope.value;
  const references = MacroParser.extractReferences(text.value);
  const analysis: MacroAnalysis = {
    revision: macroRevision,
    references,
    details: createMacroDisplayDetails(
      scope.selectedGroup,
      scope.additionalScopes,
      scope.overrideScopes,
    ),
    textResolution: resolveTextEditText(
      text.value,
      scope.selectedGroup,
      scope.additionalScopes,
      scope.overrideScopes,
    ),
  };
  macroAnalysis.value = analysis;
  synchronizeCurrentGroups([...new Set(references.map((reference) => reference.key))]);
  return analysis;
}

function getAdditionalParams(): readonly TextEditAdditionalParamScope[] {
  return props.getAdditionalParams?.() ?? [];
}

function getOverrideParams(): readonly TextEditAdditionalParamScope[] {
  return props.getOverrideParams?.() ?? [];
}

function requestDeleteParam(index: number): void {
  paramEditor.value?.removeParam(index);
}

function showCopyStatus(message: string): void {
  popupToast.value?.show(message);
}

function toggleParamHelp(): void {
  if (isParamHelpOpen.value) {
    closeParamHelp();
    return;
  }
  isParamHelpOpen.value = true;
  void nextTick(positionParamHelp);
}

function closeParamHelp(): void {
  isParamHelpOpen.value = false;
}

function positionParamHelp(): void {
  const buttonBounds = paramHelpButton.value?.getBoundingClientRect();
  const helpBounds = paramHelp.value?.getBoundingClientRect();
  if (buttonBounds === undefined || helpBounds === undefined) return;
  const maximumLeft = window.innerWidth - helpBounds.width - PARAM_HELP_MARGIN;
  const left = Math.max(PARAM_HELP_MARGIN, Math.min(buttonBounds.left, maximumLeft));
  const below = buttonBounds.bottom + PARAM_HELP_GAP;
  const top = below + helpBounds.height <= window.innerHeight - PARAM_HELP_MARGIN
    ? below
    : Math.max(PARAM_HELP_MARGIN, buttonBounds.top - helpBounds.height - PARAM_HELP_GAP);
  paramHelpStyle.value = { left: `${left}px`, top: `${top}px` };
}

function onWindowPointerDown(event: PointerEvent): void {
  if (!isParamHelpOpen.value || !(event.target instanceof Node)) return;
  if (paramHelpButton.value?.contains(event.target) || paramHelp.value?.contains(event.target)) return;
  closeParamHelp();
}

function onParamHelpKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  closeParamHelp();
  paramHelpButton.value?.focus();
}

async function copyResolvedCode(): Promise<void> {
  const resolution = getResolvedText();
  if (!resolution.successful) {
    popupToast.value?.show(
      `Failed to copy code: ${resolution.error ?? "Macro resolution failed."}`,
      { level: "error" },
    );
    return;
  }
  try {
    await navigator.clipboard.writeText(resolution.value);
    popupToast.value?.show("Copied resolved code.", { level: "success" });
  } catch (reason: unknown) {
    popupToast.value?.show("Failed to copy code.", { level: "error" });
    console.error("Failed to copy resolved code:", reason);
  }
}

function setParamPanelHeight(height: number): void {
  paramPanelHeight.value = Math.round(Math.min(
    maximumParamPanelHeight(),
    Math.max(MIN_PARAM_PANEL_HEIGHT, height),
  ));
}

function resizeParamPanel(_index: number, height: number): void {
  setParamPanelHeight(height);
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
    :class="{
      'is-param-only': !isTextAreaVisible,
      'is-param-expanded': isParamExpanded,
    }"
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
      <div v-if="!isParamGroupManagementDisabled && !isGroupRenaming" class="text-edit__group-select">
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
      <input
        v-else-if="!isParamGroupManagementDisabled"
        ref="groupRenameInput"
        class="text-edit__group-rename"
        type="text"
        :value="groupRenameValue"
        aria-label="Parameter group name"
        @input="updateGroupRenameValue"
        @blur="commitGroupRename"
        @keydown.enter.prevent="commitGroupRename"
        @keydown.escape.prevent="cancelGroupRename"
      />
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
      <button
        v-if="!isParamGroupManagementDisabled"
        type="button"
        class="text-edit__rename-group"
        aria-label="Rename parameter group"
        title="Rename parameter group"
        @click="beginGroupRename"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 11.5-.5 2 2-.5 7.75-7.75-1.5-1.5zM9.75 4.75l1.5 1.5" /></svg>
      </button>
      <button
        ref="paramHelpButton"
        type="button"
        class="text-edit__param-help-button"
        aria-label="Parameter help"
        title="Parameter help"
        aria-haspopup="dialog"
        :aria-expanded="isParamHelpOpen"
        :aria-controls="isParamHelpOpen ? `${paramPanelId}-help` : undefined"
        @click="toggleParamHelp"
        @keydown="onParamHelpKeydown"
      >?</button>
      <button
        v-if="isTextAreaVisible"
        type="button"
        class="text-edit__copy-code"
        title="Copy code with resolved Macros"
        @click="copyResolvedCode"
      >Copy code</button>
    </header>
    <Teleport to="body">
      <aside
        v-if="isParamHelpOpen"
        :id="`${paramPanelId}-help`"
        ref="paramHelp"
        class="text-edit-param-help"
        :style="paramHelpStyle"
        role="dialog"
        aria-label="Parameter rules"
        @keydown="onParamHelpKeydown"
      >
        <p>Use <code>mh{xxx}</code>, where <code>xxx</code> is the key, to reference a parameter in code or another value.</p>
        <ul>
          <li>Keys are unique within a group and start with a letter or <code>_</code>.</li>
          <li>Use letters, numbers, or <code>_</code>; <code>.</code> and <code>-</code> separate non-empty segments.</li>
          <li v-if="paramPriorityDescription">{{ paramPriorityDescription }}</li>
          <li>Only enabled parameters are resolved.</li>
          <li>References must exist and cannot form cycles.</li>
        </ul>
      </aside>
    </Teleport>
    <SplitContainer
      class="text-edit__body"
      orientation="horizontal"
      :separator-labels="['Resize parameter and text areas']"
      :separator-visible="[isParamExpanded]"
      @resize="resizeParamPanel"
    >
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
      <p v-else v-show="isParamExpanded" class="text-edit__empty">No parameter groups.</p>
      <TextAreaEditor
        v-if="isTextAreaVisible"
        :value="text"
        :identity="textIdentity"
        :macro-analysis="macroAnalysis"
        :ensure-macro-analysis="ensureMacroAnalysisCurrent"
        :script-type="scriptType"
        :tab-size="tabSize"
        :readonly="readonly"
        @update="updateText"
      />
    </SplitContainer>
    <PopupToast ref="popupToast" />
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
  background: transparent;
}

.text-edit__param-toolbar {
  height: 40px;
  display: flex;
  align-items: center;
  flex: 0 0 40px;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
  overflow: hidden;
  background: transparent;
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
  border-radius: var(--radius-medium);
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
  flex: none;
  margin-inline-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.text-edit__group-select {
  width: 160px;
  flex: 0 0 160px;
}

.text-edit__group-rename {
  width: 160px;
  height: var(--tree-row-height);
  flex: 0 0 160px;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.text-edit__group-select :deep(.popup-select__trigger) {
  border-color: var(--color-border);
}

.text-edit__add-group,
.text-edit__rename-group,
.text-edit__param-help-button,
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
  border-radius: var(--radius-medium);
  cursor: pointer;
}

.text-edit__add-group:hover,
.text-edit__rename-group:hover,
.text-edit__param-help-button:hover,
.text-edit__param-action:hover:not(:disabled) {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
}

.text-edit__add-group:focus-visible,
.text-edit__rename-group:focus-visible,
.text-edit__param-help-button:focus-visible,
.text-edit__param-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.text-edit__add-group svg,
.text-edit__rename-group svg,
.text-edit__param-action svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}

.text-edit__param-help-button {
  font-size: 13px;
  font-weight: 600;
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

.text-edit__copy-code {
  min-height: 28px;
  flex: none;
  margin-inline-start: auto;
  padding-inline: var(--space-3);
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  cursor: pointer;
  white-space: nowrap;
}

.text-edit__copy-code:hover {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
}

.text-edit__copy-code:active {
  transform: translateY(1px);
}

.text-edit__copy-code:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
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
  border-block-end: 1px solid var(--color-border);
  background: transparent;
}

.text-edit.is-param-only .text-edit__param-panel {
  min-height: 0;
  flex: 1;
}

.text-edit__body {
  flex: 1;
  overflow: hidden;
}

.text-edit__empty {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
}

.text-edit__select-all input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.text-edit-param-help {
  position: fixed;
  z-index: 1000;
  width: min(320px, calc(100vw - 16px));
  padding: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface-deep);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-flyout);
  font-size: 12px;
  line-height: 1.5;
}

.text-edit-param-help p {
  margin: 0 0 var(--space-2);
}

.text-edit-param-help ul {
  margin: 0;
  padding-inline-start: var(--space-4);
}

.text-edit-param-help code {
  color: var(--color-code-variable);
  font-family: Consolas, "Courier New", monospace;
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

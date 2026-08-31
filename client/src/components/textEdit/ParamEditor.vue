<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import { confirmActionDialog } from "../confirmDialog";
import SplitContainer from "../SplitContainer.vue";
import MacroTextInput from "./MacroTextInput.vue";
import type {
  MacroDisplayDetail,
  TextEditParam,
  TextEditParamGroup,
} from "./textEditTypes";
import { getTextEditParamKeyError } from "./textEditTypes";

type Props = {
  group: TextEditParamGroup;
  macroDetails: ReadonlyMap<string, MacroDisplayDetail>;
  fixedParamCount?: number;
  readonly?: boolean;
};

type ParamBatch = Readonly<{
  format: "magichat-param-v1";
  params: readonly TextEditParam[];
}>;

type ParamField = "key" | "value";
type DropPosition = "before" | "after";
type RowMenu = Readonly<{ index: number; x: number; y: number }>;
type TextControl = HTMLInputElement | HTMLTextAreaElement;

const props = withDefaults(defineProps<Props>(), {
  fixedParamCount: 0,
  readonly: false,
});
const emit = defineEmits<{
  update: [params: TextEditParam[]];
  copyStatus: [message: string];
  requestDelete: [index: number];
}>();

const rowIds = ref<string[]>(props.group.params.map(() => crypto.randomUUID()));
const paramEditor = useTemplateRef<HTMLElement>("paramEditor");
const draftId = ref<string>(crypto.randomUUID());
const draftParam = ref<TextEditParam>({ key: "", value: "", enabled: true });
const draggedIndex = ref<number | null>(null);
const dropTarget = ref<Readonly<{ index: number; position: DropPosition }> | null>(null);
const rowMenu = ref<RowMenu | null>(null);
const editorWidth = ref(0);
const valueLineCounts = ref<ReadonlyMap<string, number>>(new Map());
const composingDraftFields = new Set<ParamField>();
const editorId = `param-editor-${crypto.randomUUID()}`;
const keyColumnWidth = ref<number | null>(null);
const MIN_KEY_COLUMN_WIDTH = 100;
const MIN_VALUE_COLUMN_WIDTH = 140;
const PARAM_GRID_FIXED_WIDTH = 91;
const PARAM_KEY_COLUMN_START = 44;
const PARAM_ROW_BASE_HEIGHT = 38;
const PARAM_VALUE_LINE_HEIGHT = 20;
const PARAM_VALUE_MAX_VISIBLE_LINES = 4;
let editorResizeObserver: ResizeObserver | null = null;

watch(() => props.group.id, () => {
  rowIds.value = props.group.params.map(() => crypto.randomUUID());
  draftId.value = crypto.randomUUID();
  draftParam.value = { key: "", value: "", enabled: true };
  valueLineCounts.value = new Map();
  composingDraftFields.clear();
});
watch(() => props.group.params.length, (length) => {
  while (rowIds.value.length < length) rowIds.value.push(crypto.randomUUID());
  rowIds.value.length = length;
});

const keyErrors = computed(() => props.group.params.map((_param, index) => {
  return getTextEditParamKeyError(props.group.params, index) ?? "";
}));
const effectiveKeyColumnWidth = computed(() => Math.min(
  keyColumnWidth.value ?? Math.max(
    MIN_KEY_COLUMN_WIDTH,
    (editorWidth.value - PARAM_GRID_FIXED_WIDTH) / 2,
  ),
  maximumKeyColumnWidth(),
));
const keyPaneStyle = computed<CSSProperties>(() => keyColumnWidth.value === null
  ? {}
  : {
      flex: `0 1 ${PARAM_KEY_COLUMN_START + effectiveKeyColumnWidth.value}px`,
      maxWidth: `${PARAM_KEY_COLUMN_START + maximumKeyColumnWidth()}px`,
    });

function paramRowStyle(rowId: string, value: string, hasError = false): CSSProperties {
  const lineCount = Math.min(
    PARAM_VALUE_MAX_VISIBLE_LINES,
    valueLineCounts.value.get(rowId) ?? value.split(/\r\n?|\n/).length,
  );
  const contentHeight = PARAM_ROW_BASE_HEIGHT + (lineCount - 1) * PARAM_VALUE_LINE_HEIGHT;
  return { height: `${Math.max(hasError ? 56 : 0, contentHeight)}px` };
}

function updateValueLineCount(rowId: string, lineCount: number): void {
  if (valueLineCounts.value.get(rowId) === lineCount) return;
  const next = new Map(valueLineCounts.value);
  next.set(rowId, lineCount);
  valueLineCounts.value = next;
}

onMounted(() => {
  updateEditorWidth();
  editorResizeObserver = new ResizeObserver(updateEditorWidth);
  if (paramEditor.value !== null) editorResizeObserver.observe(paramEditor.value);
  window.addEventListener("pointerdown", closeRowMenu);
  window.addEventListener("scroll", closeRowMenu, true);
  window.addEventListener("keydown", onWindowKeydown);
});

onUnmounted(() => {
  editorResizeObserver?.disconnect();
  editorResizeObserver = null;
  window.removeEventListener("pointerdown", closeRowMenu);
  window.removeEventListener("scroll", closeRowMenu, true);
  window.removeEventListener("keydown", onWindowKeydown);
});

function updateParam<KField extends keyof TextEditParam>(
  index: number,
  field: KField,
  value: TextEditParam[KField],
): void {
  if (props.readonly) return;
  if (isFixedParam(index) && field === "key") return;
  emit("update", props.group.params.map((param, currentIndex) => currentIndex === index
    ? { ...param, [field]: value }
    : { ...param }));
}

async function copyAll(): Promise<void> {
  rowMenu.value = null;
  const params = props.group.params.map((param) => ({ ...param }));
  const batch: ParamBatch = {
    format: "magichat-param-v1",
    params,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(batch, null, 2));
    emit("copyStatus", `Copied all ${params.length} parameter${params.length === 1 ? "" : "s"}.`);
  } catch (reason: unknown) {
    emit("copyStatus", "Failed to copy all parameters.");
    console.error("Failed to copy all parameters:", reason);
  }
}

async function copyParam(index: number): Promise<void> {
  const param = props.group.params[index];
  if (param === undefined) return;
  rowMenu.value = null;
  const batch: ParamBatch = {
    format: "magichat-param-v1",
    params: [{ ...param }],
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(batch, null, 2));
    emit("copyStatus", `Copied parameter ${index + 1}.`);
  } catch (reason: unknown) {
    emit("copyStatus", `Failed to copy parameter ${index + 1}.`);
    console.error("Failed to copy parameter:", reason);
  }
}

async function requestAllParamsDelete(): Promise<void> {
  rowMenu.value = null;
  const deleteCount = props.group.params.length - props.fixedParamCount;
  if (deleteCount <= 0) return;
  const decision = await confirmActionDialog({
    title: "Delete all parameters?",
    descriptions: [
      `Delete all ${deleteCount} editable parameter${deleteCount === 1 ? "" : "s"} from "${props.group.name}"?`,
    ],
    actionId: "delete",
    actionLabel: "Delete all",
  });
  if (decision !== "delete") return;
  emit("update", props.group.params
    .slice(0, props.fixedParamCount)
    .map((param) => ({ ...param })));
}

function requestParamDelete(index: number): void {
  if (isFixedParam(index)) return;
  rowMenu.value = null;
  emit("requestDelete", index);
}

function openRowMenu(event: MouseEvent, index: number): void {
  if (props.readonly) return;
  event.preventDefault();
  event.stopPropagation();
  const menuWidth = 160;
  const menuHeight = 140;
  const margin = 8;
  rowMenu.value = {
    index,
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  };
}

function closeRowMenu(): void {
  rowMenu.value = null;
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeRowMenu();
}

function setKeyColumnWidth(width: number): void {
  keyColumnWidth.value = Math.round(Math.min(
    maximumKeyColumnWidth(),
    Math.max(MIN_KEY_COLUMN_WIDTH, width),
  ));
}

function resizeKeyColumn(_index: number, separatorPosition: number): void {
  setKeyColumnWidth(separatorPosition - PARAM_KEY_COLUMN_START);
}

function maximumKeyColumnWidth(): number {
  return Math.max(
    MIN_KEY_COLUMN_WIDTH,
    editorWidth.value - PARAM_GRID_FIXED_WIDTH - MIN_VALUE_COLUMN_WIDTH,
  );
}

function updateEditorWidth(): void {
  editorWidth.value = paramEditor.value?.clientWidth ?? 0;
}

function removeParam(index: number): void {
  if (isFixedParam(index)) return;
  rowIds.value.splice(index, 1);
  emit("update", props.group.params
    .filter((_param, currentIndex) => currentIndex !== index)
    .map((param) => ({ ...param })));
}

function checkboxValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}

function updateDraftParam(
  field: ParamField,
  value: string,
  control: TextControl,
  isComposing: boolean,
  caretEnd: number,
): void {
  const promotedId = draftId.value;
  if (control.id !== `${editorId}-${promotedId}-${field}`) return;
  draftParam.value = { ...draftParam.value, [field]: value };
  if (draftParam.value.key === "" && draftParam.value.value === "") return;
  if (isComposing || composingDraftFields.has(field)) return;

  const promotedParam = draftParam.value;
  const caret = Math.min(Math.max(caretEnd, 0), value.length);
  rowIds.value.push(promotedId);
  draftId.value = crypto.randomUUID();
  draftParam.value = { key: "", value: "", enabled: true };
  emit("update", [...props.group.params.map((param) => ({ ...param })), promotedParam]);
  void restorePromotedDraftFocus(field, promotedId, caret);
}

function onDraftKeyInput(event: Event): void {
  const control = event.target;
  if (!(control instanceof HTMLInputElement)) return;
  updateDraftParam(
    "key",
    control.value,
    control,
    event instanceof InputEvent && event.isComposing,
    control.selectionEnd ?? control.value.length,
  );
}

function onDraftValueInput(event: Event): void {
  const control = event.target;
  if (!(control instanceof HTMLTextAreaElement)) return;
  updateDraftParam(
    "value",
    control.value,
    control,
    event instanceof InputEvent && event.isComposing,
    control.selectionEnd ?? control.value.length,
  );
}

function onDraftCompositionStart(field: ParamField): void {
  composingDraftFields.add(field);
}

function onDraftCompositionEnd(field: ParamField, event: CompositionEvent): void {
  composingDraftFields.delete(field);
  const control = event.target;
  if (!isTextControl(control)) return;
  updateDraftParam(
    field,
    control.value,
    control,
    false,
    control.selectionEnd ?? control.value.length,
  );
}

async function restorePromotedDraftFocus(
  field: ParamField,
  promotedId: string,
  caret: number,
): Promise<void> {
  await nextTick();
  if (!rowIds.value.includes(promotedId)) return;
  const control = document.getElementById(`${editorId}-${promotedId}-${field}`);
  if (!isTextControl(control) || control.getClientRects().length === 0) return;
  control.focus({ preventScroll: true });
  control.setSelectionRange(caret, caret);
}

function isTextControl(element: EventTarget | null): element is TextControl {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function onDragStart(event: DragEvent, index: number): void {
  if (isFixedParam(index)) {
    event.preventDefault();
    return;
  }
  draggedIndex.value = index;
  if (event.dataTransfer === null) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(index));
}

function onDragOver(event: DragEvent, index: number): void {
  if (draggedIndex.value === null) return;
  if (isFixedParam(index)) {
    dropTarget.value = null;
    return;
  }
  event.preventDefault();
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const bounds = row.getBoundingClientRect();
  const position: DropPosition = event.clientY < bounds.top + bounds.height / 2
    ? "before"
    : "after";
  dropTarget.value = { index, position };
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
}

function onDragLeave(event: DragEvent): void {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && row.contains(nextTarget)) return;
  dropTarget.value = null;
}

function stopDragging(): void {
  draggedIndex.value = null;
  dropTarget.value = null;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  const sourceIndex = draggedIndex.value;
  const target = dropTarget.value;
  stopDragging();
  if (sourceIndex === null || target === null) return;
  let insertionIndex = target.index + (target.position === "after" ? 1 : 0);
  if (sourceIndex < insertionIndex) insertionIndex -= 1;
  insertionIndex = Math.max(props.fixedParamCount, insertionIndex);
  if (sourceIndex === insertionIndex) return;
  const params = props.group.params.map((param) => ({ ...param }));
  const ids = [...rowIds.value];
  const param = params.splice(sourceIndex, 1)[0];
  const id = ids.splice(sourceIndex, 1)[0];
  if (param === undefined || id === undefined) return;
  params.splice(insertionIndex, 0, param);
  ids.splice(insertionIndex, 0, id);
  rowIds.value = ids;
  emit("update", params);
}

function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text/plain");
  if (text === undefined) return;
  const params = parseParamBatch(text);
  if (params === null) return;
  event.preventDefault();
  rowIds.value.push(...params.map(() => crypto.randomUUID()));
  emit("update", [
    ...props.group.params.map((param) => ({ ...param })),
    ...params,
  ]);
}

function parseParamBatch(text: string): TextEditParam[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.format !== "magichat-param-v1" || !Array.isArray(value.params)) return null;
  const params: TextEditParam[] = [];
  for (const param of value.params) {
    if (!isRecord(param) || typeof param.key !== "string" || typeof param.value !== "string") return null;
    if (param.enabled !== undefined && typeof param.enabled !== "boolean") return null;
    if (Object.keys(param).some((key) => key !== "key" && key !== "value" && key !== "enabled")) return null;
    params.push({ key: param.key, value: param.value, enabled: param.enabled ?? true });
  }
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inputValue(event: Event): string {
  return isTextControl(event.target) ? event.target.value : "";
}

function onParamKeyPaste(event: ClipboardEvent, index: number): void {
  if (!isFixedParam(index)) onPaste(event);
}

function isFixedParam(index: number): boolean {
  return index >= 0 && index < props.fixedParamCount;
}

defineExpose({
  removeParam,
});

</script>

<template>
  <section
    ref="paramEditor"
    class="param-editor"
    :aria-label="`${group.name} parameters`"
  >
    <SplitContainer
      class="param-editor__layout"
      orientation="vertical"
      :separator-labels="['Resize parameter key and value columns']"
      :is-disabled="props.readonly"
      @resize="resizeKeyColumn"
    >
      <div class="param-editor__keys" :style="keyPaneStyle">
        <div
          v-for="(param, index) in group.params"
          :key="rowIds[index]"
          class="param-row param-row--key"
          :style="paramRowStyle(rowIds[index] ?? '', param.value, keyErrors[index]?.length > 0)"
          :class="{
            'has-error': keyErrors[index]?.length > 0,
            'is-fixed': isFixedParam(index),
            'is-dragging': draggedIndex === index,
            'is-drop-before': dropTarget?.index === index && dropTarget.position === 'before',
            'is-drop-after': dropTarget?.index === index && dropTarget.position === 'after',
          }"
          @dragover="onDragOver($event, index)"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @contextmenu="openRowMenu($event, index)"
        >
          <label class="param-row__selection">
            <span class="sr-only">Enable parameter {{ index + 1 }}</span>
            <input
              type="checkbox"
              :checked="param.enabled"
              :disabled="props.readonly"
              :aria-label="`Enable parameter ${index + 1}`"
              :title="param.enabled ? 'Disable parameter' : 'Enable parameter'"
              @change="updateParam(index, 'enabled', checkboxValue($event))"
            />
          </label>
          <label class="param-row__field param-row__field--key">
            <span class="sr-only">Parameter {{ index + 1 }} key</span>
            <input
              :id="`${editorId}-${rowIds[index]}-key`"
              type="text"
              :value="param.key"
              :aria-invalid="keyErrors[index]?.length > 0"
              :aria-describedby="keyErrors[index] ? `param-error-${rowIds[index]}` : undefined"
              :readonly="props.readonly || isFixedParam(index)"
              :title="isFixedParam(index) ? 'Generated from script content' : undefined"
              placeholder="key"
              @input="updateParam(index, 'key', inputValue($event))"
              @paste="onParamKeyPaste($event, index)"
            />
            <span
              v-if="keyErrors[index]"
              :id="`param-error-${rowIds[index]}`"
              class="param-row__error"
              role="alert"
              :title="keyErrors[index]"
            >{{ keyErrors[index] }}</span>
          </label>
        </div>
        <div
          v-if="!props.readonly"
          :key="draftId"
          class="param-row param-row--key param-row--draft"
          :style="paramRowStyle(draftId, draftParam.value)"
        >
          <span class="param-row__draft-spacer" aria-hidden="true"></span>
          <label class="param-row__field param-row__field--key">
            <span class="sr-only">New parameter key</span>
            <input
              :id="`${editorId}-${draftId}-key`"
              type="text"
              :value="draftParam.key"
              placeholder="key"
              @input="onDraftKeyInput"
              @paste="onPaste"
              @compositionstart="onDraftCompositionStart('key')"
              @compositionend="onDraftCompositionEnd('key', $event)"
            />
          </label>
        </div>
      </div>

      <div class="param-editor__values">
        <div
          v-for="(param, index) in group.params"
          :key="rowIds[index]"
          class="param-row param-row--value"
          :style="paramRowStyle(rowIds[index] ?? '', param.value, keyErrors[index]?.length > 0)"
          :class="{
            'has-error': keyErrors[index]?.length > 0,
            'is-dragging': draggedIndex === index,
            'is-drop-before': dropTarget?.index === index && dropTarget.position === 'before',
            'is-drop-after': dropTarget?.index === index && dropTarget.position === 'after',
          }"
          @dragover="onDragOver($event, index)"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @contextmenu="openRowMenu($event, index)"
        >
          <label class="param-row__field param-row__field--value">
            <span class="sr-only">Parameter {{ index + 1 }} value</span>
            <MacroTextInput
              :id="`${editorId}-${rowIds[index]}-value`"
              :value="param.value"
              :macro-details="macroDetails"
              :readonly="props.readonly"
              :accessible-label="`Parameter ${index + 1} value`"
              placeholder="value"
              @height-change="updateValueLineCount(rowIds[index] ?? '', $event)"
              @input="updateParam(index, 'value', inputValue($event))"
              @paste="onPaste"
            />
          </label>
          <button
            v-if="!props.readonly && !isFixedParam(index)"
            type="button"
            class="param-row__drag"
            draggable="true"
            :aria-label="`Drag parameter ${index + 1}`"
            title="Drag to reorder or click for actions"
            @click="openRowMenu($event, index)"
            @dragstart="onDragStart($event, index)"
            @dragend="stopDragging"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="4" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="8" cy="12" r="1.25" />
            </svg>
          </button>
          <span v-else-if="!props.readonly" class="param-row__fixed-marker" title="Fixed script macro" aria-label="Fixed script macro">◆</span>
          <span v-else class="param-row__action-spacer" aria-hidden="true"></span>
        </div>
        <div
          v-if="!props.readonly"
          :key="draftId"
          class="param-row param-row--value param-row--draft"
          :style="paramRowStyle(draftId, draftParam.value)"
        >
          <label class="param-row__field param-row__field--value">
            <span class="sr-only">New parameter value</span>
            <MacroTextInput
              :id="`${editorId}-${draftId}-value`"
              :value="draftParam.value"
              :macro-details="macroDetails"
              accessible-label="New parameter value"
              placeholder="value"
              @height-change="updateValueLineCount(draftId, $event)"
              @input="onDraftValueInput"
              @paste="onPaste"
              @compositionstart="onDraftCompositionStart('value')"
              @compositionend="onDraftCompositionEnd('value', $event)"
            />
          </label>
          <span class="param-row__action-spacer" aria-hidden="true"></span>
        </div>
      </div>
    </SplitContainer>
    <Teleport to="body">
      <div
      :has-item-borders="false"
        v-if="rowMenu !== null"
        class="param-row-menu"
        :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
        role="menu"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button type="button" role="menuitem" @click="copyParam(rowMenu.index)">Copy</button>
        <button type="button" role="menuitem" @click="copyAll">Copy all</button>
        <button v-if="!isFixedParam(rowMenu.index)" type="button" class="is-danger" role="menuitem" @click="requestParamDelete(rowMenu.index)">Delete</button>
        <button v-if="group.params.length > fixedParamCount" type="button" class="is-danger" role="menuitem" @click="requestAllParamsDelete">Delete all</button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.param-editor {
  position: relative;
  min-height: 100%;
  min-width: 0;
  color: var(--color-text);
}

.param-editor::before {
  position: absolute;
  z-index: 5;
  inset-block: 0;
  left: 0;
  box-sizing: border-box;
  width: 44px;
  content: "";
  border-inline-end: 1px solid var(--color-border);
  pointer-events: none;
}

.param-editor button {
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  cursor: pointer;
}

.param-editor button:hover:not(:disabled) {
  background: var(--color-surface-raised);
  border-color: var(--color-text-muted);
}

.param-editor button:focus-visible,
.param-row input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.param-row input:not([type="checkbox"]):focus-visible {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-raised));
  outline: 0;
}

.param-editor button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.param-editor__layout {
  width: 100%;
  min-height: 100%;
  overflow: hidden;
}

.param-editor__keys,
.param-editor__values {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-block-start: 1px solid var(--color-border);
}

.param-editor__keys {
  min-width: 144px;
  flex: 1 1 0;
}

.param-editor__values {
  min-width: 184px;
  flex: 1 1 0;
}

.param-row {
  position: relative;
  display: grid;
  align-items: start;
  gap: 0;
  height: 38px;
  padding: var(--space-1);
  border: 0;
  border-block-end: 1px solid var(--color-border);
}

.param-row--key {
  grid-template-columns: 36px minmax(0, 1fr);
}

.param-row--value {
  grid-template-columns: minmax(140px, 1fr) 36px;
}

.param-row.is-dragging {
  opacity: 0.5;
}

.param-row.is-drop-before::before,
.param-row.is-drop-after::after {
  position: absolute;
  z-index: 4;
  right: 0;
  left: 0;
  height: 2px;
  content: "";
  background: var(--color-primary);
  pointer-events: none;
}

.param-row.is-drop-before::before {
  top: -1px;
}

.param-row.is-drop-after::after {
  bottom: -1px;
}

.param-row__selection,
.param-row__draft-spacer,
.param-row__fixed-marker,
.param-row__action-spacer {
  width: 36px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0 !important;
  color: var(--color-text-muted) !important;
  border-color: transparent !important;
}

.param-row__fixed-marker {
  color: var(--color-text-muted);
  font-size: 8px;
}

.param-row.is-fixed input[readonly] {
  color: var(--color-text-muted);
  cursor: default;
}

.param-editor .param-row__drag {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  justify-self: center;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
  border-radius: var(--radius-medium);
  cursor: grab !important;
  opacity: 0.72;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.param-editor .param-row__drag svg {
  width: 16px;
  height: 16px;
  display: block;
  fill: currentColor;
}

.param-editor .param-row__drag:hover:not(:disabled),
.param-editor .param-row__drag:focus-visible {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 24%, transparent);
  opacity: 1;
}

.param-editor .param-row__drag:active:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  cursor: grabbing !important;
}

.param-row__selection input {
  appearance: none;
  position: relative;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 72%, transparent);
  border-radius: var(--radius-small);
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.param-row__selection input:hover {
  border-color: var(--color-text);
}

.param-row__selection input:checked {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.param-row__selection input:checked::after {
  position: absolute;
  width: 7px;
  height: 4px;
  top: 3px;
  left: 3px;
  content: "";
  border-bottom: 2px solid var(--color-text-on-accent);
  border-left: 2px solid var(--color-text-on-accent);
  transform: rotate(-45deg);
}

.param-row__field {
  min-width: 0;
}

.param-row__field--key {
  padding-inline: var(--space-2) var(--space-1);
}

.param-row__field--value {
  height: 100%;
  padding-inline: var(--space-1);
}

.param-row input:not([type="checkbox"]) {
  width: 100%;
  height: 30px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
}

.param-row input:not([type="checkbox"]):hover:not(:focus-visible) {
  background: color-mix(in srgb, var(--color-surface-raised) 45%, transparent);
}

.param-row input:not([type="checkbox"])[aria-invalid="true"] {
  border-color: var(--color-danger);
}

.param-row--draft {
  border-block-end-color: color-mix(
    in srgb,
    var(--color-border) 64%,
    transparent
  );
}

.param-row--draft :is(input, .macro-input) {
  color: var(--color-text-muted);
}

.param-row__error {
  display: block;
  padding: var(--space-1) var(--space-2) 0;
  overflow: hidden;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.param-row-menu {
  position: fixed;
  z-index: 600;
  width: 160px;
  display: flex;
  flex-direction: column;
  padding: var(--space-1);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-popup);
}

.param-row-menu button {
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-medium);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.param-row-menu button:hover,
.param-row-menu button:focus-visible {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  outline: 0;
}

.param-row-menu button.is-danger {
  color: var(--color-danger);
}

</style>

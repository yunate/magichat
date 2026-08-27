<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
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
const composingDraftFields = new Set<ParamField>();
const editorId = `param-editor-${crypto.randomUUID()}`;
const DEFAULT_KEY_COLUMN_WIDTH = 360;
const keyColumnWidth = ref(DEFAULT_KEY_COLUMN_WIDTH);
const MIN_KEY_COLUMN_WIDTH = 100;
const MIN_VALUE_COLUMN_WIDTH = 140;
const PARAM_GRID_FIXED_WIDTH = 92;
const PARAM_KEY_COLUMN_START = 44;
const COLUMN_RESIZE_STEP = 16;
let columnResizeStart: Readonly<{ pointerX: number; width: number }> | null = null;
let previousColumnResizeCursor = "";
let previousColumnResizeUserSelect = "";

watch(() => props.group.id, () => {
  rowIds.value = props.group.params.map(() => crypto.randomUUID());
  draftId.value = crypto.randomUUID();
  draftParam.value = { key: "", value: "", enabled: true };
  composingDraftFields.clear();
});
watch(() => props.group.params.length, (length) => {
  while (rowIds.value.length < length) rowIds.value.push(crypto.randomUUID());
  rowIds.value.length = length;
});

const keyErrors = computed(() => props.group.params.map((_param, index) => {
  return getTextEditParamKeyError(props.group.params, index) ?? "";
}));
const paramEditorStyle = computed<CSSProperties>(() => ({
  "--param-key-column-width": `${keyColumnWidth.value}px`,
  "--param-column-splitter-left": `${PARAM_KEY_COLUMN_START + keyColumnWidth.value}px`,
}));

onMounted(() => {
  window.addEventListener("pointerdown", closeRowMenu);
  window.addEventListener("scroll", closeRowMenu, true);
  window.addEventListener("keydown", onWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", closeRowMenu);
  window.removeEventListener("scroll", closeRowMenu, true);
  window.removeEventListener("keydown", onWindowKeydown);
  stopColumnResize();
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
  const menuHeight = 104;
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

function startColumnResize(event: PointerEvent): void {
  if (props.readonly) return;
  if (event.button !== 0) return;
  event.preventDefault();
  columnResizeStart = { pointerX: event.clientX, width: keyColumnWidth.value };
  previousColumnResizeCursor = document.body.style.cursor;
  previousColumnResizeUserSelect = document.body.style.userSelect;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeKeyColumn);
  window.addEventListener("pointerup", stopColumnResize);
  window.addEventListener("pointercancel", stopColumnResize);
}

function resizeKeyColumn(event: PointerEvent): void {
  if (columnResizeStart === null) return;
  setKeyColumnWidth(columnResizeStart.width + event.clientX - columnResizeStart.pointerX);
}

function stopColumnResize(): void {
  if (columnResizeStart === null) return;
  columnResizeStart = null;
  document.body.style.cursor = previousColumnResizeCursor;
  document.body.style.userSelect = previousColumnResizeUserSelect;
  window.removeEventListener("pointermove", resizeKeyColumn);
  window.removeEventListener("pointerup", stopColumnResize);
  window.removeEventListener("pointercancel", stopColumnResize);
}

function resizeKeyColumnByKey(event: KeyboardEvent): void {
  const width = keyColumnWidth.value;
  let nextWidth: number;
  switch (event.key) {
    case "ArrowLeft": nextWidth = width - COLUMN_RESIZE_STEP; break;
    case "ArrowRight": nextWidth = width + COLUMN_RESIZE_STEP; break;
    case "Home": nextWidth = MIN_KEY_COLUMN_WIDTH; break;
    case "End": nextWidth = maximumKeyColumnWidth(); break;
    default: return;
  }
  event.preventDefault();
  setKeyColumnWidth(nextWidth);
}

function setKeyColumnWidth(width: number): void {
  keyColumnWidth.value = Math.round(Math.min(
    maximumKeyColumnWidth(),
    Math.max(MIN_KEY_COLUMN_WIDTH, width),
  ));
}

function maximumKeyColumnWidth(): number {
  const editorWidth = paramEditor.value?.clientWidth ?? 0;
  return Math.max(
    MIN_KEY_COLUMN_WIDTH,
    editorWidth - PARAM_GRID_FIXED_WIDTH - MIN_VALUE_COLUMN_WIDTH,
  );
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
  if (!(control instanceof HTMLInputElement)) return;
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
  if (!(control instanceof HTMLInputElement)) return;
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

function isTextControl(element: HTMLElement | null): element is TextControl {
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
  return event.target instanceof HTMLInputElement ? event.target.value : "";
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
    :style="paramEditorStyle"
    :aria-label="`${group.name} parameters`"
  >
    <button
      v-if="!props.readonly"
      type="button"
      class="param-editor__column-splitter"
      role="separator"
      aria-label="Resize parameter key and value columns"
      aria-orientation="vertical"
      :aria-valuemin="MIN_KEY_COLUMN_WIDTH"
      :aria-valuemax="maximumKeyColumnWidth()"
      :aria-valuenow="keyColumnWidth"
      @pointerdown="startColumnResize"
      @keydown="resizeKeyColumnByKey"
    ></button>
    <span
      v-else
      class="param-editor__column-divider"
      aria-hidden="true"
    ></span>
    <div class="param-editor__rows">
      <div
        v-for="(param, index) in group.params"
        :key="rowIds[index]"
        class="param-row"
        :class="{
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
        <label class="param-row__field">
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
          >{{ keyErrors[index] }}</span>
        </label>
        <label class="param-row__field">
          <span class="sr-only">Parameter {{ index + 1 }} value</span>
          <MacroTextInput
            :id="`${editorId}-${rowIds[index]}-value`"
            :value="param.value"
            :macro-details="macroDetails"
            :readonly="props.readonly"
            :accessible-label="`Parameter ${index + 1} value`"
            placeholder="value"
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
          title="Drag to reorder"
          @click="openRowMenu($event, index)"
          @dragstart="onDragStart($event, index)"
          @dragend="stopDragging"
        >⋮⋮</button>
        <span v-else-if="!props.readonly" class="param-row__fixed-marker" title="Fixed script macro" aria-label="Fixed script macro">◆</span>
        <span v-else aria-hidden="true"></span>
      </div>
      <div v-if="!props.readonly" :key="draftId" class="param-row param-row--draft">
        <span class="param-row__draft-spacer" aria-hidden="true"></span>
        <label class="param-row__field">
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
        <label class="param-row__field">
          <span class="sr-only">New parameter value</span>
          <MacroTextInput
            :id="`${editorId}-${draftId}-value`"
            :value="draftParam.value"
            :macro-details="macroDetails"
            accessible-label="New parameter value"
            placeholder="value"
            @input="onDraftValueInput"
            @paste="onPaste"
            @compositionstart="onDraftCompositionStart('value')"
            @compositionend="onDraftCompositionEnd('value', $event)"
          />
        </label>
        <span aria-hidden="true"></span>
      </div>
    </div>
    <Teleport to="body">
      <div
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
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.param-editor {
  position: relative;
  min-width: 0;
  color: var(--color-text);
}

.param-editor__column-splitter,
.param-editor__column-divider {
  position: absolute;
  z-index: 6;
  top: 0;
  bottom: 0;
  left: var(--param-column-splitter-left);
  width: 5px;
  min-height: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  touch-action: none;
}

.param-editor__column-splitter {
  cursor: col-resize !important;
}

.param-editor__column-splitter::before,
.param-editor__column-divider::before {
  position: absolute;
  inset-block: 0;
  left: 2px;
  width: 1px;
  content: "";
  background: var(--color-border);
}

.param-editor__column-splitter:hover::before,
.param-editor__column-splitter:focus-visible::before {
  left: 1px;
  width: 2px;
  background: var(--color-primary);
}

.param-editor__column-splitter:focus-visible {
  outline: 0;
}

.param-editor button {
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
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

.param-editor button.param-editor__column-splitter:focus-visible {
  outline: 0;
}

.param-row input:not([type="checkbox"]):focus-visible {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-raised));
  outline: 0;
}

.param-editor button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.param-editor__rows {
  display: flex;
  flex-direction: column;
}

.param-row {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(100px, var(--param-key-column-width, 2fr)) minmax(140px, 1fr) 36px;
  align-items: start;
  gap: var(--space-1);
  padding: var(--space-1);
  border-block-start: 1px solid color-mix(in srgb, var(--color-border) 64%, transparent);
}

.param-row:first-child {
  border-block-start: 0;
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

.param-row__drag,
.param-row__selection,
.param-row__fixed-marker {
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

.param-row__drag {
  cursor: grab !important;
  letter-spacing: -3px;
}

.param-row__selection input {
  appearance: none;
  position: relative;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 72%, transparent);
  border-radius: 3px;
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
  border-bottom: 2px solid #ffffff;
  border-left: 2px solid #ffffff;
  transform: rotate(-45deg);
}

.param-row__field {
  min-width: 0;
}

.param-row input:not([type="checkbox"]) {
  width: 100%;
  height: 30px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
}

.param-row input:not([type="checkbox"]):hover {
  background: color-mix(in srgb, var(--color-surface-raised) 45%, transparent);
}

.param-row input:not([type="checkbox"])[aria-invalid="true"] {
  border-color: var(--color-danger);
}

.param-row--draft {
  border-block-start-color: color-mix(in srgb, var(--color-border) 38%, transparent);
}

.param-row--draft :is(input, .macro-input) {
  color: var(--color-text-muted);
}

.param-row__error {
  display: block;
  padding: var(--space-1) var(--space-2) 0;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 1.3;
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
  border-radius: var(--radius-sm);
  box-shadow: 0 12px 32px rgb(0 0 0 / 36%);
}

.param-row-menu button {
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
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

@media (max-width: 560px) {
  .param-editor__column-splitter,
  .param-editor__column-divider {
    display: none;
  }

  .param-row {
    grid-template-columns: 36px minmax(0, 1fr) 36px;
  }

  .param-row__field:nth-of-type(2) {
    grid-column: 2;
  }
}
</style>

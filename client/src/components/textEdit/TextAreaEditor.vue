<script setup lang="ts">
import { watch } from "vue";
import MacroTextInput from "./MacroTextInput.vue";
import { TextAreaHistory, type TextAreaSnapshot } from "./textAreaHistory";
import { runTextAreaLineCommand, type TextAreaLineCommand } from "./textAreaLineCommands";
import type { MacroDisplayDetail } from "./textEditTypes";

type Props = {
  value: string;
  identity: string;
  macroDetails: ReadonlyMap<string, MacroDisplayDetail>;
  tabSize?: number;
  readonly?: boolean;
};

const props = withDefaults(defineProps<Props>(), { tabSize: 2, readonly: false });
const emit = defineEmits<{
  update: [value: string];
}>();

const LINE_CLIPBOARD_TYPE = "application/x-magichat-text-line";
const history = new TextAreaHistory();
let beforeInput: TextAreaSnapshot | null = null;
let beforeComposition: TextAreaSnapshot | null = null;
let isComposing = false;
let emittedValue: string | null = null;

watch(() => props.identity, resetHistory);
watch(() => props.value, (value) => {
  if (emittedValue === value) {
    emittedValue = null;
    return;
  }
  emittedValue = null;
  resetHistory();
});

function onBeforeInput(event: InputEvent): void {
  if (props.readonly) return;
  if (isComposing || event.isComposing || !(event.target instanceof HTMLTextAreaElement)) return;
  beforeInput = createSnapshot(event.target);
}

function onInput(event: Event): void {
  if (props.readonly) return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  if (!isComposing && beforeInput !== null) {
    history.record(beforeInput, createSnapshot(event.target));
    beforeInput = null;
  }
  emitValue(event.target.value);
}

function onCompositionStart(event: CompositionEvent): void {
  if (props.readonly) return;
  isComposing = true;
  beforeInput = null;
  beforeComposition = event.target instanceof HTMLTextAreaElement
    ? createSnapshot(event.target)
    : null;
}

function onCompositionEnd(event: CompositionEvent): void {
  if (props.readonly) return;
  isComposing = false;
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  if (beforeComposition !== null) history.record(beforeComposition, createSnapshot(event.target));
  beforeComposition = null;
  emitValue(event.target.value);
}

function onKeydown(event: KeyboardEvent): void {
  if (props.readonly) return;
  if (!(event.target instanceof HTMLTextAreaElement) || isComposing || event.isComposing) return;
  const control = event.target;
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "z" || key === "y") {
      const isRedo = key === "y" || key === "z" && event.shiftKey;
      event.preventDefault();
      const snapshot = isRedo ? history.redo() : history.undo();
      if (snapshot !== null) applySnapshot(control, snapshot);
      return;
    }
    if (key === "d" && control.selectionStart === control.selectionEnd) {
      event.preventDefault();
      applyLineCommand(control, "duplicate");
      return;
    }
  }
  if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  const before = createSnapshot(control);
  const spaces = " ".repeat(Math.max(0, Math.floor(props.tabSize)));
  control.setRangeText(spaces, control.selectionStart, control.selectionEnd, "end");
  const after = createSnapshot(control);
  history.record(before, after);
  emitValue(control.value);
}

function onCopy(event: ClipboardEvent): void {
  const control = event.target;
  if (!isWholeLineCommandAvailable(control)) return;
  const result = runTextAreaLineCommand(
    control.value,
    control.selectionStart,
    control.selectionEnd,
    "copy",
  );
  if (result === null || event.clipboardData === null) return;
  event.preventDefault();
  event.clipboardData.setData("text/plain", result.clipboardText ?? "");
  event.clipboardData.setData(LINE_CLIPBOARD_TYPE, "1");
}

function onCut(event: ClipboardEvent): void {
  if (props.readonly) return;
  const control = event.target;
  if (!isWholeLineCommandAvailable(control)) return;
  const result = runTextAreaLineCommand(
    control.value,
    control.selectionStart,
    control.selectionEnd,
    "cut",
  );
  if (result === null || event.clipboardData === null) return;
  event.preventDefault();
  event.clipboardData.setData("text/plain", result.clipboardText ?? "");
  event.clipboardData.setData(LINE_CLIPBOARD_TYPE, "1");
  applyLineResult(control, result);
}

function onPaste(event: ClipboardEvent): void {
  if (props.readonly) return;
  const control = event.target;
  if (!isWholeLineCommandAvailable(control) || event.clipboardData === null) return;
  if (!Array.from(event.clipboardData.types).some((type) => type.toLowerCase() === LINE_CLIPBOARD_TYPE)) return;
  const result = runTextAreaLineCommand(
    control.value,
    control.selectionStart,
    control.selectionEnd,
    "paste",
    event.clipboardData.getData("text/plain"),
  );
  if (result === null) return;
  event.preventDefault();
  applyLineResult(control, result);
}

function applyLineCommand(control: HTMLTextAreaElement, command: TextAreaLineCommand): void {
  const result = runTextAreaLineCommand(
    control.value,
    control.selectionStart,
    control.selectionEnd,
    command,
  );
  if (result !== null) applyLineResult(control, result);
}

function applyLineResult(
  control: HTMLTextAreaElement,
  result: Readonly<{ value: string; selectionStart: number; selectionEnd: number }>,
): void {
  const before = createSnapshot(control);
  const after: TextAreaSnapshot = {
    value: result.value,
    selectionStart: result.selectionStart,
    selectionEnd: result.selectionEnd,
  };
  history.record(before, after);
  applySnapshot(control, after);
}

function applySnapshot(control: HTMLTextAreaElement, snapshot: TextAreaSnapshot): void {
  control.value = snapshot.value;
  control.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  emitValue(snapshot.value);
}

function createSnapshot(control: HTMLTextAreaElement): TextAreaSnapshot {
  return {
    value: control.value,
    selectionStart: control.selectionStart,
    selectionEnd: control.selectionEnd,
  };
}

function isWholeLineCommandAvailable(target: EventTarget | null): target is HTMLTextAreaElement {
  return !isComposing
    && target instanceof HTMLTextAreaElement
    && target.selectionStart === target.selectionEnd;
}

function emitValue(value: string): void {
  emittedValue = value;
  emit("update", value);
}

function resetHistory(): void {
  history.reset();
  beforeInput = null;
  beforeComposition = null;
  isComposing = false;
}
</script>

<template>
  <MacroTextInput
    :id="`text-area-${identity}`"
    class="text-area-editor"
    :value="value"
    :macro-details="macroDetails"
    multiline
    line-numbers
    show-whitespace
    :readonly="readonly"
    accessible-label="Script content"
    @beforeinput="onBeforeInput"
    @input="onInput"
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
    @keydown="onKeydown"
    @copy="onCopy"
    @cut="onCut"
    @paste="onPaste"
  />
</template>

<style scoped>
.text-area-editor {
  width: 100%;
  min-height: 120px;
  flex: 1;
  background: var(--color-content-bg);
}
</style>

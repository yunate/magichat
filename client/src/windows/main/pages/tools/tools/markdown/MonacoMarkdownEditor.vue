<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import { monaco, applyMonacoTheme } from "../../../../../../components/textEdit/monacoRuntime";
import { registerThemeChangeHandler } from "../../../../themes/theme";

type SelectionTransform = Readonly<{
  before: string;
  after: string;
  placeholder: string;
}>;

const props = defineProps<{ value: string }>();
const emit = defineEmits<{
  update: [value: string];
  scroll: [sourceLine: number];
}>();
const container = useTemplateRef<HTMLDivElement>("container");
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let resizeObserver: ResizeObserver | null = null;
let unregisterThemeChangeHandler: (() => void) | null = null;
let isApplyingExternalValue = false;
let isApplyingScroll = false;

watch(() => props.value, updateExternalValue);

onMounted(() => {
  const editorContainer = container.value;
  if (editorContainer === null) throw new Error("Markdown editor container is unavailable.");
  applyMonacoTheme();
  model = monaco.editor.createModel(props.value, "markdown");
  editor = monaco.editor.create(editorContainer, {
    model,
    automaticLayout: false,
    ariaLabel: "Markdown editor",
    contextmenu: true,
    fixedOverflowWidgets: true,
    folding: true,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    glyphMargin: false,
    insertSpaces: true,
    lineDecorationsWidth: 10,
    lineHeight: 22,
    lineNumbers: "on",
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: "all",
    roundedSelection: false,
    scrollBeyondLastLine: true,
    scrollbar: {
      horizontalScrollbarSize: 8,
      useShadows: false,
      verticalScrollbarSize: 8,
    },
    showFoldingControls: "mouseover",
    tabSize: 2,
    wordWrap: "on",
  });
  editor.onDidChangeModelContent(() => {
    if (!isApplyingExternalValue && model !== null) emit("update", model.getValue());
  });
  editor.onDidScrollChange(() => {
    if (isApplyingScroll || editor === null) return;
    emit("scroll", getTopSourceLine(editor));
  });
  resizeObserver = new ResizeObserver(() => editor?.layout());
  resizeObserver.observe(editorContainer);
  unregisterThemeChangeHandler = registerThemeChangeHandler(applyMonacoTheme);
});

onUnmounted(() => {
  unregisterThemeChangeHandler?.();
  resizeObserver?.disconnect();
  editor?.dispose();
  model?.dispose();
  unregisterThemeChangeHandler = null;
  resizeObserver = null;
  editor = null;
  model = null;
});

function updateExternalValue(value: string): void {
  if (model === null || model.getValue() === value) return;
  isApplyingExternalValue = true;
  try {
    model.setValue(value);
  } finally {
    isApplyingExternalValue = false;
  }
}

function undo(): void {
  editor?.trigger("toolbar", "undo", null);
  editor?.focus();
}

function redo(): void {
  editor?.trigger("toolbar", "redo", null);
  editor?.focus();
}

function transformSelection(transform: SelectionTransform): void {
  const currentEditor = editor;
  const currentModel = model;
  const selection = currentEditor?.getSelection();
  if (currentEditor === null || currentEditor === undefined || currentModel === null
    || selection === null || selection === undefined) return;
  const selected = currentModel.getValueInRange(selection) || transform.placeholder;
  const selectionStart = currentModel.getOffsetAt(selection.getStartPosition());
  applyEdit(
    selection,
    `${transform.before}${selected}${transform.after}`,
    selectionStart + transform.before.length,
    selectionStart + transform.before.length + selected.length,
  );
}

function prefixSelectedLines(prefix: string, ordered = false): void {
  const currentEditor = editor;
  const currentModel = model;
  const selection = currentEditor?.getSelection();
  if (currentEditor === null || currentEditor === undefined || currentModel === null
    || selection === null || selection === undefined) return;
  const startLine = selection.startLineNumber;
  const endLine = selection.endColumn === 1 && selection.endLineNumber > startLine
    ? selection.endLineNumber - 1
    : selection.endLineNumber;
  const range = new monaco.Range(startLine, 1, endLine, currentModel.getLineMaxColumn(endLine));
  const replacement = currentModel.getValueInRange(range)
    .split("\n")
    .map((line, index) => `${ordered ? `${index + 1}. ` : prefix}${line}`)
    .join("\n");
  const startOffset = currentModel.getOffsetAt(range.getStartPosition());
  applyEdit(range, replacement, startOffset, startOffset + replacement.length);
}

function setHeading(level: 1 | 2 | 3): void {
  const currentEditor = editor;
  const currentModel = model;
  const selection = currentEditor?.getSelection();
  if (currentEditor === null || currentEditor === undefined || currentModel === null
    || selection === null || selection === undefined) return;
  const lineNumber = selection.startLineNumber;
  const content = currentModel.getLineContent(lineNumber).replace(/^#{1,6}\s+/, "");
  const replacement = `${"#".repeat(level)} ${content || "Heading"}`;
  const range = new monaco.Range(lineNumber, 1, lineNumber, currentModel.getLineMaxColumn(lineNumber));
  const startOffset = currentModel.getOffsetAt(range.getStartPosition());
  applyEdit(range, replacement, startOffset + level + 1, startOffset + replacement.length);
}

function insertBlock(value: string): void {
  const currentEditor = editor;
  const currentModel = model;
  const selection = currentEditor?.getSelection();
  if (currentEditor === null || currentEditor === undefined || currentModel === null
    || selection === null || selection === undefined) return;
  const from = currentModel.getOffsetAt(selection.getStartPosition());
  const to = currentModel.getOffsetAt(selection.getEndPosition());
  const source = currentModel.getValue();
  const leadingBreak = from > 0 && source[from - 1] !== "\n" ? "\n" : "";
  const trailingBreak = to < source.length && source[to] !== "\n" ? "\n" : "";
  const replacement = `${leadingBreak}${value}${trailingBreak}`;
  applyEdit(selection, replacement, from + leadingBreak.length, from + leadingBreak.length + value.length);
}

function clearFormatting(): void {
  const currentEditor = editor;
  const currentModel = model;
  const selection = currentEditor?.getSelection();
  if (currentEditor === null || currentEditor === undefined || currentModel === null
    || selection === null || selection === undefined || selection.isEmpty()) return;
  const replacement = currentModel.getValueInRange(selection)
    .replace(/^(?:#{1,6}|>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`|\*|_)/g, "");
  const startOffset = currentModel.getOffsetAt(selection.getStartPosition());
  applyEdit(selection, replacement, startOffset, startOffset + replacement.length);
}

function applyEdit(range: monaco.IRange, text: string, selectionFrom: number, selectionTo: number): void {
  const currentEditor = editor;
  const currentModel = model;
  if (currentEditor === null || currentModel === null) return;
  currentEditor.executeEdits("markdown-toolbar", [{ range, text, forceMoveMarkers: true }]);
  currentEditor.setSelection(monaco.Selection.fromPositions(
    currentModel.getPositionAt(selectionFrom),
    currentModel.getPositionAt(selectionTo),
  ));
  currentEditor.revealPositionInCenterIfOutsideViewport(currentModel.getPositionAt(selectionTo));
  currentEditor.focus();
}

function getTopSourceLine(currentEditor: monaco.editor.IStandaloneCodeEditor): number {
  const currentModel = model;
  if (currentModel === null) return 1;
  const visibleLine = currentEditor.getVisibleRanges()[0]?.startLineNumber ?? 1;
  const lineTop = currentEditor.getTopForLineNumber(visibleLine);
  const nextLineTop = visibleLine < currentModel.getLineCount()
    ? currentEditor.getTopForLineNumber(visibleLine + 1)
    : lineTop + currentEditor.getOption(monaco.editor.EditorOption.lineHeight);
  const progress = Math.max(0, Math.min(
    1,
    (currentEditor.getScrollTop() - lineTop) / Math.max(1, nextLineTop - lineTop),
  ));
  return visibleLine + progress;
}

function setTopSourceLine(sourceLine: number): void {
  const currentEditor = editor;
  const currentModel = model;
  if (currentEditor === null || currentModel === null) return;
  const boundedLine = Math.max(1, Math.min(currentModel.getLineCount(), sourceLine));
  const lineNumber = Math.floor(boundedLine);
  const progress = boundedLine - lineNumber;
  const lineTop = currentEditor.getTopForLineNumber(lineNumber);
  const nextLineTop = lineNumber < currentModel.getLineCount()
    ? currentEditor.getTopForLineNumber(lineNumber + 1)
    : lineTop;
  isApplyingScroll = true;
  currentEditor.setScrollTop(lineTop + progress * (nextLineTop - lineTop));
  requestAnimationFrame(() => { isApplyingScroll = false; });
}

defineExpose({
  clearFormatting,
  insertBlock,
  prefixSelectedLines,
  redo,
  setHeading,
  setTopSourceLine,
  transformSelection,
  undo,
});
</script>

<template>
  <div ref="container" class="markdown-editor"></div>
</template>

<style scoped>
.markdown-editor {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.markdown-editor:focus-within {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 48%, transparent);
}

.markdown-editor :deep(.monaco-scrollable-element > .scrollbar > .slider) {
  background-clip: padding-box !important;
  border: 2px solid transparent;
  border-radius: var(--radius-large);
}

.markdown-editor :deep(.find-widget > .button.codicon-widget-close) {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
}
</style>
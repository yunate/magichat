<script setup lang="ts">
import { MacroParser } from "../../../../common/macroParser";
import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";
import { registerThemeChangeHandler } from "../../windows/main/themes/theme";
import MacroPopup from "./MacroPopup.vue";
import {
  applyMonacoTheme,
  getMonacoLanguage,
  monaco,
} from "./monacoRuntime";
import { getScriptLanguageCompletions } from "./scriptLanguageCompletions";
import type {
  MacroAnalysis,
  MacroDisplayDetail,
  TextEditCompletion,
  TextEditCompletionProvider,
} from "./textEditTypes";

type Props = {
  value: string;
  identity: string;
  macroAnalysis: MacroAnalysis | null;
  ensureMacroAnalysis: () => MacroAnalysis;
  scriptType?: ScriptType;
  getCompletions?: TextEditCompletionProvider;
  tabSize?: number;
  readonly?: boolean;
};

const props = withDefaults(defineProps<Props>(), { tabSize: 2, readonly: false });
const emit = defineEmits<{
  update: [value: string];
}>();

const editorContainer = useTemplateRef<HTMLDivElement>("editorContainer");
const hoveredMacroDetail = shallowRef<MacroDisplayDetail | null>(null);
const hoveredMacroAnchor = shallowRef<DOMRect | null>(null);
const isMacroHovered = shallowRef(false);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let resizeObserver: ResizeObserver | null = null;
let unregisterThemeChangeHandler: (() => void) | null = null;
let macroDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let completionDisposable: monaco.IDisposable | null = null;
let isApplyingExternalValue = false;
let hoveredMacroStart: number | null = null;

watch(() => props.value, updateExternalValue);
watch(() => props.identity, replaceModel);
watch(() => props.scriptType, updateLanguage);
watch(() => props.readonly, updateEditorOptions);
watch(() => props.tabSize, updateModelOptions);
watch(() => props.macroAnalysis, updateMacroDecorations);

onMounted(() => {
  const container = editorContainer.value;
  if (container === null) throw new Error("Monaco editor container is unavailable.");

  applyMonacoTheme();
  model = createModel();
  editor = monaco.editor.create(container, {
    model,
    automaticLayout: false,
    readOnly: props.readonly,
    ariaLabel: "Script content",
    contextmenu: true,
    fixedOverflowWidgets: true,
    folding: true,
    foldingStrategy: "auto",
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    glyphMargin: false,
    insertSpaces: true,
    lineDecorationsWidth: 10,
    lineHeight: 20,
    lineNumbers: "on",
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    hover: { enabled: "on" },
    renderLineHighlight: "all",
    renderWhitespace: "all",
    roundedSelection: false,
    scrollBeyondLastLine: true,
    scrollbar: {
      horizontalScrollbarSize: 8,
      useShadows: false,
      verticalScrollbarSize: 8,
    },
    showFoldingControls: "mouseover",
    tabSize: props.tabSize,
    wordBasedSuggestions: "currentDocument",
    wordWrap: "off",
  });
  completionDisposable = registerCompletionProvider(model);
  editor.onDidChangeModelContent(() => {
    closeMacroPopup();
    if (!isApplyingExternalValue && model !== null) emit("update", model.getValue());
  });
  macroDecorations = editor.createDecorationsCollection();
  editor.onMouseMove(onEditorMouseMove);
  editor.onMouseLeave(leaveMacro);
  editor.onDidScrollChange(closeMacroPopup);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
    const selection = editor?.getSelection();
    if (selection === null || selection === undefined) return;
    const command = selection.isEmpty()
      ? "editor.action.copyLinesDownAction"
      : "editor.action.addSelectionToNextFindMatch";
    editor?.trigger("keyboard", command, null);
  });
  container.addEventListener("mouseover", suppressFindButtonTooltips, true);
  resizeObserver = new ResizeObserver(() => editor?.layout());
  resizeObserver.observe(container);
  unregisterThemeChangeHandler = registerThemeChangeHandler(applyMonacoTheme);
});

onUnmounted(() => {
  editorContainer.value?.removeEventListener("mouseover", suppressFindButtonTooltips, true);
  unregisterThemeChangeHandler?.();
  resizeObserver?.disconnect();
  macroDecorations?.clear();
  completionDisposable?.dispose();
  editor?.dispose();
  model?.dispose();
  unregisterThemeChangeHandler = null;
  resizeObserver = null;
  macroDecorations = null;
  completionDisposable = null;
  editor = null;
  model = null;
});

function createModel(): monaco.editor.ITextModel {
  const nextModel = monaco.editor.createModel(props.value, getMonacoLanguage(props.scriptType));
  nextModel.updateOptions({ insertSpaces: true, tabSize: props.tabSize });
  return nextModel;
}

function replaceModel(): void {
  if (editor === null) return;
  const previousModel = model;
  completionDisposable?.dispose();
  model = createModel();
  editor.setModel(model);
  completionDisposable = registerCompletionProvider(model);
  previousModel?.dispose();
  updateMacroDecorations();
}

function updateExternalValue(value: string): void {
  if (model === null || model.getValue() === value) return;
  isApplyingExternalValue = true;
  try {
    model.setValue(value);
  } finally {
    isApplyingExternalValue = false;
  }
}

function updateLanguage(): void {
  if (model !== null) monaco.editor.setModelLanguage(model, getMonacoLanguage(props.scriptType));
}

function updateEditorOptions(): void {
  editor?.updateOptions({ readOnly: props.readonly });
}

function updateModelOptions(): void {
  model?.updateOptions({ insertSpaces: true, tabSize: props.tabSize });
}

function registerCompletionProvider(
  completionModel: monaco.editor.ITextModel,
): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider("*", {
    triggerCharacters: ["{", ".", "-"],
    provideCompletionItems(currentModel, position) {
      if (currentModel !== completionModel || props.readonly) return { suggestions: [] };
      const linePrefix = currentModel.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const match = /mh\{\s*([A-Za-z0-9_.-]*)$/u.exec(linePrefix);
      const partialKey = match?.[1];
      if (partialKey === undefined) {
        return { suggestions: createCompletionSuggestions(currentModel, position, linePrefix) };
      }
      const startColumn = position.column - partialKey.length;
      const hasClosingBrace = currentModel.getLineContent(position.lineNumber)[position.column - 1] === "}";
      const range = new monaco.Range(
        position.lineNumber,
        startColumn,
        position.lineNumber,
        position.column,
      );
      const details = [...props.ensureMacroAnalysis().details.values()]
        .sort((left, right) => left.key.localeCompare(right.key));
      return {
        suggestions: details.map((detail) => ({
          label: detail.key,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: `${detail.sourceType}: ${detail.sourcePath}`,
          documentation: detail.successful ? detail.value : detail.error ?? "Macro resolution failed",
          insertText: hasClosingBrace ? detail.key : `${detail.key}}`,
          range,
        })),
      };
    },
  });
}

function createCompletionSuggestions(
  currentModel: monaco.editor.ITextModel,
  position: monaco.Position,
  linePrefix: string,
): monaco.languages.CompletionItem[] {
  const word = currentModel.getWordUntilPosition(position);
  const context = { linePrefix, word: word.word };
  const range = new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn,
  );
  return [
    ...(props.getCompletions?.(context) ?? []).map((completion) => createCompletionItem(completion, range)),
    ...getScriptLanguageCompletions(props.scriptType, context).map((completion) => createCompletionItem(
      completion,
      new monaco.Range(position.lineNumber, position.column - completion.prefixLength, position.lineNumber, word.endColumn),
    )),
  ];
}

function createCompletionItem(
  completion: TextEditCompletion,
  range: monaco.Range,
): monaco.languages.CompletionItem {
  return {
    label: completion.label,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: completion.detail,
    documentation: completion.documentation,
    insertText: completion.insertText,
    insertTextRules: completion.isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : monaco.languages.CompletionItemInsertTextRule.None,
    range,
  };
}

function suppressFindButtonTooltips(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".find-widget .button, .find-widget .monaco-custom-toggle") !== null) {
    event.stopImmediatePropagation();
  }
}

function updateMacroDecorations(): void {
  const currentModel = model;
  const analysis = props.macroAnalysis;
  if (currentModel === null || macroDecorations === null || analysis === null) {
    macroDecorations?.clear();
    return;
  }
  macroDecorations.set(analysis.references.map((reference) => ({
    range: monaco.Range.fromPositions(
      currentModel.getPositionAt(reference.start),
      currentModel.getPositionAt(reference.end),
    ),
    options: {
      inlineClassName: analysis.details.get(reference.key)?.successful === true
        ? "text-area-editor__macro"
        : "text-area-editor__macro-warning",
    },
  })));
}

function onEditorMouseMove(event: monaco.editor.IEditorMouseEvent): void {
  const currentModel = model;
  const position = event.target.position;
  if (currentModel === null || position === null) {
    leaveMacro();
    return;
  }
  const analysis = props.ensureMacroAnalysis();
  const offset = currentModel.getOffsetAt(position);
  const reference = analysis.references.find((candidate) => (
    candidate.start <= offset && offset < candidate.end
  ));
  if (reference === undefined) {
    leaveMacro();
    return;
  }
  isMacroHovered.value = true;
  if (hoveredMacroStart === reference.start) return;
  hoveredMacroStart = reference.start;
  hoveredMacroDetail.value = createMacroDetail(analysis, reference);
  hoveredMacroAnchor.value = createMacroAnchor(currentModel, reference, event);
}

function createMacroAnchor(
  currentModel: monaco.editor.ITextModel,
  reference: MacroAnalysis["references"][number],
  event: monaco.editor.IEditorMouseEvent,
): DOMRect {
  const containerBounds = editorContainer.value?.getBoundingClientRect();
  const visiblePosition = editor?.getScrolledVisiblePosition(
    currentModel.getPositionAt(reference.start),
  );
  if (containerBounds !== undefined && visiblePosition !== null && visiblePosition !== undefined) {
    return new DOMRect(
      containerBounds.left + visiblePosition.left,
      containerBounds.top + visiblePosition.top,
      1,
      visiblePosition.height,
    );
  }
  return new DOMRect(event.event.browserEvent.clientX, event.event.browserEvent.clientY, 1, 1);
}

function createMacroDetail(
  analysis: MacroAnalysis,
  reference: MacroAnalysis["references"][number],
): MacroDisplayDetail {
  const detail = analysis.details.get(reference.key);
  return detail ?? {
    key: reference.key,
    sourceType: "Unresolved",
    sourcePath: "No matching parameter",
    value: MacroParser.formatReference(reference.key),
    successful: false,
    error: `Unknown macro "${reference.key}"`,
  };
}

function leaveMacro(): void {
  isMacroHovered.value = false;
}

function closeMacroPopup(): void {
  isMacroHovered.value = false;
  hoveredMacroStart = null;
  hoveredMacroDetail.value = null;
  hoveredMacroAnchor.value = null;
}
</script>

<template>
  <section class="text-area-editor">
    <div ref="editorContainer" class="text-area-editor__monaco"></div>
    <Teleport to="body">
      <MacroPopup
        v-if="hoveredMacroDetail !== null && hoveredMacroAnchor !== null"
        :detail="hoveredMacroDetail"
        :anchor="hoveredMacroAnchor"
        :is-anchor-hovered="isMacroHovered"
        @close="closeMacroPopup"
      />
    </Teleport>
  </section>
</template>

<style scoped>
.text-area-editor {
  position: relative;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex: 1 1 0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px transparent;
}

.text-area-editor:focus-within {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 48%, transparent);
}

.text-area-editor__monaco {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.text-area-editor__monaco :deep(.monaco-scrollable-element > .scrollbar > .slider) {
  background-clip: padding-box !important;
  border: 2px solid transparent;
  border-radius: var(--radius-large);
}

.text-area-editor__monaco :deep(.find-widget > .button.codicon-widget-close) {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
}

:global(.text-area-editor__macro) {
  color: var(--color-code-variable) !important;
  font-weight: 600;
}

:global(.text-area-editor__macro-warning) {
  color: var(--color-warning) !important;
  text-decoration: wavy underline var(--color-warning);
  text-underline-offset: 2px;
}
</style>

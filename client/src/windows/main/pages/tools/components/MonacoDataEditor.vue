<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import { monaco, applyMonacoTheme } from "../../../../../components/textEdit/monacoRuntime";
import { registerThemeChangeHandler } from "../../../themes/theme";

export type DataEditorLanguage = "json" | "plaintext";

type Props = {
  value: string;
  language: DataEditorLanguage;
  editorLabel: string;
  placeholder?: string;
  readonly?: boolean;
  isError?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  placeholder: "",
  readonly: false,
  isError: false,
});
const emit = defineEmits<{ update: [value: string] }>();
const container = useTemplateRef<HTMLDivElement>("container");
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let resizeObserver: ResizeObserver | null = null;
let unregisterThemeChangeHandler: (() => void) | null = null;
let isApplyingExternalValue = false;

watch(() => props.value, updateExternalValue);
watch(() => props.language, updateLanguage);

onMounted(() => {
  const editorContainer = container.value;
  if (editorContainer === null) throw new Error("Data editor container is unavailable.");
  applyMonacoTheme();
  model = monaco.editor.createModel(props.value, props.language);
  editor = monaco.editor.create(editorContainer, {
    model,
    automaticLayout: false,
    readOnly: props.readonly,
    ariaLabel: props.editorLabel,
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
    padding: { top: 12, bottom: 12 },
    placeholder: props.placeholder,
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
    wordWrap: props.isError ? "on" : "off",
  });
  editor.onDidChangeModelContent(() => {
    if (!isApplyingExternalValue && model !== null) emit("update", model.getValue());
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

function updateLanguage(language: DataEditorLanguage): void {
  if (model !== null) monaco.editor.setModelLanguage(model, language);
}
</script>

<template>
  <div
    ref="container"
    class="data-editor"
    :class="{ 'is-error': isError }"
  ></div>
</template>

<style scoped>
.data-editor {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.data-editor:focus-within {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 48%, transparent);
}

.data-editor.is-error {
  color: var(--color-danger);
}

.data-editor :deep(.monaco-scrollable-element > .scrollbar > .slider) {
  background-clip: padding-box !important;
  border: 2px solid transparent;
  border-radius: var(--radius-large);
}

.data-editor :deep(.find-widget > .button.codicon-widget-close) {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
}
</style>
<script setup lang="ts">
import { computed, ref } from "vue";
import MonacoDataEditor, { type DataEditorLanguage } from "../../components/MonacoDataEditor.vue";
import DataTransformLayout from "../../components/DataTransformLayout.vue";
import { transformYaml, type YamlMode } from "./yaml";

const DEFAULT_JSON = '{"name":"magichat","tools":["yaml","qr"],"version":1,"nested":{"ok":true}}';
const DEFAULT_YAML = "name: magichat\ntools:\n  - yaml\n  - qr\nversion: 1\nnested:\n  ok: true\n";

const mode = ref<YamlMode>("toYaml");
const input = ref(DEFAULT_JSON);
const copied = ref(false);

const result = computed(() => transformYaml(input.value, mode.value));
const output = computed(() => (result.value.ok ? result.value.text : result.value.error));
const inputLanguage = computed<DataEditorLanguage>(() => mode.value === "toYaml" ? "json" : "plaintext");
const outputLanguage = computed<DataEditorLanguage>(() => {
  if (!result.value.ok) return "plaintext";
  return mode.value === "toYaml" ? "plaintext" : "json";
});

function setMode(next: YamlMode): void {
  if (mode.value === next) return;
  mode.value = next;
  input.value = next === "toYaml" ? DEFAULT_JSON : DEFAULT_YAML;
  copied.value = false;
}

async function copyResult(): Promise<void> {
  if (!result.value.ok || result.value.text === "") return;
  try {
    await navigator.clipboard.writeText(result.value.text);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <DataTransformLayout
    title="YAML"
    hint="Convert between JSON and YAML with js-yaml safe parsing. Parse errors are shown in the output."
    left-label="Input"
    right-label="Output"
    separator-label="Resize conversion input and output"
  >
    <template #toolbar>
      <div class="yaml-tool__modes" role="group" aria-label="Conversion direction">
        <button
          type="button"
          class="yaml-tool__mode"
          :class="{ 'yaml-tool__mode--active': mode === 'toYaml' }"
          @click="setMode('toYaml')"
        >
          JSON → YAML
        </button>
        <button
          type="button"
          class="yaml-tool__mode"
          :class="{ 'yaml-tool__mode--active': mode === 'toJson' }"
          @click="setMode('toJson')"
        >
          YAML → JSON
        </button>
      </div>
    </template>
    <template #left>
      <MonacoDataEditor
        :value="input"
        :language="inputLanguage"
        editor-label="Conversion input"
        placeholder="Enter content here..."
        @update="input = $event"
      />
    </template>
    <template #rightActions>
      <button
        type="button"
        class="yaml-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </template>
    <template #right>
      <MonacoDataEditor
        :value="output"
        :language="outputLanguage"
        editor-label="Conversion output"
        readonly
        :is-error="!result.ok"
      />
    </template>
  </DataTransformLayout>
</template>

<style scoped>
.yaml-tool__modes {
  display: inline-flex;
  gap: var(--space-1);
}

.yaml-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.yaml-tool__mode:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.yaml-tool__mode--active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-surface);
}

.yaml-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.yaml-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.yaml-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

</style>

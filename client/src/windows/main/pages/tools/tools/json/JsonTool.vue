<script setup lang="ts">
import { computed, ref } from "vue";
import MonacoDataEditor from "../../components/MonacoDataEditor.vue";
import DataTransformLayout from "../../components/DataTransformLayout.vue";
import { transformJson, type JsonMode } from "./json";

const DEFAULT_JSON = '{"name":"magichat","tools":["json","url","hash"],"version":1,"nested":{"ok":true}}';

const mode = ref<JsonMode>("format");
const input = ref(DEFAULT_JSON);
const copied = ref(false);

const result = computed(() => transformJson(input.value, mode.value));
const output = computed(() => (result.value.ok ? result.value.text : result.value.error));

function setMode(next: JsonMode): void {
  mode.value = next;
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
    title="JSON"
    hint="Enter JSON on the left to format or minify it live. Parse errors include their location."
    left-label="Input"
    right-label="Output"
    separator-label="Resize JSON input and output"
  >
    <template #toolbar>
      <div class="json-tool__modes" role="group" aria-label="Mode">
        <button
          type="button"
          class="json-tool__mode"
          :class="{ 'json-tool__mode--active': mode === 'format' }"
          @click="setMode('format')"
        >
          Format
        </button>
        <button
          type="button"
          class="json-tool__mode"
          :class="{ 'json-tool__mode--active': mode === 'minify' }"
          @click="setMode('minify')"
        >
          Minify
        </button>
      </div>
    </template>
    <template #left>
      <MonacoDataEditor
        :value="input"
        language="json"
        editor-label="JSON input"
        placeholder="Enter JSON here..."
        @update="input = $event"
      />
    </template>
    <template #rightActions>
      <button
        type="button"
        class="json-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </template>
    <template #right>
      <MonacoDataEditor
        :value="output"
        :language="result.ok ? 'json' : 'plaintext'"
        editor-label="JSON output"
        readonly
        :is-error="!result.ok"
      />
    </template>
  </DataTransformLayout>
</template>

<style scoped>
.json-tool__modes {
  display: inline-flex;
  gap: var(--space-1);
}

.json-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.json-tool__mode:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.json-tool__mode--active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-surface);
}

.json-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.json-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.json-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

</style>

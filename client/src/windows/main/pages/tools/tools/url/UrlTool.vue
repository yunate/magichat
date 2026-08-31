<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { transformUrl, type UrlMode } from "./url";

const DEFAULT_TEXT = "https://example.com/search?q=hello world&tag=a+b";

const mode = ref<UrlMode>("encode");
const input = ref(DEFAULT_TEXT);
const copied = ref(false);

const inputLabel = computed(() => (mode.value === "encode" ? "Plain Text" : "Encoded Text"));
const outputLabel = computed(() => (mode.value === "encode" ? "Encoded Text" : "Plain Text"));
const result = computed(() => transformUrl(input.value, mode.value));
const output = computed(() => (result.value.ok ? result.value.text : result.value.error));

function toggleMode(): void {
  mode.value = mode.value === "encode" ? "decode" : "encode";
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
  <ToolSplitLayout
    title="URL"
    hint="Encode or decode URL components using UTF-8 percent escapes for Unicode text, spaces, and special characters."
    :left-label="inputLabel"
    :right-label="outputLabel"
  >
    <template #toolbar>
      <button type="button" class="url-tool__mode" @click="toggleMode">
        {{ mode === "encode" ? "Encode → Decode" : "Decode → Encode" }}
      </button>
      <span class="url-tool__mode-label">Mode: {{ mode === "encode" ? "Encode" : "Decode" }}</span>
    </template>
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="url-tool__area"
        spellcheck="false"
        :aria-label="inputLabel"
        placeholder="Enter text to convert..."
      ></textarea>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="url-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </template>
    <template #right>
      <textarea
        v-select-all
        class="url-tool__area"
        :class="{ 'url-tool__area--error': !result.ok }"
        readonly
        spellcheck="false"
        :aria-label="outputLabel"
        :value="output"
      ></textarea>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.url-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.url-tool__mode:hover {
  border-color: var(--color-primary);
}

.url-tool__mode-label {
  color: var(--color-text-muted);
  font-size: 13px;
}

.url-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.url-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.url-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.url-tool__area {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: var(--space-4);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.6;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  word-break: break-all;
}

.url-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.url-tool__area--error {
  color: var(--color-danger);
}
</style>

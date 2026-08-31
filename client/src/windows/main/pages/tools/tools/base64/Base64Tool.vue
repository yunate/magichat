<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { decodeBase64, encodeBase64 } from "./base64";

type Mode = "encode" | "decode";

interface ConversionResult {
  ok: boolean;
  text: string;
}

const DEFAULT_TEXT = "Hello, world! 👋";

const mode = ref<Mode>("encode");
const input = ref(DEFAULT_TEXT);
const copied = ref(false);

const inputLabel = computed(() => (mode.value === "encode" ? "Plain text" : "Base64"));
const outputLabel = computed(() => (mode.value === "encode" ? "Base64" : "Plain text"));
const inputPlaceholder = computed(() =>
  mode.value === "encode" ? "Enter text to encode..." : "Paste Base64 here...",
);

const result = computed<ConversionResult>(() => {
  const source = input.value;
  if (source === "") return { ok: true, text: "" };
  try {
    const text = mode.value === "encode" ? encodeBase64(source) : decodeBase64(source);
    return { ok: true, text };
  } catch {
    return { ok: false, text: "Invalid Base64 input" };
  }
});

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
    title="Base64"
    hint="Enter content on the left for live conversion on the right. Unicode text and emoji use UTF-8."
    :left-label="inputLabel"
    :right-label="outputLabel"
  >
    <template #toolbar>
      <button type="button" class="base64-tool__mode" @click="toggleMode">
        {{ mode === "encode" ? "Encode → Decode" : "Decode → Encode" }}
      </button>
      <span class="base64-tool__mode-label">Mode: {{ mode === "encode" ? "Encode" : "Decode" }}</span>
    </template>
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="base64-tool__input"
        spellcheck="false"
        :aria-label="inputLabel"
        :placeholder="inputPlaceholder"
      ></textarea>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="base64-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </template>
    <template #right>
      <textarea
        v-select-all
        class="base64-tool__input"
        :class="{ 'base64-tool__input--error': !result.ok }"
        readonly
        spellcheck="false"
        :aria-label="outputLabel"
        :value="result.text"
      ></textarea>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.base64-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.base64-tool__mode:hover {
  border-color: var(--color-primary);
}

.base64-tool__mode-label {
  color: var(--color-text-muted);
  font-size: 13px;
}

.base64-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.base64-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.base64-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.base64-tool__input {
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

.base64-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.base64-tool__input--error {
  color: var(--color-danger);
}
</style>

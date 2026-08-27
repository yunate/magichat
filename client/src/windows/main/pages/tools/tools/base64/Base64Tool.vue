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

const DEFAULT_TEXT = "你好，世界！Hello 👋";

const mode = ref<Mode>("encode");
const input = ref(DEFAULT_TEXT);
const copied = ref(false);

const inputLabel = computed(() => (mode.value === "encode" ? "原文" : "Base64"));
const outputLabel = computed(() => (mode.value === "encode" ? "Base64" : "原文"));
const inputPlaceholder = computed(() =>
  mode.value === "encode" ? "在此输入要编码的文本…" : "在此粘贴 Base64…",
);

const result = computed<ConversionResult>(() => {
  const source = input.value;
  if (source === "") return { ok: true, text: "" };
  try {
    const text = mode.value === "encode" ? encodeBase64(source) : decodeBase64(source);
    return { ok: true, text };
  } catch {
    return { ok: false, text: "无效的 Base64 输入" };
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
    hint="左侧输入，右侧实时转换；中文、emoji 均按 UTF-8 正确往返。"
    :left-label="inputLabel"
    :right-label="outputLabel"
  >
    <template #toolbar>
      <button type="button" class="base64-tool__mode" @click="toggleMode">
        {{ mode === "encode" ? "编码 → 解码" : "解码 → 编码" }}
      </button>
      <span class="base64-tool__mode-label">当前：{{ mode === "encode" ? "编码" : "解码" }}</span>
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
        {{ copied ? "已复制" : "复制" }}
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
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-sm);
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
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
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
  color: var(--color-danger, #f87171);
}
</style>

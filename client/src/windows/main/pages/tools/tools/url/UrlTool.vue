<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { transformUrl, type UrlMode } from "./url";

const DEFAULT_TEXT = "https://example.com/search?q=你好 世界&tag=a+b";

const mode = ref<UrlMode>("encode");
const input = ref(DEFAULT_TEXT);
const copied = ref(false);

const inputLabel = computed(() => (mode.value === "encode" ? "原文" : "已编码"));
const outputLabel = computed(() => (mode.value === "encode" ? "已编码" : "原文"));
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
    hint="URL 组件编解码; 中文、空格与特殊字符按 UTF-8 百分号转义往返。"
    :left-label="inputLabel"
    :right-label="outputLabel"
  >
    <template #toolbar>
      <button type="button" class="url-tool__mode" @click="toggleMode">
        {{ mode === "encode" ? "编码 → 解码" : "解码 → 编码" }}
      </button>
      <span class="url-tool__mode-label">当前: {{ mode === "encode" ? "编码" : "解码" }}</span>
    </template>
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="url-tool__area"
        spellcheck="false"
        :aria-label="inputLabel"
        placeholder="在此输入要转换的文本…"
      ></textarea>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="url-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "已复制" : "复制" }}
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
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-sm);
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
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
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
  color: var(--color-danger, #f87171);
}
</style>

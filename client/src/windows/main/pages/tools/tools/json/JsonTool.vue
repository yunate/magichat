<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
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
  <ToolSplitLayout
    title="JSON"
    hint="左侧输入 JSON, 右侧实时格式化或压缩; 解析失败会显示错误位置。"
    left-label="输入"
    right-label="输出"
  >
    <template #toolbar>
      <div class="json-tool__modes" role="group" aria-label="模式">
        <button
          type="button"
          class="json-tool__mode"
          :class="{ 'json-tool__mode--active': mode === 'format' }"
          @click="setMode('format')"
        >
          格式化
        </button>
        <button
          type="button"
          class="json-tool__mode"
          :class="{ 'json-tool__mode--active': mode === 'minify' }"
          @click="setMode('minify')"
        >
          压缩
        </button>
      </div>
    </template>
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="json-tool__area"
        spellcheck="false"
        aria-label="JSON 输入"
        placeholder="在此输入 JSON…"
      ></textarea>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="json-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "已复制" : "复制" }}
      </button>
    </template>
    <template #right>
      <textarea
        v-select-all
        class="json-tool__area"
        :class="{ 'json-tool__area--error': !result.ok }"
        readonly
        spellcheck="false"
        aria-label="JSON 输出"
        :value="output"
      ></textarea>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.json-tool__modes {
  display: inline-flex;
  gap: var(--space-1);
}

.json-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-sm);
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

.json-tool__area {
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
  white-space: pre;
}

.json-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.json-tool__area--error {
  color: var(--color-danger, #f87171);
  white-space: pre-wrap;
}
</style>

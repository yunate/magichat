<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { convertCase } from "./case";

const DEFAULT_TEXT = "getHTTPResponse id";

const input = ref(DEFAULT_TEXT);
const copiedLabel = ref("");

const results = computed(() => convertCase(input.value));

async function copyValue(label: string, value: string): Promise<void> {
  if (value === "") return;
  try {
    await navigator.clipboard.writeText(value);
    copiedLabel.value = label;
    window.setTimeout(() => (copiedLabel.value = ""), 1500);
  } catch {
    copiedLabel.value = "";
  }
}
</script>

<template>
  <ToolSplitLayout
    title="命名转换"
    hint="输入任意标识符或短语, 右侧给出 camel / Pascal / snake / kebab / CONSTANT 等命名形式。"
    left-label="输入"
    right-label="转换结果"
  >
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="case-tool__area"
        spellcheck="false"
        aria-label="输入文本"
        placeholder="在此输入要转换的标识符或短语…"
      ></textarea>
    </template>
    <template #right>
      <div class="case-tool__result">
        <div v-for="item in results" :key="item.label" class="case-tool__block">
          <div class="case-tool__block-head">
            <span>{{ item.label }}</span>
            <button
              type="button"
              class="case-tool__copy"
              :disabled="item.value === ''"
              @click="copyValue(item.label, item.value)"
            >
              {{ copiedLabel === item.label ? "已复制" : "复制" }}
            </button>
          </div>
          <span v-select-all tabindex="0" class="case-tool__value">{{ item.value || "—" }}</span>
        </div>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.case-tool__area {
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
}

.case-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.case-tool__result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.case-tool__block {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}

.case-tool__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.case-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.case-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.case-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.case-tool__value {
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 14px;
  word-break: break-all;
}

.case-tool__value:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>

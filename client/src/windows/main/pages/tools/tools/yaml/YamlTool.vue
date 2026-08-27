<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { transformYaml, type YamlMode } from "./yaml";

const DEFAULT_JSON = '{"name":"magichat","tools":["yaml","qr"],"version":1,"nested":{"ok":true}}';
const DEFAULT_YAML = "name: magichat\ntools:\n  - yaml\n  - qr\nversion: 1\nnested:\n  ok: true\n";

const mode = ref<YamlMode>("toYaml");
const input = ref(DEFAULT_JSON);
const copied = ref(false);

const result = computed(() => transformYaml(input.value, mode.value));
const output = computed(() => (result.value.ok ? result.value.text : result.value.error));

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
  <ToolSplitLayout
    title="YAML"
    hint="JSON 与 YAML 互转; 用 js-yaml 安全解析 (默认 schema, 不执行任意类型), 解析失败会显示错误。"
    left-label="输入"
    right-label="输出"
  >
    <template #toolbar>
      <div class="yaml-tool__modes" role="group" aria-label="转换方向">
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
      <textarea
        v-model="input"
        v-select-all
        class="yaml-tool__area"
        spellcheck="false"
        aria-label="待转换输入"
        placeholder="在此输入…"
      ></textarea>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="yaml-tool__copy"
        :disabled="!result.ok || result.text === ''"
        @click="copyResult"
      >
        {{ copied ? "已复制" : "复制" }}
      </button>
    </template>
    <template #right>
      <textarea
        v-select-all
        class="yaml-tool__area"
        :class="{ 'yaml-tool__area--error': !result.ok }"
        readonly
        spellcheck="false"
        aria-label="转换输出"
        :value="output"
      ></textarea>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.yaml-tool__modes {
  display: inline-flex;
  gap: var(--space-1);
}

.yaml-tool__mode {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-sm);
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

.yaml-tool__area {
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

.yaml-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.yaml-tool__area--error {
  color: var(--color-danger, #f87171);
  white-space: pre-wrap;
}
</style>

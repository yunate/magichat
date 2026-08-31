<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { parseColor } from "./color";

const input = ref("#38bdf8");
const copiedLabel = ref("");

const result = computed(() => parseColor(input.value));
const previewStyle = computed(() =>
  result.value.ok ? { background: result.value.preview } : {},
);
const rows = computed(() =>
  result.value.ok
    ? [
        { label: "HEX", value: result.value.hex },
        { label: "RGB", value: result.value.rgb },
        { label: "HSL", value: result.value.hsl },
      ]
    : [],
);

async function copyValue(label: string, value: string): Promise<void> {
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
    title="Color Converter"
    hint="Enter a color in #hex, rgb(), or hsl() format to view the other formats and a color preview."
    left-label="Color Input"
    right-label="Converted Values"
  >
    <template #left>
      <div class="color-tool__left">
        <input
          v-model="input"
          v-select-all
          class="color-tool__input"
          spellcheck="false"
          aria-label="Color input"
          placeholder="#38bdf8 / rgb(56,189,248) / hsl(199,92%,60%)"
        />
        <div class="color-tool__preview" :style="previewStyle" aria-hidden="true"></div>
      </div>
    </template>
    <template #right>
      <div class="color-tool__result">
        <p v-if="input.trim() === ''" class="color-tool__empty">Waiting for input...</p>
        <p v-else-if="!result.ok" class="color-tool__error">{{ result.error }}</p>
        <ul v-else class="color-tool__rows">
          <li v-for="row in rows" :key="row.label" class="color-tool__row">
            <span class="color-tool__row-label">{{ row.label }}</span>
            <span v-select-all tabindex="0" class="color-tool__row-value">{{ row.value }}</span>
            <button type="button" class="color-tool__copy" @click="copyValue(row.label, row.value)">
              {{ copiedLabel === row.label ? "Copied" : "Copy" }}
            </button>
          </li>
        </ul>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.color-tool__left {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.color-tool__input {
  flex: none;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  outline: none;
  padding: var(--space-3);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 15px;
}

.color-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.color-tool__preview {
  flex: 1;
  min-height: 80px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
}

.color-tool__result {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.color-tool__rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.color-tool__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
}

.color-tool__row-label {
  flex: none;
  min-width: 48px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.color-tool__row-value {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  word-break: break-all;
}

.color-tool__row-value:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.color-tool__copy {
  flex: none;
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.color-tool__copy:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.color-tool__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 14px;
}

.color-tool__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { computed, ref } from "vue";
import PopupSelect from "../../../../../../components/PopupSelect.vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { toReadable, toTimestamp, type TimestampUnit } from "./timestamp";

type Mode = "toDate" | "toTimestamp";

const UNIT_OPTIONS: readonly Readonly<{ value: TimestampUnit; label: string }>[] = [
  { value: "seconds", label: "秒" },
  { value: "milliseconds", label: "毫秒" },
];

const mode = ref<Mode>("toDate");
const unit = ref<TimestampUnit>("seconds");
const input = ref(String(Math.floor(Date.now() / 1000)));
const copiedLabel = ref("");

const inputLabel = computed(() => (mode.value === "toDate" ? "时间戳" : "日期"));
const inputPlaceholder = computed(() =>
  mode.value === "toDate" ? "在此输入 Unix 时间戳…" : "在此输入日期, 如 2024-01-01 12:00…",
);

const result = computed(() =>
  mode.value === "toDate" ? toReadable(input.value, unit.value) : toTimestamp(input.value),
);

function setMode(next: Mode): void {
  if (mode.value === next) return;
  mode.value = next;
  copiedLabel.value = "";
  input.value = next === "toDate" ? String(Math.floor(Date.now() / 1000)) : new Date().toISOString();
}

function setUnit(value: string): void {
  if (value === "seconds" || value === "milliseconds") unit.value = value;
}

function fillNow(): void {
  input.value =
    mode.value === "toDate"
      ? String(unit.value === "seconds" ? Math.floor(Date.now() / 1000) : Date.now())
      : new Date().toISOString();
}

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
    title="时间戳"
    hint="Unix 时间戳与可读日期互转, 支持秒 / 毫秒, 同时给出本地、UTC 与 ISO 8601。"
    :left-label="inputLabel"
    right-label="结果"
  >
    <template #toolbar>
      <div class="ts-tool__modes" role="group" aria-label="方向">
        <button
          type="button"
          class="ts-tool__mode"
          :class="{ 'ts-tool__mode--active': mode === 'toDate' }"
          @click="setMode('toDate')"
        >
          时间戳 → 日期
        </button>
        <button
          type="button"
          class="ts-tool__mode"
          :class="{ 'ts-tool__mode--active': mode === 'toTimestamp' }"
          @click="setMode('toTimestamp')"
        >
          日期 → 时间戳
        </button>
      </div>
      <div v-if="mode === 'toDate'" class="ts-tool__unit">
        <span id="timestamp-unit-label">单位</span>
        <div class="ts-tool__unit-select">
          <PopupSelect
            :value="unit"
            :options="UNIT_OPTIONS"
            accessible-label="时间戳单位"
            labelled-by="timestamp-unit-label"
            @update-value="setUnit"
          />
        </div>
      </div>
      <button type="button" class="ts-tool__now" @click="fillNow">当前时间</button>
    </template>
    <template #left>
      <input
        v-model="input"
        v-select-all
        class="ts-tool__input"
        spellcheck="false"
        :aria-label="inputLabel"
        :placeholder="inputPlaceholder"
      />
    </template>
    <template #right>
      <div class="ts-tool__result">
        <p v-if="!result.ok" class="ts-tool__error">{{ result.error }}</p>
        <p v-else-if="result.rows.length === 0" class="ts-tool__empty">等待输入…</p>
        <ul v-else class="ts-tool__rows">
          <li v-for="row in result.rows" :key="row.label" class="ts-tool__row">
            <span class="ts-tool__row-label">{{ row.label }}</span>
            <span v-select-all tabindex="0" class="ts-tool__row-value">{{ row.value }}</span>
            <button
              type="button"
              class="ts-tool__copy"
              @click="copyValue(row.label, row.value)"
            >
              {{ copiedLabel === row.label ? "已复制" : "复制" }}
            </button>
          </li>
        </ul>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.ts-tool__modes {
  display: inline-flex;
  gap: var(--space-1);
}

.ts-tool__mode {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.ts-tool__mode:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.ts-tool__mode--active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-surface);
}

.ts-tool__unit {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 13px;
}

.ts-tool__unit-select {
  width: 88px;
}

.ts-tool__now {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.ts-tool__now:hover {
  border-color: var(--color-primary);
}

.ts-tool__input {
  flex: none;
  width: 100%;
  border: none;
  outline: none;
  padding: var(--space-4);
  background: transparent;
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 15px;
}

.ts-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.ts-tool__result {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.ts-tool__rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ts-tool__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}

.ts-tool__row-label {
  flex: none;
  min-width: 96px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.ts-tool__row-value {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 14px;
  word-break: break-all;
}

.ts-tool__row-value:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.ts-tool__copy {
  flex: none;
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.ts-tool__copy:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.ts-tool__error {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-danger, #f87171);
  font-size: 14px;
}

.ts-tool__empty {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

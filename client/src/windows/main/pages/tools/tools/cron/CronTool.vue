<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { calculateNextRuns, describeCron, parseCron } from "./cron";

const NEXT_COUNT = 5;

const input = ref("*/5 9-17 * * 1-5");

const parsed = computed(() => parseCron(input.value));
const description = computed(() => (parsed.value.ok ? describeCron(input.value) : ""));
const upcoming = computed(() => calculateNextRuns(input.value, NEXT_COUNT));
const runs = computed(() => (upcoming.value.ok ? upcoming.value.runs : []));
</script>

<template>
  <ToolSplitLayout
    title="Cron 解释"
    hint="标准 5 字段 cron (分 时 日 月 周), 支持 * 、数字、列表 1,2 、范围 1-5 、步进 */5; 给出说明与接下来的执行时间。"
    left-label="Cron 表达式"
    right-label="解释"
  >
    <template #left>
      <div class="cron-tool__left">
        <input
          v-model="input"
          v-select-all
          class="cron-tool__input"
          spellcheck="false"
          aria-label="Cron 表达式"
          placeholder="*/5 9-17 * * 1-5"
        />
        <p class="cron-tool__legend">字段顺序: 分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-6, 7=周日)</p>
      </div>
    </template>
    <template #right>
      <div class="cron-tool__result">
        <p v-if="!parsed.ok" class="cron-tool__error">{{ parsed.error }}</p>
        <template v-else>
          <div class="cron-tool__block">
            <div class="cron-tool__block-head">说明</div>
            <p v-select-all tabindex="0" class="cron-tool__desc">{{ description }}</p>
          </div>
          <div class="cron-tool__block">
            <div class="cron-tool__block-head">接下来 {{ NEXT_COUNT }} 次</div>
            <p v-if="!upcoming.ok" class="cron-tool__error cron-tool__error--inline">{{ upcoming.error }}</p>
            <ul v-else class="cron-tool__runs">
              <li v-for="(run, index) in runs" :key="index">
                <span class="cron-tool__run-index">{{ index + 1 }}</span>
                <span>{{ run.toLocaleString() }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.cron-tool__left {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.cron-tool__input {
  flex: none;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  outline: none;
  padding: var(--space-3);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 16px;
  letter-spacing: 1px;
}

.cron-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.cron-tool__legend {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.cron-tool__result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.cron-tool__block {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-raised);
}

.cron-tool__block-head {
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.cron-tool__desc {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.cron-tool__desc:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.cron-tool__runs {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.cron-tool__runs li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 13px;
}

.cron-tool__run-index {
  flex: none;
  width: 20px;
  color: var(--color-primary);
  font-weight: 700;
}

.cron-tool__error {
  margin: 0;
  color: var(--color-danger, #f87171);
  font-size: 14px;
}

.cron-tool__error--inline {
  padding: var(--space-3);
  font-size: 13px;
}
</style>

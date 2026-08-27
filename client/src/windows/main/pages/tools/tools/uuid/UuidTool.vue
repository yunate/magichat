<script setup lang="ts">
import { onMounted, ref } from "vue";
import PopupSelect from "../../../../../../components/PopupSelect.vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { CHARSETS, generateUuidV4, randomString } from "./uuid";

type Mode = "uuid" | "random";

const mode = ref<Mode>("uuid");
const count = ref(5);
const length = ref(16);
const charsetId = ref(CHARSETS[0].id);
const output = ref("");
const copied = ref(false);
const charsetOptions = CHARSETS.map((charset) => ({
  value: charset.id,
  label: charset.label,
}));

onMounted(generate);

function generate(): void {
  const total = clampCount(count.value);
  const lines: string[] = [];
  if (mode.value === "uuid") {
    for (let i = 0; i < total; i += 1) lines.push(generateUuidV4());
  } else {
    const charset = CHARSETS.find((item) => item.id === charsetId.value) ?? CHARSETS[0];
    const size = clampLength(length.value);
    for (let i = 0; i < total; i += 1) lines.push(randomString(size, charset.chars));
  }
  output.value = lines.join("\n");
  copied.value = false;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function clampLength(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), 256);
}

function setCharset(value: string): void {
  if (CHARSETS.some((charset) => charset.id === value)) charsetId.value = value;
}

async function copyOutput(): Promise<void> {
  if (output.value === "") return;
  try {
    await navigator.clipboard.writeText(output.value);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <ToolSplitLayout
    title="UUID / 随机串"
    hint="生成 UUID v4 或自定义长度、字符集的随机字符串, 随机源为 Web Crypto。"
    left-label="参数"
    right-label="生成结果"
  >
    <template #toolbar>
      <button type="button" class="uuid-tool__generate" @click="generate">重新生成</button>
    </template>
    <template #left>
      <div class="uuid-tool__form">
        <div class="uuid-tool__modes" role="group" aria-label="类型">
          <button
            type="button"
            class="uuid-tool__mode"
            :class="{ 'uuid-tool__mode--active': mode === 'uuid' }"
            @click="mode = 'uuid'"
          >
            UUID v4
          </button>
          <button
            type="button"
            class="uuid-tool__mode"
            :class="{ 'uuid-tool__mode--active': mode === 'random' }"
            @click="mode = 'random'"
          >
            随机字符串
          </button>
        </div>
        <label class="uuid-tool__field">
          <span>生成数量</span>
          <input v-model.number="count" type="number" min="1" max="100" class="uuid-tool__input" />
        </label>
        <template v-if="mode === 'random'">
          <label class="uuid-tool__field">
            <span>字符串长度</span>
            <input v-model.number="length" type="number" min="1" max="256" class="uuid-tool__input" />
          </label>
          <div class="uuid-tool__field">
            <span id="uuid-charset-label">字符集</span>
            <div class="uuid-tool__select">
              <PopupSelect
                :value="charsetId"
                :options="charsetOptions"
                accessible-label="字符集"
                labelled-by="uuid-charset-label"
                @update-value="setCharset"
              />
            </div>
          </div>
        </template>
        <button type="button" class="uuid-tool__primary" @click="generate">生成</button>
      </div>
    </template>
    <template #rightActions>
      <button type="button" class="uuid-tool__copy" :disabled="output === ''" @click="copyOutput">
        {{ copied ? "已复制" : "复制" }}
      </button>
    </template>
    <template #right>
      <textarea
        v-select-all
        class="uuid-tool__output"
        readonly
        spellcheck="false"
        aria-label="生成结果"
        :value="output"
      ></textarea>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.uuid-tool__generate {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.uuid-tool__generate:hover {
  border-color: var(--color-primary);
}

.uuid-tool__form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.uuid-tool__modes {
  display: flex;
  gap: var(--space-1);
}

.uuid-tool__mode {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.uuid-tool__mode:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.uuid-tool__mode--active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-surface);
}

.uuid-tool__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 13px;
}

.uuid-tool__input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 14px;
}

.uuid-tool__input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 0;
}

.uuid-tool__primary {
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.uuid-tool__primary:hover {
  filter: brightness(1.05);
}

.uuid-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.uuid-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.uuid-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.uuid-tool__output {
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
  line-height: 1.8;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  word-break: break-all;
}

.uuid-tool__output:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}
</style>

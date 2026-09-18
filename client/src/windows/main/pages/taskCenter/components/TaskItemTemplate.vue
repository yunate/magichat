<script setup lang="ts">
import { computed, ref } from "vue";
import SafeInlineMarkdown from "../../../../../components/SafeInlineMarkdown.vue";
import SplitContainer from "../../../../../components/SplitContainer.vue";
import TaskStatusBadge from "./TaskStatusBadge.vue";
import type { TaskInfo } from "../../../../../../../common/tasks/taskInfo";
import { vSelectAll } from "../../../../../directives/vSelectAll";
import { gMessageStore } from "../../../../../messages/messageStore";
import { gMainApplication } from "../../../main";

const props = defineProps<{
  task: TaskInfo;
  isExpanded: boolean;
  logs: readonly string[];
  isLogLoading: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  isUnviewed?: boolean;
}>();

const emit = defineEmits<{
  stop: [id: string];
  toggle: [id: string];
  runNew: [id: string];
  select: [payload: { id: string; isChecked: boolean }];
  pin: [payload: { id: string; isPinned: boolean }];
  revealLog: [id: string];
  viewed: [id: string];
}>();

// active = notStarted + running: only these can still be asked to stop.
const canStop = computed(
  () => props.task.status === "notStarted" || props.task.status === "running",
);

const createdAt = computed(() => formatTime(props.task.createdAt));
const scriptType = computed(() => props.task.tasksSpectialInfo?.scriptType ?? "Script");
const exitCode = computed(() => props.task.tasksSpectialInfo?.exitCode ?? null);
const defaultScriptPaneHeight = computed(() => {
  const scriptContent = props.task.tasksSpectialInfo?.scriptContent ?? "";
  const lineCount = scriptContent.length === 0 ? 1 : scriptContent.split(/\r\n|\r|\n/).length;
  const toolbarHeight = Object.keys(props.task.tasksSpectialInfo?.variables ?? {}).length > 0 ? 40 : 0;
  return Math.min(360, Math.max(120, lineCount * 18 + toolbarHeight + 24));
});
const resizedScriptPaneHeight = ref<number | null>(null);
const logPaneHeight = ref(200);
const scriptPaneHeight = computed(() => resizedScriptPaneHeight.value ?? defaultScriptPaneHeight.value);

// pinnedAt is a top-level optional number set when a task is pinned; read defensively (only a finite
// number counts as pinned) so the pin toggle reflects real state for every task type and status.
const isPinned = computed(() => {
  const value = props.task.pinnedAt;
  return typeof value === "number" && Number.isFinite(value);
});

const logText = computed(() => props.logs.join("\n"));

function onToggle(): void {
  emit("toggle", props.task.id);
}

function onSelect(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  emit("select", { id: props.task.id, isChecked: target.checked });
}

function onStop(): void {
  emit("stop", props.task.id);
}

function onRunNew(): void {
  emit("runNew", props.task.id);
}

function onRevealLog(): void {
  emit("revealLog", props.task.id);
}

function resizeDetails(_index: number, detailHeight: number, logsHeight: number): void {
  resizedScriptPaneHeight.value = detailHeight;
  logPaneHeight.value = logsHeight;
}

function onViewed(): void {
  if (props.isUnviewed) emit("viewed", props.task.id);
}

async function openExternalLink(url: string): Promise<void> {
  try {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openExternalUrl(url);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    gMessageStore.pushMessage("error", message);
  }
}

// Click toggles to the opposite of the current pin state; allowed on every status (Complete can pin too).
function onPin(): void {
  emit("pin", { id: props.task.id, isPinned: !isPinned.value });
}

function formatTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}
</script>

<template>
  <li
    class="task-item"
    :class="{ 'is-expanded': props.isExpanded, 'is-unviewed': props.isUnviewed }"
  >
    <div class="task-item__head" @click="onViewed" @dblclick="onRunNew">
      <input
        v-if="props.isSelectable"
        type="checkbox"
        class="task-item__select"
        :checked="props.isSelected"
        :aria-label="`Select task ${props.task.title}`"
        @change="onSelect"
        @dblclick.stop
      />
      <button
        type="button"
        class="task-item__toggle"
        :class="{ 'is-open': props.isExpanded }"
        :aria-expanded="props.isExpanded"
        :aria-label="props.isExpanded ? 'Collapse details' : 'Expand details'"
        @click="onToggle"
        @dblclick.stop
      >
        <svg
          class="task-item__chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M3 1.5 8 6 3 10.5" />
        </svg>
      </button>
      <div class="task-item__summary">
        <div class="task-item__title-line">
          <SafeInlineMarkdown
            class="task-item__title"
            :source="props.task.title"
            :title="props.task.title"
            @open-link="openExternalLink"
          />
        </div>
        <div class="task-item__meta-line">
          <span class="task-item__type">{{ scriptType }}</span>
          <span class="task-item__created">{{ createdAt }}</span>
          <TaskStatusBadge
            v-if="props.task.status !== 'running'"
            :status="props.task.status"
          />
          <span v-if="exitCode !== null" class="task-item__exit-code">
            Exit code {{ exitCode }}
          </span>
        </div>
        <SafeInlineMarkdown
          v-if="props.task.displayState !== undefined"
          class="task-item__display-state"
          :source="props.task.displayState"
          :title="props.task.displayState"
          @open-link="openExternalLink"
        />
      </div>
      <div class="task-item__actions">
        <button
          v-if="canStop"
          type="button"
          class="task-item__stop"
          @click="onStop"
          @dblclick.stop
        >
          Stop
        </button>
        <button
          type="button"
          class="task-item__run-new"
          title="Create a new task from this task"
          @click.stop="onRunNew"
          @dblclick.stop
        >
          Run new
        </button>
        <button
          type="button"
          class="task-item__pin"
          :class="{ 'is-pinned': isPinned }"
          :aria-label="isPinned ? 'Unpin task' : 'Pin task'"
          :aria-pressed="isPinned"
          @click.stop="onPin"
          @dblclick.stop
        >
          <svg
            class="task-item__pin-icon"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9.5 1.5 14.5 6.5 12 7l-2.5 2.5.5 3.5-1.5 1.5-3-3-3.5 3.5-.5-.5L5.5 11l-3-3L4 6.5l3.5.5L10 4.5z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div v-show="props.isExpanded" class="task-item__body">
      <ul
        v-if="props.task.displayDetails !== undefined && props.task.displayDetails.length > 0"
        class="task-item__display-details"
      >
        <li v-for="(detail, index) in props.task.displayDetails" :key="index">
          <SafeInlineMarkdown :source="detail" @open-link="openExternalLink" />
        </li>
      </ul>
      <SplitContainer
        class="task-item__details-layout"
        orientation="horizontal"
        :separator-labels="['Resize task details and logs']"
        @resize="resizeDetails"
      >
        <section class="task-item__detail-pane" :style="{ blockSize: `${scriptPaneHeight}px` }">
          <slot name="detail" />
        </section>

        <section class="task-item__logs" :style="{ blockSize: `${logPaneHeight}px` }">
          <button
            type="button"
            class="task-item__logs-full"
            aria-label="Show log file"
            title="Show log file"
            @click="onRevealLog"
          >
            <svg
              class="task-item__logs-full-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2.5 3.5h4l1.5 2h5.5v7h-11z" />
              <path d="m9.5 8.5 1.5 1.5 2.5-2.5" />
            </svg>
          </button>
          <p v-if="props.isLogLoading" class="task-item__logs-hint" role="status" aria-live="polite">
            Loading logs…
          </p>
          <p v-else-if="props.logs.length === 0" class="task-item__logs-hint">
            No logs yet.
          </p>
          <pre v-else v-select-all class="task-item__log-output">{{ logText }}</pre>
        </section>
      </SplitContainer>
    </div>
  </li>
</template>

<style scoped>
.task-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  transition: background 0.15s ease;
}

.task-item.is-unviewed {
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
}

.task-item:not(.is-expanded):hover {
  background: var(--color-surface-raised);
}

.task-item__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 48px;
}

.task-item__select {
  width: 15px;
  height: 15px;
  flex: none;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.task-item__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
}

.task-item__display-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  color: var(--color-text-muted);
  background: var(--color-content-bg);
  font-size: 12px;
  list-style: none;
}

.task-item__display-details li {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.task-item__details-layout {
  min-height: 0;
}

.task-item__detail-pane,
.task-item__logs {
  min-width: 0;
  overflow: hidden;
}

.task-item__detail-pane {
  min-height: 120px;
  border-inline: 1px solid var(--color-divider);
}

.task-item__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.task-item__toggle:hover {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.task-item__toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-item__chevron {
  display: block;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  transition: transform 0.15s ease;
}

.task-item__toggle.is-open .task-item__chevron {
  transform: rotate(90deg);
}

.task-item__created {
  flex: none;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-muted);
}

.task-item__title {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item__summary {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.task-item__title-line,
.task-item__meta-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.task-item__title-line {
  min-height: 20px;
}

.task-item__display-state {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item__type {
  flex: none;
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.task-item__exit-code {
  flex: none;
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.task-item__actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: var(--space-2);
  margin-left: auto;
}

.task-item__run-new {
  flex: none;
  min-width: 88px;
  min-height: 30px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-selected);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.task-item__run-new:hover {
  color: color-mix(in srgb, var(--color-primary) 70%, var(--color-text));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}

.task-item__run-new:active {
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
}

.task-item__run-new:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-item__stop {
  flex: none;
  padding: var(--space-1) var(--space-3);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, var(--color-border));
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--color-danger) 5%, transparent);
  color: color-mix(in srgb, var(--color-danger) 65%, var(--color-text-muted));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.task-item__stop:hover {
  color: color-mix(in srgb, var(--color-danger) 80%, var(--color-text));
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 50%, var(--color-border));
}

.task-item__stop:focus-visible {
  outline: 2px solid var(--color-danger);
  outline-offset: 2px;
}

.task-item__pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.task-item__pin:hover {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.task-item__pin:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-item__pin.is-pinned {
  color: var(--color-primary);
}

.task-item__pin-icon {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linejoin: round;
}

/* Filled glyph while pinned so it reads as active at a glance. */
.task-item__pin.is-pinned .task-item__pin-icon {
  fill: currentColor;
}

.task-item__logs {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 64px;
  border-inline: 1px solid var(--color-divider);
  border-block-end: 1px solid var(--color-divider);
}

.task-item__logs-full {
  position: absolute;
  inset-block-start: var(--space-2);
  inset-inline-end: var(--space-3);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-height: 32px;
  padding: 0;
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  cursor: pointer;
}

.task-item__logs-full-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.task-item__logs-full:hover {
  background: color-mix(in srgb, var(--color-text) 9%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-border) 58%, var(--color-text-muted));
}

.task-item__logs-full:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-item__logs-hint {
  margin: 0;
  padding: var(--space-3);
  padding-inline-end: 56px;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Logs are untrusted task output: text interpolation only (never v-html) so markup is escaped. */
.task-item__log-output {
  margin: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: var(--space-2) var(--space-3);
  padding-inline-end: 56px;
  border-radius: var(--radius-medium);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.task-item__log-output:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
</style>

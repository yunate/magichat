<script setup lang="ts">
import { computed } from "vue";
import TaskStatusBadge from "./TaskStatusBadge.vue";
import type { TaskInfo } from "../../../../../../../common/tasks/taskInfo";
import { vSelectAll } from "../../../../../directives/vSelectAll";

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
  viewFullLogs: [id: string];
  viewed: [id: string];
}>();

// active = notStarted + running: only these can still be asked to stop.
const canStop = computed(
  () => props.task.status === "notStarted" || props.task.status === "running",
);

const createdAt = computed(() => formatTime(props.task.createdAt));
const scriptType = computed(() => props.task.tasksSpectialInfo?.scriptType ?? "Script");

// finishedAt is a top-level optional number set when a task reaches a terminal state; show only when present
// (defensive: a missing/non-number value renders nothing rather than an Invalid Date).
const finishedAt = computed(() => {
  const value = props.task.finishedAt;
  return typeof value === "number" && Number.isFinite(value) ? formatTime(value) : "";
});

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

function onViewFullLogs(): void {
  emit("viewFullLogs", props.task.id);
}

function onViewed(): void {
  if (props.isUnviewed) emit("viewed", props.task.id);
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
      <span class="task-item__title">{{ props.task.title }}</span>
      <span class="task-item__type">{{ scriptType }}</span>
      <!-- Sibling of the badge/button (not nested in the title column) so it shares the head's align-items:center
           baseline; margin-left:auto pushes it to the right edge. Muted/nowrap; visible while collapsed. -->
      <span class="task-item__created">{{ createdAt }}</span>
      <!-- Pin toggle: works for every status (Complete can pin too). @click.stop keeps it from toggling expand. -->
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
      <TaskStatusBadge :status="props.task.status" />
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
    </div>

    <!-- Collapsible body: the expand toggle hides the whole detail area (meta, the injected detail slot, logs). -->
    <div v-show="props.isExpanded" class="task-item__body">
      <dl class="task-item__meta">
        <div class="task-item__meta-item">
          <dt>Created</dt>
          <dd>{{ createdAt }}</dd>
        </div>
        <div v-if="finishedAt.length > 0" class="task-item__meta-item">
          <dt>Completed</dt>
          <dd>{{ finishedAt }}</dd>
        </div>
      </dl>

      <!-- Task-specific detail body. -->
      <slot name="detail" />

      <div class="task-item__logs">
        <div class="task-item__logs-toolbar">
          <button
            type="button"
            class="task-item__logs-full"
            @click="onViewFullLogs"
          >
            View full log
          </button>
        </div>
        <p v-if="props.isLogLoading" class="task-item__logs-hint" role="status" aria-live="polite">
          Loading logs…
        </p>
        <p v-else-if="props.logs.length === 0" class="task-item__logs-hint">
          No logs yet.
        </p>
        <pre v-else v-select-all class="task-item__log-output">{{ logText }}</pre>
      </div>
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
  border-radius: var(--radius-sm);
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
}

.task-item__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
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

/* Sits in .task-item__head (align-items:center) so it lines up with the badge/button. Right alignment
   comes from the flex:1 title-wrap eating the remaining space; here we only need flex:none so the
   timestamp never shrinks and nowrap to keep it on one line. */
.task-item__created {
  flex: none;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-muted);
}

.task-item__title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item__type {
  flex: none;
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.task-item__run-new {
  flex: none;
  min-width: 88px;
  min-height: 30px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
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

.task-item__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-1) var(--space-4);
  margin: 0;
}

.task-item__meta-item {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}

.task-item__meta-item dt {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.task-item__meta-item dd {
  margin: 0;
  min-width: 0;
  color: var(--color-text);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-item__logs {
  margin-top: var(--space-1);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.task-item__logs-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-2);
}

.task-item__logs-full {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.task-item__logs-full:hover {
  border-color: var(--color-primary);
  background: var(--color-surface);
}

.task-item__logs-full:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-item__logs-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Logs are untrusted task output: text interpolation only (never v-html) so markup is escaped. */
.task-item__log-output {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: ui-monospace, "Cascadia Code", monospace;
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

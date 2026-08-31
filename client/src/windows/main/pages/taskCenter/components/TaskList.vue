<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SortButton from "../../../../../components/SortButton.vue";
import ScriptTaskItem from "./ScriptTaskItem.vue";
import type { TaskInfo } from "../../../../../../../common/tasks/taskInfo";

type SortDirection = "none" | "descending" | "ascending";
type TaskSortKey = "time" | "scriptType";
type TaskSortDirections = Record<TaskSortKey, SortDirection>;

const props = defineProps<{
  tasks: readonly TaskInfo[];
  expandedIds: ReadonlySet<string>;
  logsById: Readonly<Record<string, string[]>>;
  logLoadingIds: ReadonlySet<string>;
  emptyLabel: string;
  filterId: string;
  // Complete tab only: render per-row checkboxes plus the select-all / delete toolbar.
  isSelectable?: boolean;
  unviewedIds?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  stop: [id: string];
  toggle: [id: string];
  runNew: [id: string];
  delete: [ids: string[]];
  pin: [payload: { id: string; isPinned: boolean }];
  revealLog: [id: string];
  viewed: [id: string];
  markAllViewed: [];
}>();

const searchTerm = ref("");
const isFilterExpanded = ref(true);
const sortDirections = ref<TaskSortDirections>({
  time: "none",
  scriptType: "none",
});

const filtered = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  return props.tasks.filter((task) => {
    return term.length === 0 || task.title.toLowerCase().includes(term);
  });
});

const displayedTasks = computed(() => {
  if (Object.values(sortDirections.value).every((direction) => direction === "none")) {
    return filtered.value;
  }
  return [...filtered.value].sort((left, right) => {
    const timeResult = compareByDirection(
      left.createdAt - right.createdAt,
      sortDirections.value.time,
    );
    if (timeResult !== 0) return timeResult;
    return compareByDirection(
      getScriptType(left).localeCompare(getScriptType(right)),
      sortDirections.value.scriptType,
    );
  });
});

function getSortDirection(key: TaskSortKey): SortDirection {
  return sortDirections.value[key];
}

function setSortDirection(key: TaskSortKey, direction: SortDirection): void {
  sortDirections.value = { ...sortDirections.value, [key]: direction };
}

function compareByDirection(result: number, direction: SortDirection): number {
  if (direction === "none" || result === 0) return 0;
  return direction === "descending" ? -result : result;
}

function getScriptType(task: TaskInfo): string {
  return task.tasksSpectialInfo?.scriptType ?? "";
}

// Selection is UI-only state (Complete tab). A hidden-by-filter selected row stays selected;
// pruning below drops any id that no longer exists (e.g. after a tasks.deleted push).
const selectedIds = ref<Set<string>>(new Set());

// Only the currently visible (filtered) selected rows: N and the delete set both derive from this so a
// filter-hidden selection is never counted or deleted ("what you see is what you delete").
const visibleSelected = computed(() => filtered.value.filter((task) => selectedIds.value.has(task.id)));

const visibleSelectedCount = computed(() => visibleSelected.value.length);

const allFilteredSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((task) => selectedIds.value.has(task.id)),
);

const someFilteredSelected = computed(
  () => filtered.value.some((task) => selectedIds.value.has(task.id)) && !allFilteredSelected.value,
);

function onSelect(payload: { id: string; isChecked: boolean }): void {
  const next = new Set(selectedIds.value);
  if (payload.isChecked) next.add(payload.id);
  else next.delete(payload.id);
  selectedIds.value = next;
}

function toggleSelectAll(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const next = new Set(selectedIds.value);
  for (const task of filtered.value) {
    if (target.checked) next.add(task.id);
    else next.delete(task.id);
  }
  selectedIds.value = next;
}

// Only delete the currently visible selected rows so filter-hidden selections are never removed; the
// backend also guards.
function onDeleteSelected(): void {
  const ids = visibleSelected.value.map((task) => task.id);
  if (ids.length === 0) return;
  emit("delete", ids);
}

// Drop selected ids whose tasks are gone (deleted elsewhere) so selection never points at absent rows.
watch(
  () => props.tasks,
  (list) => {
    const existing = new Set(list.map((task) => task.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds.value) {
      if (existing.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) selectedIds.value = next;
  },
);

function toggleFilters(): void {
  isFilterExpanded.value = !isFilterExpanded.value;
}

function logsFor(id: string): readonly string[] {
  return props.logsById[id] ?? [];
}
</script>

<template>
  <div class="task-list">
    <div v-if="props.isSelectable && props.tasks.length > 0" class="task-list__select-toolbar">
      <label class="task-list__select-all">
        <input
          type="checkbox"
          class="task-list__checkbox"
          :checked="allFilteredSelected"
          :indeterminate.prop="someFilteredSelected"
          :disabled="filtered.length === 0"
          aria-label="Select all"
          @change="toggleSelectAll"
        />
        <span>Select all</span>
      </label>
      <div class="task-list__select-actions">
        <button
          type="button"
          class="task-list__mark-viewed"
          :disabled="(props.unviewedIds?.size ?? 0) === 0"
          @click="emit('markAllViewed')"
        >Mark all viewed</button>
        <button
          type="button"
          class="task-list__delete"
          :disabled="visibleSelectedCount === 0"
          @click="onDeleteSelected"
        >
          Delete selected ({{ visibleSelectedCount }})
        </button>
      </div>
    </div>

    <div class="task-list__filter-row">
      <span class="task-list__count">{{ filtered.length }} shown</span>
      <button
        type="button"
        class="task-list__filter-toggle"
        :class="{ 'is-active': isFilterExpanded }"
        aria-label="Toggle filters"
        :aria-expanded="isFilterExpanded"
        :aria-controls="props.filterId"
        @click="toggleFilters"
      >
        <svg
          class="task-list__filter-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="4" y1="8" x2="12" y2="8" />
          <line x1="6" y1="12" x2="10" y2="12" />
        </svg>
      </button>
    </div>

    <div v-show="isFilterExpanded" :id="props.filterId" class="task-list__filter-fields">
      <input
        v-model="searchTerm"
        class="task-list__input"
        type="search"
        placeholder="Task title"
        aria-label="Filter tasks by title"
      />
      <div class="task-list__sort-actions" aria-label="Sort tasks">
        <SortButton
          label="Sort by time"
          :direction="getSortDirection('time')"
          @update-direction="setSortDirection('time', $event)"
        />
        <SortButton
          label="Sort by type"
          :direction="getSortDirection('scriptType')"
          @update-direction="setSortDirection('scriptType', $event)"
        />
      </div>
    </div>

    <div class="task-list__scroll">
      <p v-if="props.tasks.length === 0" class="task-list__hint">{{ props.emptyLabel }}</p>
      <p v-else-if="filtered.length === 0" class="task-list__hint">
        No tasks match the current filters.
      </p>
      <ul v-else class="task-list__items">
        <ScriptTaskItem
          v-for="task in displayedTasks"
          :key="task.id"
          :task="task"
          :is-expanded="props.expandedIds.has(task.id)"
          :logs="logsFor(task.id)"
          :is-log-loading="props.logLoadingIds.has(task.id)"
          :is-selectable="props.isSelectable"
          :is-selected="selectedIds.has(task.id)"
          :is-unviewed="props.unviewedIds?.has(task.id)"
          @stop="emit('stop', $event)"
          @toggle="emit('toggle', $event)"
          @run-new="emit('runNew', $event)"
          @select="onSelect"
          @pin="emit('pin', $event)"
          @reveal-log="emit('revealLog', $event)"
          @viewed="emit('viewed', $event)"
        />
      </ul>
    </div>
  </div>
</template>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  min-height: 0;
}

.task-list__select-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: none;
}

.task-list__select-all {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}

.task-list__select-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.task-list__mark-viewed {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.task-list__mark-viewed:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.task-list__mark-viewed:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-list__mark-viewed:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-list__checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.task-list__delete {
  padding: var(--space-2) var(--space-3);
  border: 1px solid color-mix(in srgb, var(--color-danger) 55%, transparent);
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.task-list__delete:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-danger) 20%, transparent);
  border-color: var(--color-danger);
}

.task-list__delete:focus-visible {
  outline: 2px solid var(--color-danger);
  outline-offset: 2px;
}

.task-list__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-list__filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
}

.task-list__count {
  font-size: 12px;
  color: var(--color-text-muted);
}

.task-list__sort-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.task-list__filter-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-inline-start: auto;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.task-list__filter-toggle:hover {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.task-list__filter-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-list__filter-toggle.is-active {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.task-list__filter-icon {
  display: block;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}

.task-list__filter-fields {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  flex-wrap: wrap;
}

.task-list__input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.task-list__input {
  flex: 1;
  min-width: 0;
}

.task-list__input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* The only scrolling element in the category panel: bounded height + overflow keeps the header, tabs
   and filter fixed while the task list scrolls inside. */
.task-list__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.task-list__hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.task-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import type { ComponentPublicInstance } from "vue";
import {
  confirmActionDialog,
  confirmDialog,
  hasConfirmDialogRequest,
} from "../../../../components/confirmDialog";
import type { ConfirmDialogAction } from "../../../../components/confirmDialogTypes";
import PersistentStack from "../../../../components/PersistentStack.vue";
import type { PopupToastHandle } from "../../../../components/popupToast";
import PopupToast from "../../../../components/PopupToast.vue";
import TaskList from "./components/TaskList.vue";
import TemplateSidebar from "./components/TemplateSidebar.vue";
import TaskCreateForm from "./components/TaskCreateForm.vue";
import {
  TASK_UPDATED_EVENT,
  TASK_LOG_APPENDED_EVENT,
  TASK_DELETED_EVENT,
  gTaskUpdatedCenter,
  gTaskLogAppendedCenter,
  gTaskDeletedCenter,
  type TaskLogAppendedEventPayload as TasksLogAppendedParams,
  type TasksDeletedEventPayload as TasksDeletedPush,
} from "./taskCenter";
import { gMainApplication } from "../../main";
import { gMessageStore } from "../../../../messages/messageStore";
import {
  TASK_CENTER_CONFIG_KEY,
  taskCenterConfigSerializer,
} from "../../../../../../common/config/taskCenter";
import type { TaskCreateParam } from "../../../../../../common/tasks/taskCreateParam";
import type { TaskInfo } from "../../../../../../common/tasks/taskInfo";
import type { TaskTemplate } from "../../../../../../common/tasks/taskTemplate";
import type { TaskStatus, TaskType } from "../../../../../../common/tasks/taskType";

type TaskCategory = "active" | "complete";
type FormCloseDecision = "save" | "discard" | "cancel";
type TaskCreateFormApi = Readonly<{
  canSaveTemplateDraft: () => boolean;
  getTemplateDraft: () => TaskTemplate;
  isTemplateDirty: () => boolean;
  showTemplateSaved: (name: string, operation: "updated" | "cloned") => void;
}>;

const configServerRpcObject = gMainApplication.window.getConfigServerRpcObject();
const tasksServerRpcObject = gMainApplication.window.getTasksServerRpcObject();

interface CategoryTab {
  value: TaskCategory;
  label: string;
  emptyLabel: string;
  statuses: readonly TaskStatus[];
}

const CATEGORY_TABS: readonly CategoryTab[] = [
  {
    value: "active",
    label: "Active",
    emptyLabel: "No active tasks.",
    statuses: ["notStarted", "running"],
  },
  {
    value: "complete",
    label: "Complete",
    emptyLabel: "No completed tasks.",
    statuses: ["succeeded", "failed", "abandoned"],
  },
];
const tasks = ref<TaskInfo[]>([]);
const templates = ref<TaskTemplate[]>([]);
const selectedCategory = ref<TaskCategory>("active");
const unviewedCompletedIds = ref<ReadonlySet<string>>(new Set());
const isSidebarCollapsed = ref(false);
const activeTemplate = ref<TaskTemplate | null>(null);
const formInitialParams = ref<TaskCreateParam | null>(null);
const isSubmitting = ref(false);
const taskCreateForm = ref<TaskCreateFormApi | null>(null);
const popupToast = ref<PopupToastHandle | null>(null);

const maxParallelInput = ref<number | "">("");
const logsById = reactive<Record<string, string[]>>({});
const expandedIds = reactive(new Set<string>());
const logLoadingIds = reactive(new Set<string>());
// Rows whose persisted tail has been fetched; appendLogs may seed logsById before the first expand, so
// the fetch guard can't rely on logsById presence alone.
const logFetchedIds = reactive(new Set<string>());

const MAX_INLINE_LOG_LINES = 200;
const FORM_CLOSE_ACTIONS: readonly ConfirmDialogAction<FormCloseDecision>[] = [
  { id: "cancel", label: "Cancel" },
  { id: "discard", label: "Don't Save" },
  { id: "save", label: "Save", appearance: "primary", isDefault: true },
];

const tabButtonRefs: Record<TaskCategory, HTMLButtonElement | null> = {
  active: null,
  complete: null,
};

let unsubscribeUpdated: (() => void) | null = null;
let unsubscribeLogAppended: (() => void) | null = null;
let unsubscribeDeleted: (() => void) | null = null;
let runNewRequestVersion = 0;

// Ids removed by a tasks.deleted push while the initial listTasks() is in flight, so the stale
// snapshot merge cannot revive an already-deleted task.
const deletedDuringInit = new Set<string>();
const completionNotifiedIds = new Set<string>();
let isInitializing = false;

// Pinned tasks sort by pinnedAt descending, then unpinned tasks by createdAt ascending.
// Avoid updatedAt because execution updates would make rows jump.
function pinnedAt(task: TaskInfo): number | null {
  const value = task.pinnedAt;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareTasks(a: TaskInfo, b: TaskInfo): number {
  const pinA = pinnedAt(a);
  const pinB = pinnedAt(b);
  if (pinA !== null && pinB !== null) return pinB - pinA;
  if (pinA !== null) return -1;
  if (pinB !== null) return 1;
  return a.createdAt - b.createdAt;
}

function compareCompletedTasks(a: TaskInfo, b: TaskInfo): number {
  const pinA = pinnedAt(a);
  const pinB = pinnedAt(b);
  if (pinA !== null && pinB === null) return -1;
  if (pinA === null && pinB !== null) return 1;
  return b.createdAt - a.createdAt;
}

const tasksByCategory = computed<Record<TaskCategory, TaskInfo[]>>(() => {
  // Classify from each tab's statuses so CATEGORY_TABS stays the single source of truth; first match wins.
  const result: Record<TaskCategory, TaskInfo[]> = { active: [], complete: [] };
  for (const task of tasks.value) {
    const tab = CATEGORY_TABS.find((candidate) => candidate.statuses.includes(task.status));
    if (tab !== undefined) result[tab.value].push(task);
  }
  result.active.sort(compareTasks);
  result.complete.sort(compareCompletedTasks);
  return result;
});

const categoryPanels = computed(() =>
  CATEGORY_TABS.map((tab) => ({ tab, tasks: tasksByCategory.value[tab.value] })),
);
const unviewedCompletedCount = computed(() => unviewedCompletedIds.value.size);

function selectCategory(category: TaskCategory): void {
  selectedCategory.value = category;
}

function markTaskViewed(id: string): void {
  if (!unviewedCompletedIds.value.has(id)) return;
  const next = new Set(unviewedCompletedIds.value);
  next.delete(id);
  unviewedCompletedIds.value = next;
}

function markAllTasksViewed(): void {
  if (unviewedCompletedIds.value.size > 0) unviewedCompletedIds.value = new Set();
}

function onTabKeydown(event: KeyboardEvent): void {
  const currentIndex = CATEGORY_TABS.findIndex((tab) => tab.value === selectedCategory.value);
  if (currentIndex < 0) return;
  let nextIndex: number;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (currentIndex + 1) % CATEGORY_TABS.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (currentIndex - 1 + CATEGORY_TABS.length) % CATEGORY_TABS.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = CATEGORY_TABS.length - 1;
      break;
    default:
      return;
  }
  const nextTab = CATEGORY_TABS[nextIndex];
  if (nextTab === undefined) return;
  event.preventDefault();
  selectCategory(nextTab.value);
  tabButtonRefs[nextTab.value]?.focus();
}

function setTabRef(category: TaskCategory, el: Element | ComponentPublicInstance | null): void {
  tabButtonRefs[category] = el instanceof HTMLButtonElement ? el : null;
}

function toggleSidebar(): void {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
}

function invalidateRunNewRequest(): void {
  runNewRequestVersion += 1;
}

function selectTemplate(template: TaskTemplate): void {
  invalidateRunNewRequest();
  formInitialParams.value = null;
  activeTemplate.value = template;
}

function closeForm(): void {
  invalidateRunNewRequest();
  activeTemplate.value = null;
  formInitialParams.value = null;
}

async function requestCloseForm(): Promise<void> {
  const form = taskCreateForm.value;
  if (form === null || !form.isTemplateDirty()) {
    closeForm();
    return;
  }
  if (hasConfirmDialogRequest()) return;
  const decision = await confirmDialog({
    title: "Unsaved changes",
    descriptions: ["This task template has unsaved changes.", "Save before closing?"],
    actions: FORM_CLOSE_ACTIONS,
    cancelActionId: "cancel",
  });
  if (decision === "cancel") return;
  if (decision === "discard") {
    closeForm();
    return;
  }
  if (!form.canSaveTemplateDraft()) {
    gMessageStore.pushMessage("warning", "Fix the form errors before saving.");
    return;
  }
  const saved = await handleSaveTemplate(form.getTemplateDraft());
  if (saved !== null) closeForm();
}

// null reply means the task is gone, so hint instead of opening an empty form.
async function handleRunNew(id: string): Promise<void> {
  const requestVersion = ++runNewRequestVersion;
  try {
    const params = await (await tasksServerRpcObject).getTaskCreateParams(id);
    if (requestVersion !== runNewRequestVersion) return;
    if (params === null) {
      gMessageStore.pushMessage("info", "This task is gone; nothing to run a new copy from.");
      return;
    }
    formInitialParams.value = params;
    activeTemplate.value = templateForType(params.type);
  } catch (err) {
    if (requestVersion !== runNewRequestVersion) return;
    const message = err instanceof Error ? err.message : "Failed to load task parameters";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to load create params", err);
  }
}

async function handleCreate(params: TaskCreateParam): Promise<void> {
  invalidateRunNewRequest();
  isSubmitting.value = true;
  try {
    const task = await (await tasksServerRpcObject).createTask(params);
    upsertTask(task);
    activeTemplate.value = null;
    formInitialParams.value = null;
    gMessageStore.pushMessage("success", `Task "${task.title}" created.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to create task", err);
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSaveTemplate(
  params: TaskTemplate,
  isCurrentForm = true,
): Promise<TaskTemplate | null> {
  const isUpdating = templates.value.some(
    (template) => !template.builtin && template.id === params.id,
  );
  try {
    const saved = await (await tasksServerRpcObject).saveTaskTemplate(params);
    templates.value = await (await tasksServerRpcObject).listTaskTemplates();
    const verb = isUpdating ? "updated" : "saved";
    gMessageStore.pushMessage("success", `Template "${saved.name}" ${verb}.`);
    if (isCurrentForm) {
      activeTemplate.value = saved;
      formInitialParams.value = null;
      await nextTick();
      if (isUpdating) taskCreateForm.value?.showTemplateSaved(saved.name, "updated");
    }
    return saved;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save template";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to save template", err);
    return null;
  }
}

async function handleCloneTemplate(source: TaskTemplate): Promise<void> {
  const clone = {
    ...source,
    id: crypto.randomUUID(),
    name: createCloneTemplateName(source.name),
  };
  const saved = await handleSaveTemplate(clone, false);
  if (saved !== null) {
    taskCreateForm.value?.showTemplateSaved(saved.name, "cloned");
  }
}

function createCloneTemplateName(sourceName: string): string {
  const existingNames = new Set(templates.value.map((template) => template.name));
  const baseName = `${sourceName} copy`;
  if (!existingNames.has(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

// Confirm here (single place) so the sidebar and the form's delete buttons only emit. Only user
// templates delete; a built-in/unknown id returns deleted=false. Refetch to refresh the list, and
// close the form if it was showing the just-deleted template.
async function handleDeleteTemplate(template: TaskTemplate): Promise<void> {
  try {
    const action = await confirmActionDialog({
      title: "Delete template?",
      descriptions: [`Template "${template.name}" will be permanently deleted.`],
      actionId: "delete",
      actionLabel: "Delete",
      isActionDefault: true,
    });
    if (action === "cancel") return;
    const deleted = await (await tasksServerRpcObject).deleteTaskTemplate(template.id);
    templates.value = await (await tasksServerRpcObject).listTaskTemplates();
    if (!deleted) {
      gMessageStore.pushMessage("info", "Built-in templates can't be deleted.");
      return;
    }
    if (activeTemplate.value?.id === template.id) closeForm();
    gMessageStore.pushMessage("success", `Template "${template.name}" deleted.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete template";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to delete template", err);
  }
}

async function handleStop(id: string): Promise<void> {
  try {
    await (await tasksServerRpcObject).stopTask(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to stop task";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to stop task", err);
  }
}

// Confirm, then delete. Removal from the list is driven by the tasks.deleted push (below), so every
// session stays in sync; TaskList prunes its own selection when the rows disappear.
async function handleDelete(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const action = await confirmActionDialog({
      title: "Delete completed tasks?",
      descriptions: [
        `${ids.length} completed task${ids.length === 1 ? "" : "s"} will be permanently deleted.`,
      ],
      actionId: "delete",
      actionLabel: "Delete",
      isActionDefault: true,
    });
    if (action === "cancel") return;
    await (await tasksServerRpcObject).deleteTasks([...ids]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete tasks";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to delete tasks", err);
  }
}

// Pin/unpin; the new pinnedAt echoes back via tasks.updated, which upsertTask applies so the
// pinned-first ordering recomputes. Works on terminal tasks too (the Complete list can pin).
async function handlePin({ id, isPinned }: { id: string; isPinned: boolean }): Promise<void> {
  try {
    await (await tasksServerRpcObject).setTaskPin(id, isPinned);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pin task";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to pin task", err);
  }
}

async function handleToggle(id: string): Promise<void> {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
    return;
  }
  expandedIds.add(id);
  // Fetch the persisted tail once per row; reuse the cache after. Bail while a fetch is in flight so a fast
  // collapse/re-expand can't duplicate the request.
  if (logFetchedIds.has(id) || logLoadingIds.has(id)) return;
  logLoadingIds.add(id);
  // Snapshot the cache before awaiting; appendLogs may trim/front-shift it while the fetch is in flight.
  const before = logsById[id] !== undefined ? [...logsById[id]] : [];
  try {
    const tail = await (await tasksServerRpcObject).getTaskLogs(id);
    // Re-apply lines appended during the request so the persisted baseline does not overwrite them.
    const duringAwait = appendedSince(before, logsById[id] ?? []);
    logsById[id] = trimLogs([...tail, ...duringAwait]);
    logFetchedIds.add(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load logs";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to load logs", err);
  } finally {
    logLoadingIds.delete(id);
  }
}

async function handleRevealLog(id: string): Promise<void> {
  try {
    await (await tasksServerRpcObject).revealTaskLog(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reveal task log";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to reveal task log", err);
  }
}

async function saveMaxParallel(): Promise<void> {
  try {
    const value = normalizeMaxParallelInput(maxParallelInput.value);
    await (await configServerRpcObject).setJson(
      TASK_CENTER_CONFIG_KEY,
      taskCenterConfigSerializer.toJson({ maxParallel: value }),
    );
    maxParallelInput.value = value > 0 ? value : "";
    gMessageStore.pushMessage("success", "Concurrency limit saved.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save concurrency limit";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to save concurrency limit", err);
  }
}

function normalizeMaxParallelInput(value: number | ""): number {
  if (value === "") return 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("Max parallel must be 0 or a positive whole number.");
  }
  return value;
}

// Keep the return non-null while templates are still loading.
function templateForType(type: TaskType): TaskTemplate {
  const builtin = templates.value.find((item) => item.builtin && item.type === type);
  if (builtin !== undefined) return builtin;
  return {
    id: `builtin-${type}`,
    type,
    name: "Script",
    builtin: true,
  };
}

// Status progress order; only used to break updatedAt ties in upsertTask. Terminal states share a
// rank because they never transition into one another.
const STATUS_RANK: Record<TaskStatus, number> = {
  notStarted: 0,
  running: 1,
  succeeded: 2,
  failed: 2,
  abandoned: 2,
};

// Upsert by id, keeping the newer state by updatedAt (matches mergeSnapshot). createTask resolves a
// notStarted TaskInfo after the backend has already pushed running, so the stale notStarted must not
// overwrite the pushed running; a brand-new task (not yet local) is still added.
function upsertTask(task: TaskInfo): boolean {
  const index = tasks.value.findIndex((item) => item.id === task.id);
  if (index < 0) {
    tasks.value.push(task);
    return true;
  }
  const current = tasks.value[index];
  // Strictly newer updatedAt always wins (normal tasks.updated pushes increment it). On an exact
  // updatedAt tie, break by status progress so a create-reply notStarted can't roll back an
  // already-pushed running -- script tasks emit no TASK_UPDATED before their terminal state, so such
  // a rollback would never self-heal.
  const replace =
    task.updatedAt > current.updatedAt ||
    (task.updatedAt === current.updatedAt && STATUS_RANK[task.status] >= STATUS_RANK[current.status]);
  if (replace) tasks.value.splice(index, 1, task);
  return replace;
}

function handleTaskUpdated(task: TaskInfo): void {
  const isApplied = upsertTask(task);
  if (!isApplied
    || !isCompleteStatus(task.status)
    || completionNotifiedIds.has(task.id)) return;
  completionNotifiedIds.add(task.id);
  if (selectedCategory.value !== "complete") {
    unviewedCompletedIds.value = new Set([...unviewedCompletedIds.value, task.id]);
  }
  const message = taskCompletionMessage(task);
  gMessageStore.pushMessage(taskCompletionLevel(task.status), message);
  popupToast.value?.show(message);
}

function isCompleteStatus(status: TaskStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "abandoned";
}

function taskCompletionMessage(task: TaskInfo): string {
  switch (task.status) {
    case "succeeded": return `Task "${task.title}" completed successfully.`;
    case "failed": return `Task "${task.title}" failed.`;
    case "abandoned": return `Task "${task.title}" was abandoned.`;
    default: throw new Error("Task is not complete");
  }
}

function taskCompletionLevel(status: TaskStatus): "success" | "warning" | "error" {
  switch (status) {
    case "succeeded": return "success";
    case "failed": return "error";
    case "abandoned": return "warning";
    default: throw new Error("Task is not complete");
  }
}

// Extend cached logs, or seed the cache when the row hasn't been expanded yet, so increments
// broadcast while collapsed aren't dropped and show on first expand.
// Trimmed to the last MAX_INLINE_LOG_LINES so no task's inline cache grows unbounded.
function appendLogs(payload: TasksLogAppendedParams): void {
  const existing = logsById[payload.id];
  const merged = existing === undefined ? [...payload.lines] : [...existing, ...payload.lines];
  logsById[payload.id] = trimLogs(merged);
}

// Keep only the last MAX_INLINE_LOG_LINES entries.
function trimLogs(lines: string[]): string[] {
  return lines.length > MAX_INLINE_LOG_LINES ? lines.slice(lines.length - MAX_INLINE_LOG_LINES) : lines;
}

// Lines present in `after` beyond the trailing run of `before`. `after` is `before` (front-trimmed)
// plus newly appended lines, so the largest suffix of `before` matching the head of `after` marks the
// boundary; everything past it is the delta. Length indexes are unreliable once trimming shifts the
// array, so match by content.
function appendedSince(before: readonly string[], after: readonly string[]): string[] {
  const maxOverlap = Math.min(before.length, after.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    let matches = true;
    for (let i = 0; i < overlap; i++) {
      if (after[i] !== before[before.length - overlap + i]) {
        matches = false;
        break;
      }
    }
    if (matches) return after.slice(overlap);
  }
  return [...after];
}

// Drop deleted rows from the list; the push is the single source of truth so all sessions agree.
function removeTasks(payload: TasksDeletedPush): void {
  if (payload.ids.length === 0) return;
  const removal = new Set(payload.ids);
  if (isInitializing) for (const id of removal) deletedDuringInit.add(id);
  tasks.value = tasks.value.filter((task) => !removal.has(task.id));
  // Release per-task log/expansion caches so deleted ids don't linger in memory.
  for (const id of removal) {
    delete logsById[id];
    expandedIds.delete(id);
    logLoadingIds.delete(id);
    logFetchedIds.delete(id);
    completionNotifiedIds.delete(id);
  }
  unviewedCompletedIds.value = new Set(
    [...unviewedCompletedIds.value].filter((id) => !removal.has(id)),
  );
}

async function initialize(): Promise<void> {
  isInitializing = true;
  try {
    const [loadedTasks, loadedTemplates, configJson] = await Promise.all([
      (await tasksServerRpcObject).listTasks(),
      (await tasksServerRpcObject).listTaskTemplates(),
      (await configServerRpcObject).getJson(TASK_CENTER_CONFIG_KEY),
    ]);
    const config = taskCenterConfigSerializer.fromJson(configJson);
    tasks.value = mergeSnapshot(loadedTasks);
    templates.value = loadedTemplates;
    maxParallelInput.value = config.maxParallel > 0 ? config.maxParallel : "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load task center";
    gMessageStore.pushMessage("error", message);
    console.error("[taskCenter] failed to initialize", err);
  } finally {
    isInitializing = false;
    deletedDuringInit.clear();
  }
}

// Merge the initial snapshot with rows already pushed during the await: keep the newer state by
// updatedAt so a task pushed running isn't rolled back to the snapshot's notStarted, and skip any id
// deleted while the snapshot was in flight so it isn't revived.
function mergeSnapshot(loadedTasks: readonly TaskInfo[]): TaskInfo[] {
  const merged = new Map<string, TaskInfo>();
  for (const task of loadedTasks) merged.set(task.id, task);
  for (const local of tasks.value) {
    const snapshot = merged.get(local.id);
    if (snapshot === undefined || local.updatedAt >= snapshot.updatedAt) merged.set(local.id, local);
  }
  for (const id of deletedDuringInit) merged.delete(id);
  return [...merged.values()];
}

onMounted(() => {
  unsubscribeUpdated = gTaskUpdatedCenter.registerEventHandler(TASK_UPDATED_EVENT, handleTaskUpdated);
  unsubscribeLogAppended = gTaskLogAppendedCenter.registerEventHandler(
    TASK_LOG_APPENDED_EVENT,
    appendLogs,
  );
  unsubscribeDeleted = gTaskDeletedCenter.registerEventHandler(TASK_DELETED_EVENT, removeTasks);
  void initialize();
});

onUnmounted(() => {
  unsubscribeUpdated?.();
  unsubscribeLogAppended?.();
  unsubscribeDeleted?.();
});
</script>

<template>
  <article class="task-center">
    <PopupToast ref="popupToast" />
    <header class="task-center__header">
      <h1 class="task-center__title">Task Center</h1>
      <form class="task-center__limit" @submit.prevent>
        <label class="task-center__limit-label" for="task-center-max-parallel">
          Max parallel:
        </label>
        <input
          id="task-center-max-parallel"
          v-model.number="maxParallelInput"
          class="task-center__limit-input"
          type="number"
          min="0"
          inputmode="numeric"
          placeholder="0"
          aria-describedby="task-center-limit-hint"
          @change="saveMaxParallel"
        />
        <span id="task-center-limit-hint" class="task-center__limit-hint">
          0 or empty = unlimited
        </span>
      </form>
    </header>

    <div
      class="task-center__tabs"
      role="tablist"
      aria-label="Task category"
      @keydown="onTabKeydown"
    >
      <button
        v-for="tab in CATEGORY_TABS"
        :id="`task-tab-${tab.value}`"
        :key="tab.value"
        :ref="(el) => setTabRef(tab.value, el)"
        type="button"
        class="task-center__tab"
        :class="{ 'is-active': selectedCategory === tab.value }"
        role="tab"
        :aria-selected="selectedCategory === tab.value"
        :aria-controls="`task-panel-${tab.value}`"
        :tabindex="selectedCategory === tab.value ? 0 : -1"
        @click="selectCategory(tab.value)"
      >
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.value === 'complete' && unviewedCompletedCount > 0"
          class="task-center__tab-badge"
          :aria-label="`${unviewedCompletedCount} newly completed tasks`"
        >{{ unviewedCompletedCount > 99 ? "99+" : unviewedCompletedCount }}</span>
      </button>
    </div>

    <div class="task-center__body">
      <TemplateSidebar
        v-show="selectedCategory === 'active'"
        :templates="templates"
        :is-collapsed="isSidebarCollapsed"
        @select="selectTemplate"
        @delete="handleDeleteTemplate"
        @toggle-collapse="toggleSidebar"
      />

      <div class="task-center__main">
        <PersistentStack
          :entries="categoryPanels"
          :active-key="selectedCategory"
          :get-entry-key="(entry) => entry.tab.value"
        >
          <template #default="{ entry }">
            <section
              :id="`task-panel-${entry.tab.value}`"
              class="task-center__panel"
              role="tabpanel"
              :aria-labelledby="`task-tab-${entry.tab.value}`"
              tabindex="0"
            >
              <TaskList
                :tasks="entry.tasks"
                :expanded-ids="expandedIds"
                :logs-by-id="logsById"
                :log-loading-ids="logLoadingIds"
                :empty-label="entry.tab.emptyLabel"
                :filter-id="`task-filter-${entry.tab.value}`"
                :is-selectable="entry.tab.value === 'complete'"
                :unviewed-ids="entry.tab.value === 'complete' ? unviewedCompletedIds : new Set()"
                @stop="handleStop"
                @toggle="handleToggle"
                @run-new="handleRunNew"
                @delete="handleDelete"
                @pin="handlePin"
                @reveal-log="handleRevealLog"
                @viewed="markTaskViewed"
                @mark-all-viewed="markAllTasksViewed"
              />
            </section>
          </template>
        </PersistentStack>
      </div>
    </div>

    <TaskCreateForm
      v-if="activeTemplate"
      :key="activeTemplate.id"
      ref="taskCreateForm"
      :template="activeTemplate"
      :initial-params="formInitialParams ?? undefined"
      :is-submitting="isSubmitting"
      @submit="handleCreate"
      @save-template="handleSaveTemplate"
      @clone-template="handleCloneTemplate"
      @delete-template="handleDeleteTemplate"
      @close="requestCloseForm"
    />

  </article>
</template>

<style scoped>
.task-center {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: var(--space-6);
}

.task-center__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex: none;
  flex-wrap: wrap;
}

.task-center__title {
  margin: 0;
  font-size: 24px;
}

.task-center__limit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.task-center__limit-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.task-center__limit-input {
  width: 80px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.task-center__limit-input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-center__limit-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.task-center__tabs {
  display: flex;
  gap: var(--space-1);
  flex: none;
  border-bottom: 1px solid var(--color-border);
}

.task-center__tab {
  padding: var(--space-2) var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.task-center__tab:hover {
  color: var(--color-text);
}

.task-center__tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.task-center__tab.is-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 500;
}

.task-center__tab-badge {
  min-width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--space-1);
  color: var(--color-text-on-danger);
  background: var(--color-danger);
  border-radius: var(--radius-large);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

/* Height chain: .task-center is 100% height; body flexes and main caps at min-height:0 so only each TaskList scrolls. */
.task-center__body {
  display: flex;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
}

.task-center__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.task-center__panel {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.task-center__panel:focus-visible {
  outline: none;
}
</style>

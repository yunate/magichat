<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import type { CSSProperties } from "vue";
import type {
  FileOccupancyClientRpcApi,
  FileOccupancyQueryResult,
  FileOccupancyServerRpcApi,
  FileOccupyingProcess,
} from "../../../../../../../../common/fileOccupancy";
import type { RemoteObject } from "../../../../../../../../common/ipc_bridge/rpc";
import ContextMenu from "../../../../../../components/ContextMenu.vue";
import { confirmDialog } from "../../../../../../components/confirmDialog";
import type {
  ContextMenuArea,
  ContextMenuPosition,
} from "../../../../../../components/contextMenuTypes";
import { gMessageStore } from "../../../../../../messages/messageStore";
import {
  createFileOccupancyServerRpcObject,
  destroyFileOccupancyServerRpcObject,
} from "../../../../../../bridge/remote_rpc_objects/fileOccupancy";
import { gMainApplication } from "../../../../main";

type ProcessMenuState = Readonly<{
  kind: "process";
  process: FileOccupyingProcess;
  position: ContextMenuPosition;
  area: ContextMenuArea;
}>;

type GroupMenuState = Readonly<{
  kind: "group";
  targetPath: string;
  processes: readonly FileOccupyingProcess[];
  position: ContextMenuPosition;
  area: ContextMenuArea;
}>;

type MenuState = ProcessMenuState | GroupMenuState;

type ColumnDefinition = Readonly<{
  key: string;
  label: string;
  initialWidth: number;
  minimumWidth: number;
}>;

type ColumnResizeStart = Readonly<{
  index: number;
  pointerX: number;
  tableWidth: number;
  firstWidth: number;
  secondWidth: number;
}>;

const COLUMNS: readonly ColumnDefinition[] = [
  { key: "process", label: "Process", initialWidth: 14, minimumWidth: 96 },
  { key: "pid", label: "PID", initialWidth: 7, minimumWidth: 64 },
  { key: "command", label: "Command Line", initialWidth: 43, minimumWidth: 180 },
  { key: "user", label: "User", initialWidth: 15, minimumWidth: 100 },
  { key: "session", label: "Session", initialWidth: 7, minimumWidth: 72 },
  { key: "started", label: "Started", initialWidth: 14, minimumWidth: 130 },
];
const COLUMN_KEYBOARD_STEP = 8;
const PROCESS_CHECK_INTERVAL_MS = 1000;

const root = useTemplateRef<HTMLElement>("root");
const columnTable = useTemplateRef<HTMLTableElement>("columnTable");
const target = ref("");
const processes = ref<readonly FileOccupyingProcess[]>([]);
const error = ref("");
const isInitializing = ref(true);
const isQuerying = ref(false);
const isCanceling = ref(false);
const hasCompletedQuery = ref(false);
const terminatingProcessId = ref<number | null>(null);
const menu = ref<MenuState | null>(null);
const columnWidths = ref(COLUMNS.map((column) => column.initialWidth));
const columnStyles = computed<readonly CSSProperties[]>(() => columnWidths.value
  .map((width) => ({ width: `${width}%` })));
let remoteObject: RemoteObject<FileOccupancyServerRpcApi> | null = null;
let isMounted = false;
let columnResizeStart: ColumnResizeStart | null = null;
let previousBodyCursor = "";
let previousBodyUserSelect = "";
let processCheckTimer: ReturnType<typeof setTimeout> | null = null;
let processCheckRevision = 0;

const statusText = computed(() => {
  if (isInitializing.value) return "Connecting";
  if (isCanceling.value) return "Canceling";
  if (isQuerying.value) return "Finding processes";
  if (error.value !== "") return error.value;
  if (processes.value.length === 0) {
    return hasCompletedQuery.value
      ? "No occupying processes found"
      : "Enter a path or file name to start";
  }
  return `${processes.value.length} occupying processes found`;
});

const processGroups = computed(() => {
  const groups = new Map<string, FileOccupyingProcess[]>();
  for (const process of processes.value) {
    const group = groups.get(process.targetPath);
    if (group === undefined) groups.set(process.targetPath, [process]);
    else group.push(process);
  }
  return [...groups.entries()]
    .map(([targetPath, groupProcesses]) => ({ targetPath, processes: groupProcesses }))
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
});

const notifier: FileOccupancyClientRpcApi = {
  queryCompleted(result: FileOccupancyQueryResult): void {
    if (!isMounted) return;
    stopProcessChecks();
    isQuerying.value = false;
    isCanceling.value = false;
    error.value = "";
    processes.value = result.status === "completed" ? result.processes : [];
    hasCompletedQuery.value = result.status === "completed";
    scheduleProcessCheck();
    if (result.status === "canceled") gMessageStore.pushMessage("info", "File occupancy query canceled.");
  },
  queryFailed(message: string): void {
    if (!isMounted) return;
    stopProcessChecks();
    isQuerying.value = false;
    isCanceling.value = false;
    error.value = message;
    gMessageStore.pushMessage("error", message);
  },
};

async function initialize(): Promise<void> {
  try {
    remoteObject = await createFileOccupancyServerRpcObject(
      gMainApplication.window.getPeer(),
      notifier,
    );
  } catch (caughtError: unknown) {
    error.value = errorMessage(caughtError);
  } finally {
    isInitializing.value = false;
  }
}

async function startQuery(): Promise<void> {
  const normalizedTarget = target.value.trim();
  if (remoteObject === null || isQuerying.value || normalizedTarget === "") return;
  error.value = "";
  stopProcessChecks();
  processes.value = [];
  hasCompletedQuery.value = false;
  isQuerying.value = true;
  try {
    await remoteObject.startQuery(normalizedTarget);
  } catch (caughtError: unknown) {
    isQuerying.value = false;
    error.value = errorMessage(caughtError);
  }
}

async function cancelQuery(): Promise<void> {
  if (remoteObject === null || !isQuerying.value || isCanceling.value) return;
  isCanceling.value = true;
  try {
    await remoteObject.cancelQuery();
  } catch (caughtError: unknown) {
    isCanceling.value = false;
    error.value = errorMessage(caughtError);
  }
}

function openMenu(event: MouseEvent | KeyboardEvent, process: FileOccupyingProcess): void {
  event.preventDefault();
  const anchor = contextMenuAnchor(event);
  if (anchor === null) return;
  menu.value = {
    kind: "process",
    process,
    ...anchor,
  };
}

function openGroupMenu(
  event: MouseEvent | KeyboardEvent,
  group: { targetPath: string; processes: readonly FileOccupyingProcess[] },
): void {
  event.preventDefault();
  const anchor = contextMenuAnchor(event);
  if (anchor === null) return;
  menu.value = {
    kind: "group",
    targetPath: group.targetPath,
    processes: group.processes,
    ...anchor,
  };
}

function contextMenuAnchor(
  event: MouseEvent | KeyboardEvent,
): Readonly<{ position: ContextMenuPosition; area: ContextMenuArea }> | null {
  const bounds = root.value?.getBoundingClientRect();
  if (bounds === undefined) return null;
  let position: ContextMenuPosition;
  if (event instanceof MouseEvent) {
    position = { x: event.clientX, y: event.clientY };
  } else {
    const element = event.currentTarget;
    if (!(element instanceof HTMLElement)) return null;
    const elementBounds = element.getBoundingClientRect();
    position = { x: elementBounds.left + 24, y: elementBounds.top + elementBounds.height / 2 };
  }
  return {
    position,
    area: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
  };
}

function onRowKeydown(event: KeyboardEvent, process: FileOccupyingProcess): void {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    openMenu(event, process);
  }
}

function onGroupKeydown(
  event: KeyboardEvent,
  group: { targetPath: string; processes: readonly FileOccupyingProcess[] },
): void {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    openGroupMenu(event, group);
  }
}

async function terminateSelectedProcess(): Promise<void> {
  const currentMenu = menu.value;
  menu.value = null;
  if (currentMenu?.kind !== "process") return;
  const process = currentMenu.process;
  if (process.startedAt === null
    || process.executablePath === null
    || remoteObject === null) return;
  const action = await confirmDialog({
    title: "Terminate Occupying Process Tree",
    descriptions: [
      "The process and all of its child processes will be forcibly terminated using the administrator privileges granted to this MagicHat session.",
      "Unsaved data in the process tree may be lost.",
    ],
    details: [
      { id: "process", label: `${process.name} (PID ${process.pid})` },
    ],
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "terminate", label: "Terminate Process Tree", appearance: "primary" },
    ],
    cancelActionId: "cancel",
  });
  if (action !== "terminate") return;
  terminatingProcessId.value = process.pid;
  try {
    const result = await remoteObject.terminateProcessTree({
      pid: process.pid,
      targetPath: process.targetPath,
      startedAt: process.startedAt,
      executablePath: process.executablePath,
    });
    if (result.status !== "stale") {
      processes.value = processes.value.filter((item) => item.pid !== process.pid);
    }
    const message = result.status === "terminated"
      ? `Process tree ${process.name} (${process.pid}) was terminated.`
      : result.status === "alreadyExited"
        ? `Process ${process.name} (${process.pid}) has already exited.`
        : `Process ${process.name} (${process.pid}) changed identity and was not terminated.`;
    gMessageStore.pushMessage(result.status === "stale" ? "warning" : "success", message);
  } catch (caughtError: unknown) {
    gMessageStore.pushMessage("error", errorMessage(caughtError));
  } finally {
    terminatingProcessId.value = null;
  }
}

async function terminateSelectedGroup(): Promise<void> {
  const currentMenu = menu.value;
  menu.value = null;
  if (currentMenu?.kind !== "group" || remoteObject === null) return;
  const terminableProcesses = currentMenu.processes.filter((process) => (
    process.startedAt !== null && process.executablePath !== null
  ));
  if (terminableProcesses.length === 0) return;
  const action = await confirmDialog({
    title: "Terminate All Occupying Process Trees",
    descriptions: [
      "Each process and all of its child processes will be forcibly terminated using the administrator privileges granted to this MagicHat session.",
      "Unsaved data in these process trees may be lost.",
    ],
    details: [
      { id: "target", label: currentMenu.targetPath },
      { id: "count", label: `${terminableProcesses.length} processes` },
    ],
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "terminate", label: "Terminate All Trees", appearance: "primary" },
    ],
    cancelActionId: "cancel",
  });
  if (action !== "terminate") return;

  let terminatedCount = 0;
  let alreadyExitedCount = 0;
  let staleCount = 0;
  try {
    for (const process of terminableProcesses) {
      if (process.startedAt === null || process.executablePath === null) continue;
      terminatingProcessId.value = process.pid;
      const result = await remoteObject.terminateProcessTree({
        pid: process.pid,
        targetPath: process.targetPath,
        startedAt: process.startedAt,
        executablePath: process.executablePath,
      });
      if (result.status === "stale") {
        staleCount += 1;
        continue;
      }
      if (result.status === "terminated") terminatedCount += 1;
      else alreadyExitedCount += 1;
      processes.value = processes.value.filter((item) => item.pid !== process.pid);
    }
    const message = `${terminatedCount} process trees were terminated; ${alreadyExitedCount} had already exited; ${staleCount} changed identity.`;
    gMessageStore.pushMessage(staleCount === 0 ? "success" : "warning", message);
  } catch (caughtError: unknown) {
    gMessageStore.pushMessage("error", errorMessage(caughtError));
  } finally {
    terminatingProcessId.value = null;
  }
}

function hasTerminableProcess(groupProcesses: readonly FileOccupyingProcess[]): boolean {
  return groupProcesses.some((process) => (
    process.startedAt !== null && process.executablePath !== null
  ));
}

function formatStartedAt(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "File occupancy operation failed.";
}

function dismissMenu(): void {
  menu.value = null;
}

function scheduleProcessCheck(): void {
  if (!isMounted || processCheckTimer !== null || processes.value.length === 0) return;
  const revision = processCheckRevision;
  processCheckTimer = setTimeout(() => {
    processCheckTimer = null;
    void checkExistingProcesses(revision);
  }, PROCESS_CHECK_INTERVAL_MS);
}

async function checkExistingProcesses(revision: number): Promise<void> {
  const object = remoteObject;
  if (!isMounted || revision !== processCheckRevision || object === null) return;
  const processIds = [...new Set(processes.value.map((process) => process.pid))];
  if (processIds.length === 0) return;
  try {
    const existingProcessIds = new Set(await object.getExistingProcessIds(processIds));
    if (!isMounted || revision !== processCheckRevision) return;
    processes.value = processes.value.filter((process) => existingProcessIds.has(process.pid));
    scheduleProcessCheck();
  } catch (caughtError: unknown) {
    if (!isMounted || revision !== processCheckRevision) return;
    error.value = errorMessage(caughtError);
    gMessageStore.pushMessage("error", error.value);
  }
}

function stopProcessChecks(): void {
  processCheckRevision += 1;
  if (processCheckTimer !== null) clearTimeout(processCheckTimer);
  processCheckTimer = null;
}

function startColumnResize(index: number, event: PointerEvent): void {
  if (event.button !== 0) return;
  const tableWidth = columnTable.value?.getBoundingClientRect().width ?? 0;
  if (tableWidth <= 0 || COLUMNS[index + 1] === undefined) return;
  event.preventDefault();
  columnResizeStart = {
    index,
    pointerX: event.clientX,
    tableWidth,
    firstWidth: columnWidths.value[index],
    secondWidth: columnWidths.value[index + 1],
  };
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeColumnByPointer);
  window.addEventListener("pointerup", stopColumnResize);
  window.addEventListener("pointercancel", stopColumnResize);
}

function resizeColumnByPointer(event: PointerEvent): void {
  const start = columnResizeStart;
  if (start === null) return;
  resizeColumns(start, event.clientX - start.pointerX);
}

function resizeColumnByKey(index: number, event: KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tableWidth = columnTable.value?.getBoundingClientRect().width ?? 0;
  if (tableWidth <= 0 || COLUMNS[index + 1] === undefined) return;
  event.preventDefault();
  resizeColumns({
    index,
    pointerX: 0,
    tableWidth,
    firstWidth: columnWidths.value[index],
    secondWidth: columnWidths.value[index + 1],
  }, event.key === "ArrowLeft" ? -COLUMN_KEYBOARD_STEP : COLUMN_KEYBOARD_STEP);
}

function resizeColumns(start: ColumnResizeStart, deltaPixels: number): void {
  const firstColumn = COLUMNS[start.index];
  const secondColumn = COLUMNS[start.index + 1];
  if (firstColumn === undefined || secondColumn === undefined) return;
  const combinedWidth = start.firstWidth + start.secondWidth;
  const minimumFirstWidth = firstColumn.minimumWidth / start.tableWidth * 100;
  const minimumSecondWidth = secondColumn.minimumWidth / start.tableWidth * 100;
  const nextFirstWidth = Math.min(
    combinedWidth - minimumSecondWidth,
    Math.max(minimumFirstWidth, start.firstWidth + deltaPixels / start.tableWidth * 100),
  );
  const nextWidths = [...columnWidths.value];
  nextWidths[start.index] = nextFirstWidth;
  nextWidths[start.index + 1] = combinedWidth - nextFirstWidth;
  columnWidths.value = nextWidths;
}

function stopColumnResize(): void {
  if (columnResizeStart === null) return;
  columnResizeStart = null;
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  window.removeEventListener("pointermove", resizeColumnByPointer);
  window.removeEventListener("pointerup", stopColumnResize);
  window.removeEventListener("pointercancel", stopColumnResize);
}

onMounted(() => {
  isMounted = true;
  window.addEventListener("pointerdown", dismissMenu);
  void initialize();
});

onUnmounted(() => {
  isMounted = false;
  stopProcessChecks();
  stopColumnResize();
  window.removeEventListener("pointerdown", dismissMenu);
  const object = remoteObject;
  remoteObject = null;
  if (object !== null) {
    void object.cancelQuery()
      .catch((): void => undefined)
      .then(() => destroyFileOccupancyServerRpcObject(object));
  }
});
</script>

<template>
  <section ref="root" class="file-occupancy">
    <header class="file-occupancy__header">
      <div>
        <h1>File Occupancy</h1>
        <p>Find processes using a path, file name, or path fragment.</p>
      </div>
      <span class="file-occupancy__status" :class="{ 'is-error': error !== '' }">{{ statusText }}</span>
    </header>

    <form class="file-occupancy__form" @submit.prevent="startQuery">
      <label for="file-occupancy-target">File Path or Name</label>
      <div class="file-occupancy__controls">
        <input
          id="file-occupancy-target"
          v-model="target"
          type="text"
          maxlength="4096"
          autocomplete="off"
          placeholder="For example, app.log or C:\data\app.log"
          :disabled="isQuerying || isInitializing"
        />
        <button
          v-if="!isQuerying"
          type="submit"
          class="file-occupancy__primary"
          :disabled="isInitializing || target.trim() === ''"
        >Search</button>
        <button
          v-else
          type="button"
          :disabled="isCanceling"
          @click="cancelQuery"
        >{{ isCanceling ? "Canceling" : "Cancel" }}</button>
      </div>
    </form>

    <div class="file-occupancy__results">
      <div v-if="isQuerying" class="file-occupancy__empty">Searching. You can cancel at any time.</div>
      <div v-else-if="processes.length === 0" class="file-occupancy__empty">
        {{ error !== ""
          ? "Query incomplete"
          : hasCompletedQuery
            ? "No occupying processes found"
            : "No results" }}
      </div>
      <div v-else class="file-occupancy__groups">
        <table ref="columnTable" class="file-occupancy__columns">
          <colgroup>
            <col
              v-for="(column, index) in COLUMNS"
              :key="column.key"
              :style="columnStyles[index]"
            />
          </colgroup>
          <thead>
            <tr>
              <th v-for="(column, index) in COLUMNS" :key="column.key">
                {{ column.label }}
                <span
                  v-if="index < COLUMNS.length - 1"
                  class="file-occupancy__column-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="`Resize ${column.label} column`"
                  tabindex="0"
                  @pointerdown="startColumnResize(index, $event)"
                  @keydown="resizeColumnByKey(index, $event)"
                ></span>
              </th>
            </tr>
          </thead>
        </table>
        <details
          v-for="group in processGroups"
          :key="group.targetPath"
          class="file-occupancy__group"
          open
        >
          <summary
            class="file-occupancy__group-summary"
            @contextmenu.prevent="openGroupMenu($event, group)"
            @keydown="onGroupKeydown($event, group)"
          >
            <ChevronRight class="file-occupancy__group-chevron" :size="16" :stroke-width="1.75" aria-hidden="true" />
            <span class="file-occupancy__target-title">{{ group.targetPath }}</span>
            <span class="file-occupancy__target-count">
              {{ group.processes.length }} {{ group.processes.length === 1 ? "process" : "processes" }}
            </span>
          </summary>
          <table :aria-label="`Processes occupying ${group.targetPath}`">
            <colgroup>
              <col
                v-for="(column, index) in COLUMNS"
                :key="column.key"
                :style="columnStyles[index]"
              />
            </colgroup>
            <tbody>
              <tr
                v-for="process in group.processes"
                :key="`${process.pid}-${process.startedAt}`"
                class="file-occupancy__process-row"
                tabindex="0"
                :class="{ 'is-busy': terminatingProcessId === process.pid }"
                @contextmenu.prevent="openMenu($event, process)"
                @keydown="onRowKeydown($event, process)"
              >
                <td class="file-occupancy__name" :title="process.name">{{ process.name }}</td>
                <td>{{ process.pid }}</td>
                <td class="file-occupancy__long" :title="process.commandLine ?? undefined">{{ process.commandLine ?? "-" }}</td>
                <td>{{ process.owner ?? "-" }}</td>
                <td>{{ process.sessionId ?? "-" }}</td>
                <td>{{ formatStartedAt(process.startedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </div>

    <ContextMenu v-if="menu" :position="menu.position" :area="menu.area">
      <button
        v-if="menu.kind === 'process'"
        type="button"
        role="menuitem"
        class="is-danger"
        :disabled="menu.process.startedAt === null
          || menu.process.executablePath === null
          || terminatingProcessId !== null"
        @click="terminateSelectedProcess"
      >Terminate Process Tree</button>
      <button
        v-else
        type="button"
        role="menuitem"
        class="is-danger"
        :disabled="!hasTerminableProcess(menu.processes) || terminatingProcessId !== null"
        @click="terminateSelectedGroup"
      >Terminate All Process Trees</button>
    </ContextMenu>
  </section>
</template>

<style scoped>
.file-occupancy {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.file-occupancy__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.file-occupancy__header h1 { margin: 0 0 var(--space-1); font-size: 22px; }
.file-occupancy__header p { margin: 0; color: var(--color-text-muted); font-size: 13px; }

.file-occupancy__status {
  max-width: 45%;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: right;
}

.file-occupancy__status.is-error { color: var(--color-danger); }
.file-occupancy__form { display: grid; gap: var(--space-2); }
.file-occupancy__form label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
.file-occupancy__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }

.file-occupancy__controls input,
.file-occupancy__controls button {
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  color: var(--color-text);
  background: var(--color-surface);
  font: inherit;
}

.file-occupancy__controls input { min-width: 0; padding: 0 var(--space-3); }
.file-occupancy__controls button { padding: 0 var(--space-4); cursor: pointer; }
.file-occupancy__controls button:hover:not(:disabled) { background: var(--color-surface-raised); }
.file-occupancy__controls .file-occupancy__primary {
  border-color: var(--color-primary);
  color: var(--color-bg);
  background: var(--color-primary);
  font-weight: 600;
}
.file-occupancy__controls .file-occupancy__primary:hover:not(:disabled) {
  border-color: var(--color-primary-emphasis);
  background: var(--color-primary-emphasis);
}
.file-occupancy__controls button:active:not(:disabled) { transform: translateY(1px); }
.file-occupancy__controls button:focus-visible,
.file-occupancy__controls input:focus-visible,
.file-occupancy__results tr:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.file-occupancy__controls button:disabled { opacity: 0.55; cursor: not-allowed; }

.file-occupancy__results {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  overflow: hidden;
  background: var(--color-surface);
}

.file-occupancy__empty { height: 100%; display: grid; place-items: center; color: var(--color-text-muted); font-size: 13px; }
.file-occupancy__groups { --file-occupancy-result-indent: calc(var(--space-6) + var(--space-2)); height: 100%; padding: var(--space-1); overflow: auto; }
.file-occupancy__columns { position: sticky; top: calc(-1 * var(--space-1)); z-index: 1; min-width: calc(1080px - var(--file-occupancy-result-indent)); }
.file-occupancy__group { min-width: 1080px; }
.file-occupancy__group + .file-occupancy__group { margin-top: var(--space-1); }
.file-occupancy__group-summary { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 44px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-small); color: var(--color-text); background: var(--color-surface); cursor: pointer; list-style: none; }
.file-occupancy__group-summary::-webkit-details-marker { display: none; }
.file-occupancy__group-summary:hover { background: var(--color-surface-raised); }
.file-occupancy__group-summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.file-occupancy__group-chevron { color: var(--color-text-muted); transition: transform 0.15s ease; }
.file-occupancy__group[open] .file-occupancy__group-chevron { transform: rotate(90deg); }
.file-occupancy table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
.file-occupancy .file-occupancy__columns,
.file-occupancy__group > table { width: calc(100% - var(--file-occupancy-result-indent)); margin-inline-start: var(--file-occupancy-result-indent); }
.file-occupancy thead th { position: relative; padding: var(--space-2); color: var(--color-text-muted); background: var(--color-surface); text-align: left; }
.file-occupancy__column-resizer { position: absolute; z-index: 2; top: 0; right: -4px; bottom: 0; width: 8px; cursor: col-resize; touch-action: none; }
.file-occupancy__column-resizer::before { position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: color-mix(in srgb, var(--color-divider) 70%, transparent); content: ""; transform: translateX(-50%); }
.file-occupancy__column-resizer:hover::before,
.file-occupancy__column-resizer:focus-visible::before { background: var(--color-divider); }
.file-occupancy__column-resizer:focus-visible { outline: 0; }
.file-occupancy td { overflow: hidden; padding: var(--space-2); text-overflow: ellipsis; white-space: nowrap; }
.file-occupancy__target-title { overflow-wrap: anywhere; font-size: 12px; font-weight: 600; line-height: 1.4; }
.file-occupancy__target-count { color: var(--color-text-muted); font-size: 12px; font-weight: 400; white-space: nowrap; }
.file-occupancy__process-row:hover { background: color-mix(in srgb, var(--color-primary) 7%, transparent); }
.file-occupancy tbody tr.is-busy { opacity: 0.55; }
.file-occupancy__name { font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .file-occupancy__group-chevron { transition: none; }
}

@media (max-width: 720px) {
  .file-occupancy { padding: var(--space-4); }
  .file-occupancy__header { align-items: flex-start; flex-direction: column; }
  .file-occupancy__status { max-width: 100%; text-align: left; }
}
</style>
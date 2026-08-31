<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
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

type MenuState = Readonly<{
  process: FileOccupyingProcess;
  position: ContextMenuPosition;
  area: ContextMenuArea;
}>;

const root = useTemplateRef<HTMLElement>("root");
const target = ref("");
const processes = ref<readonly FileOccupyingProcess[]>([]);
const error = ref("");
const isInitializing = ref(true);
const isQuerying = ref(false);
const isCanceling = ref(false);
const hasCompletedQuery = ref(false);
const terminatingProcessId = ref<number | null>(null);
const menu = ref<MenuState | null>(null);
let remoteObject: RemoteObject<FileOccupancyServerRpcApi> | null = null;
let isMounted = false;

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

const notifier: FileOccupancyClientRpcApi = {
  queryCompleted(result: FileOccupancyQueryResult): void {
    if (!isMounted) return;
    isQuerying.value = false;
    isCanceling.value = false;
    error.value = "";
    processes.value = result.status === "completed" ? result.processes : [];
    hasCompletedQuery.value = result.status === "completed";
    if (result.status === "canceled") gMessageStore.pushMessage("info", "File occupancy query canceled.");
  },
  queryFailed(message: string): void {
    if (!isMounted) return;
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
  const bounds = root.value?.getBoundingClientRect();
  if (bounds === undefined) return;
  let position: ContextMenuPosition;
  if (event instanceof MouseEvent) {
    position = { x: event.clientX, y: event.clientY };
  } else {
    const element = event.currentTarget;
    if (!(element instanceof HTMLElement)) return;
    const rowBounds = element.getBoundingClientRect();
    position = { x: rowBounds.left + 24, y: rowBounds.top + rowBounds.height / 2 };
  }
  menu.value = {
    process,
    position,
    area: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
  };
}

function onRowKeydown(event: KeyboardEvent, process: FileOccupyingProcess): void {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    openMenu(event, process);
  }
}

async function terminateSelectedProcess(): Promise<void> {
  const process = menu.value?.process;
  menu.value = null;
  if (process === undefined
    || process.startedAt === null
    || process.executablePath === null
    || remoteObject === null) return;
  const action = await confirmDialog({
    title: "Terminate Occupying Process",
    descriptions: [
      "The process will be forcibly terminated using the administrator privileges granted to this MagicHat session.",
      "Unsaved data in the process may be lost.",
    ],
    details: [
      { id: "process", label: `${process.name} (PID ${process.pid})` },
    ],
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "terminate", label: "Terminate Process", appearance: "primary" },
    ],
    cancelActionId: "cancel",
  });
  if (action !== "terminate") return;
  terminatingProcessId.value = process.pid;
  try {
    const result = await remoteObject.terminateProcess({
      pid: process.pid,
      startedAt: process.startedAt,
      executablePath: process.executablePath,
    });
    processes.value = processes.value.filter((item) => item.pid !== process.pid);
    const message = result.status === "terminated"
      ? `Process ${process.name} (${process.pid}) was terminated.`
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

onMounted(() => {
  isMounted = true;
  window.addEventListener("pointerdown", dismissMenu);
  void initialize();
});

onUnmounted(() => {
  isMounted = false;
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
      <div v-else class="file-occupancy__table-wrap">
        <table>
          <colgroup>
            <col class="file-occupancy__column-process" />
            <col class="file-occupancy__column-pid" />
            <col class="file-occupancy__column-user" />
            <col class="file-occupancy__column-session" />
            <col class="file-occupancy__column-started" />
            <col class="file-occupancy__column-executable" />
            <col class="file-occupancy__column-command" />
          </colgroup>
          <thead>
            <tr><th>Process</th><th>PID</th><th>User</th><th>Session</th><th>Started</th><th>Executable</th><th>Command Line</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="process in processes"
              :key="`${process.pid}-${process.startedAt}`"
              tabindex="0"
              :class="{ 'is-busy': terminatingProcessId === process.pid }"
              @contextmenu.prevent="openMenu($event, process)"
              @keydown="onRowKeydown($event, process)"
            >
              <td class="file-occupancy__name" :title="process.name">{{ process.name }}</td>
              <td>{{ process.pid }}</td>
              <td>{{ process.owner ?? "-" }}</td>
              <td>{{ process.sessionId ?? "-" }}</td>
              <td>{{ formatStartedAt(process.startedAt) }}</td>
              <td class="file-occupancy__long" :title="process.executablePath ?? undefined">{{ process.executablePath ?? "-" }}</td>
              <td class="file-occupancy__long" :title="process.commandLine ?? undefined">{{ process.commandLine ?? "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ContextMenu v-if="menu" :position="menu.position" :area="menu.area">
      <button
        type="button"
        role="menuitem"
        class="is-danger"
        :disabled="menu.process.startedAt === null
          || menu.process.executablePath === null
          || terminatingProcessId !== null"
        @click="terminateSelectedProcess"
      >Terminate Process</button>
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
  border-radius: var(--radius-large);
  overflow: hidden;
  background: var(--color-surface);
}

.file-occupancy__empty { height: 100%; display: grid; place-items: center; color: var(--color-text-muted); font-size: 13px; }
.file-occupancy__table-wrap { height: 100%; overflow: auto; }
.file-occupancy table { width: 100%; min-width: 1080px; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
.file-occupancy__column-process { width: 14%; }
.file-occupancy__column-pid { width: 7%; }
.file-occupancy__column-user { width: 15%; }
.file-occupancy__column-session { width: 7%; }
.file-occupancy__column-started { width: 14%; }
.file-occupancy__column-executable { width: 20%; }
.file-occupancy__column-command { width: 23%; }
.file-occupancy th { position: sticky; top: 0; z-index: 1; padding: var(--space-2); border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); background: var(--color-surface-raised); text-align: left; }
.file-occupancy td { overflow: hidden; padding: var(--space-2); border-bottom: 1px solid var(--color-border); text-overflow: ellipsis; white-space: nowrap; }
.file-occupancy tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 7%, transparent); }
.file-occupancy tbody tr.is-busy { opacity: 0.55; }
.file-occupancy__name { font-weight: 600; }

@media (max-width: 720px) {
  .file-occupancy { padding: var(--space-4); }
  .file-occupancy__header { align-items: flex-start; flex-direction: column; }
  .file-occupancy__status { max-width: 100%; text-align: left; }
}
</style>
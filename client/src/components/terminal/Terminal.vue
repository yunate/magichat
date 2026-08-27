<script setup lang="ts">
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XtermTerminal, type IDisposable } from "@xterm/xterm";
import { onBeforeUnmount, useTemplateRef } from "vue";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type { TerminalRunRequest, TerminalServerRpcApi, TerminalType } from "../../../../common/terminal";
import {
  createTerminalRuntime,
  destroyTerminalRuntime,
} from "../../bridge/remote_rpc_objects/terminalRuntime";
import { gMainApplication } from "../../windows/main/main";
import PopupToast from "../PopupToast.vue";
import { TerminalClientRpcObject } from "./terminalClientRpcObject";

type TerminalRunInput = Omit<TerminalRunRequest, "runId">;

const emit = defineEmits<{
  error: [message: string];
}>();

const container = useTemplateRef<HTMLDivElement>("container");
const popupToast = useTemplateRef<{ show: (text: string) => void }>("popupToast");

function initialize(): Promise<void> {
  return enqueue(async () => {
    initializeXterm();
    await initializeRuntime();
  });
}

function createPty(terminalType: TerminalType): Promise<void> {
  return enqueue(async () => {
    const dimensions = getDimensions();
    const ptyInfo = await requireRuntime().createPty(terminalType, dimensions.columns, dimensions.rows);
    if (xterm !== null) xterm.options.windowsPty = ptyInfo;
    enableInput();
  });
}

async function run(request: TerminalRunInput): Promise<void> {
  const runId = crypto.randomUUID();
  const completion = new Promise<void>((resolve) => pendingRuns.set(runId, resolve));
  try {
    await enqueue(async () => {
      const activeRuntime = requireRuntime();
      if (!await activeRuntime.isActive()) throw new Error("Terminal is not active");
      await activeRuntime.run({ ...request, runId });
    });
    await completion;
  } catch (error: unknown) {
    pendingRuns.delete(runId);
    throw error;
  }
}

function stop(): Promise<void> {
  return enqueue(async () => {
    await requireRuntime().stop();
    resolvePendingRuns();
  });
}

function destroyPty(): Promise<void> {
  return enqueue(async () => {
    await requireRuntime().destroyPty();
    xterm?.reset();
  });
}

function isActive(): Promise<boolean> {
  return enqueue(() => runtime === null ? false : runtime.isActive());
}

function clear(): Promise<void> {
  return enqueue(async () => {
    if (runtime !== null) await runtime.write("cls\r");
    xterm?.focus();
  });
}

function write(data: string): Promise<void> {
  return enqueue(() => requireRuntime().write(data));
}

function getCurrentLine(): string {
  const buffer = xterm?.buffer.active;
  if (buffer === undefined) return "";
  const cursorLineIndex = buffer.baseY + buffer.cursorY;
  let firstLineIndex = cursorLineIndex;
  while (firstLineIndex > 0 && buffer.getLine(firstLineIndex)?.isWrapped === true) {
    firstLineIndex -= 1;
  }
  let value = "";
  for (let index = firstLineIndex; index <= cursorLineIndex; index += 1) {
    value += buffer.getLine(index)?.translateToString(true) ?? "";
  }
  return value.trim();
}

function enqueue<TResult>(operation: () => Promise<TResult> | TResult): Promise<TResult> {
  if (isUnmounting) return Promise.reject(new Error("Terminal is being disposed"));
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function initializeRuntime(): Promise<void> {
  if (runtime !== null) return;

  const notifier = new TerminalClientRpcObject(
    (data) => {
      if (!isUnmounting) xterm?.write(data);
    },
    (runId) => {
      const resolve = pendingRuns.get(runId);
      if (resolve === undefined) return;
      pendingRuns.delete(runId);
      resolve();
    },
    (message) => {
      if (isUnmounting) return;
      emit("error", message);
    },
  );
  runtime = await createTerminalRuntime(
    gMainApplication.window.getPeer(),
    notifier,
  );
}

function initializeXterm(): void {
  if (xterm !== null) return;
  const terminalContainer = container.value;
  if (terminalContainer === null) throw new Error("Terminal container is unavailable");
  xterm = new XtermTerminal({
    cursorBlink: true,
    disableStdin: true,
    fontFamily: "Cascadia Mono, Consolas, monospace",
    fontSize: 13,
    overviewRuler: {
      width: 6,
    },
    scrollback: 5000,
    theme: {
      background: "#181818",
      foreground: "#cccccc",
      cursor: "#cccccc",
      overviewRulerBorder: "#00000000",
      scrollbarSliderActiveBackground: "#5a5a5a",
      scrollbarSliderBackground: "#3f3f3f",
      scrollbarSliderHoverBackground: "#4d4d4d",
      selectionBackground: "#264f78",
    },
  });
  fitAddon = new FitAddon();
  xterm.loadAddon(fitAddon);
  xterm.attachCustomKeyEventHandler(onCustomKeyEvent);
  xterm.open(terminalContainer);
  fitAddon.fit();
  inputSubscription = xterm.onData((data) => {
    if (runtime === null) return;
    void write(data).catch(onOperationError);
  });
  resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(terminalContainer);
}

function requireRuntime(): RemoteObject<TerminalServerRpcApi> {
  if (runtime === null) throw new Error("Terminal is not initialized");
  return runtime;
}

function getDimensions(): { columns: number; rows: number } {
  fitAddon?.fit();
  return {
    columns: Math.max(1, xterm?.cols ?? 80),
    rows: Math.max(1, xterm?.rows ?? 24),
  };
}

function enableInput(): void {
  if (xterm !== null) xterm.options.disableStdin = false;
}

function scheduleResize(): void {
  if (resizeScheduled || isUnmounting) return;
  resizeScheduled = true;
  void enqueue(async () => {
    resizeScheduled = false;
    if (runtime === null || xterm === null) return;
    const dimensions = getDimensions();
    if (dimensions.columns === lastColumns && dimensions.rows === lastRows) return;
    lastColumns = dimensions.columns;
    lastRows = dimensions.rows;
    await runtime.resize(dimensions.columns, dimensions.rows);
  }).catch(onOperationError);
}

function onOperationError(error: unknown): void {
  if (isUnmounting) return;
  const message = error instanceof Error ? error.message : String(error);
  emit("error", message);
}

function onCustomKeyEvent(event: KeyboardEvent): boolean {
  const terminal = xterm;
  if (event.type !== "keydown" || terminal === null || !event.ctrlKey || event.altKey) return true;

  const key = event.key.toLowerCase();
  if (key === "v" && !event.shiftKey) {
    event.preventDefault();
    void pasteClipboardText(terminal).catch(onOperationError);
    return false;
  }
  if (key === "c" && !event.shiftKey && terminal.hasSelection()) {
    event.preventDefault();
    void copySelectedText(terminal.getSelection()).catch(onOperationError);
    return false;
  }
  return true;
}

async function pasteClipboardText(terminal: XtermTerminal): Promise<void> {
  const text = await navigator.clipboard.readText();
  if (xterm === terminal && !isUnmounting) terminal.paste(text);
}

async function copySelectedText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  popupToast.value?.show("Terminal selection copied.");
}

function resolvePendingRuns(): void {
  for (const resolve of pendingRuns.values()) resolve();
  pendingRuns.clear();
}

onBeforeUnmount(() => {
  isUnmounting = true;
  resolvePendingRuns();
  resizeObserver?.disconnect();
  inputSubscription?.dispose();
  const activeRuntime = runtime;
  runtime = null;
  const disposePromise = queue.then(async () => {
    if (activeRuntime !== null) await destroyTerminalRuntime(activeRuntime);
  });
  void disposePromise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[terminal] dispose failed: ${message}`);
  });
  xterm?.dispose();
  xterm = null;
  fitAddon = null;
});

defineExpose({
  initialize,
  createPty,
  run,
  stop,
  destroyPty,
  isActive,
  clear,
  write,
  getCurrentLine,
});

let queue: Promise<void> = Promise.resolve();
const pendingRuns = new Map<string, () => void>();
let runtime: RemoteObject<TerminalServerRpcApi> | null = null;
let xterm: XtermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let inputSubscription: IDisposable | null = null;
let lastColumns = 0;
let lastRows = 0;
let resizeScheduled = false;
let isUnmounting = false;
</script>

<template>
  <section class="terminal-surface" aria-label="Terminal">
    <div ref="container" class="terminal-surface__viewport"></div>
    <PopupToast ref="popupToast" />
  </section>
</template>

<style scoped>
.terminal-surface {
  position: relative;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-content-bg);
}

.terminal-surface__viewport {
  width: 100%;
  height: 100%;
  padding: var(--space-2);
}

</style>

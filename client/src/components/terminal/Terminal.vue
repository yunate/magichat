<script setup lang="ts">
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XtermTerminal, type IDisposable, type ITheme } from "@xterm/xterm";
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import type { CSSProperties } from "vue";
import { FunnelTask } from "../../../../common/funnelTask";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type { TerminalRunRequest, TerminalServerRpcApi, TerminalType } from "../../../../common/terminal";
import FindBar from "../FindBar.vue";
import {
  createTerminalRuntime,
  destroyTerminalRuntime,
} from "../../bridge/remote_rpc_objects/terminalRuntime";
import { gMainApplication } from "../../windows/main/main";
import { registerThemeChangeHandler } from "../../windows/main/themes/theme";
import PopupToast from "../PopupToast.vue";
import { findTextMatches, TEXT_SEARCH_RESULT_LIMIT, type TextSearchOptions } from "../textSearch";
import { TerminalClientRpcObject } from "./terminalClientRpcObject";
import { TerminalOscColorOverrides } from "./terminalOscColorOverrides";

type TerminalSearchMatch = Readonly<{
  column: number;
  row: number;
  length: number;
}>;

const emit = defineEmits<{
  error: [message: string];
  message: [message: string];
}>();

const container = useTemplateRef<HTMLDivElement>("container");
const scrollbarTrack = useTemplateRef<HTMLDivElement>("scrollbarTrack");
const findBar = useTemplateRef<{ focus: () => void }>("findBar");
const popupToast = useTemplateRef<{ show: (text: string) => void }>("popupToast");
const hasScrollableContent = ref(false);
const scrollbarThumbStyle = ref<CSSProperties>({});
const scrollbarValueNow = ref(0);
const scrollbarValueMax = ref(0);
const isSearchVisible = ref(false);
const searchResultIndex = ref(0);
const searchResultCount = ref(0);
const isSearchPatternValid = ref(true);
const unregisterThemeChangeHandler = registerThemeChangeHandler(updateXtermTheme);
const MIN_SCROLLBAR_THUMB_HEIGHT = 20;
const RUNNING_CHECK_FUNNEL_DELAY_MS = 30;
const IDLE_PROMPT_PATTERN = /^(?:PS|CMD) .+>$/;
const oscColorOverrides = new TerminalOscColorOverrides();
const runningCheckFunnelTask = new FunnelTask(() => {
  void checkRunningOnce().catch(onOperationError);
}, RUNNING_CHECK_FUNNEL_DELAY_MS);

function initialize(): Promise<void> {
  return enqueue(async () => {
    initializeXterm();
    await initializeRuntime();
  });
}

function createPty(
  terminalType: TerminalType,
  initialPath: string,
  requestedHeartbeatIntervalMs?: number,
  requestedRunningStatusChangeCallback?: ((isRunning: boolean) => void) | null,
): Promise<void> {
  return enqueue(async () => {
    if (activeTerminalType !== null) return;
    const terminal = requireXterm();
    const dimensions = getDimensions();
    const ptyInfo = await requireRuntime().createPty(
      terminalType,
      dimensions.columns,
      dimensions.rows,
      initialPath,
    );
    terminal.options.windowsPty = ptyInfo;
    terminal.options.disableStdin = false;

    heartbeatIntervalMs = requestedHeartbeatIntervalMs ?? 0;
    activeTerminalType = terminalType;
    runningStatusChangeCallback = requestedRunningStatusChangeCallback ?? null;

    onDataSubscription = terminal.onData((data) => {
      if (runtime === null) return;
      void write(data).catch(onOperationError);
      funnelCheckRunning();
    });
    onWriteParsedSubscription = terminal.onWriteParsed(() => {
      updateScrollbarVisibility();
      funnelCheckRunning();
      if (isSearchVisible.value && searchRequest !== null) {
        startSearch(searchRequest.query, searchRequest.options);
      }
    });
    scheduleHeartbeatCheckRunning();
    terminal.focus();
    emit("message", `Terminal connected: ${terminalType === "powershell" ? "PowerShell" : "Command Prompt"}.`);
  });
}

function destroyPty(): Promise<void> {
  return enqueue(async () => {
    disposePtyClientState();
    await requireRuntime().destroyPty();
    disposeXterm();
    if (!isUnmounting) emit("message", "Terminal closed.");
  });
}

function disposePtyClientState(): void {
  const statusChangeCallback = runningStatusChangeCallback;
  const shouldReportStopped = lastReportedRunning === true;
  lastReportedRunning = null;
  runningStatusChangeCallback = null;

  if (heartbeatCheckRunningTimer !== null) clearTimeout(heartbeatCheckRunningTimer);
  heartbeatCheckRunningTimer = null;
  heartbeatIntervalMs = 0;

  runningCheckFunnelTask.cancel();
  onDataSubscription?.dispose();
  onDataSubscription = null;
  onWriteParsedSubscription?.dispose();
  onWriteParsedSubscription = null;
  activeTerminalType = null;
  if (xterm !== null) xterm.options.disableStdin = true;
  if (!shouldReportStopped || statusChangeCallback === null) return;
  try {
    statusChangeCallback(false);
  } catch (error: unknown) {
    onOperationError(error);
  }
}

function run(request: TerminalRunRequest): Promise<void> {
  return enqueue(async () => {
    const activeRuntime = requireRuntime();
    if (!await activeRuntime.isActive()) throw new Error("Terminal is not active");
    await activeRuntime.run(request);
    emit("message", "Command sent to Terminal.");
  });
}

function scheduleHeartbeatCheckRunning(): void {
  const intervalMs = heartbeatIntervalMs;
  if (runningStatusChangeCallback === null
    || intervalMs <= 0
    || isUnmounting) return;
  heartbeatCheckRunningTimer = setTimeout(() => {
    heartbeatCheckRunningTimer = null;
    void checkRunningOnce()
      .then(scheduleHeartbeatCheckRunning)
      .catch(onOperationError);
  }, intervalMs);
}

async function checkRunningOnce(): Promise<void> {
  if (isUnmounting) return;
  const isRunning = isTerminalRunning();
  if (lastReportedRunning !== isRunning) {
    lastReportedRunning = isRunning;
    runningStatusChangeCallback?.(isRunning);
  }
}

function funnelCheckRunning(): void {
  if (runningStatusChangeCallback === null
    || isUnmounting) return;
  runningCheckFunnelTask.schedule();
}

function stop(): Promise<void> {
  return enqueue(async () => {
    await requireRuntime().stop();
    emit("message", "Stop signal sent to Terminal.");
  });
}

function isActive(): Promise<boolean> {
  return enqueue(() => runtime === null ? false : runtime.isActive());
}

function clear(): Promise<void> {
  return enqueue(async () => {
    if (runtime !== null) await runtime.clear();
    xterm?.clear();
    clearSearchResults();
    updateScrollbarVisibility();
    xterm?.focus();
    emit("message", "Terminal cleared.");
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
      if (isUnmounting || xterm === null) return;
      xterm.write(data);
    },
    (message) => {
      onRuntimeError(message);
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
    cursorInactiveStyle: "none",
    disableStdin: true,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    lineHeight: 15 / 13,
    overviewRuler: {
      width: 10,
    },
    scrollback: 5000,
    theme: getXtermTheme(),
  });
  fitAddon = new FitAddon();
  xterm.loadAddon(fitAddon);
  xterm.attachCustomKeyEventHandler(onCustomKeyEvent);
  oscColorOverrides.attach(xterm);
  xterm.open(terminalContainer);
  fitAddon.fit();
  terminalResizeSubscription = xterm.onResize(updateScrollbarVisibility);
  scrollSubscription = xterm.onScroll(updateScrollbarVisibility);
  updateScrollbarVisibility();
  resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(terminalContainer);
}

function disposeXterm(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  terminalResizeSubscription?.dispose();
  terminalResizeSubscription = null;
  scrollSubscription?.dispose();
  scrollSubscription = null;
  oscColorOverrides.dispose();
  xterm?.dispose();
  xterm = null;
  fitAddon = null;
  isSearchVisible.value = false;
  searchRequest = null;
  searchMatches = [];
  searchResultIndex.value = 0;
  searchResultCount.value = 0;
  isSearchPatternValid.value = true;
  hasScrollableContent.value = false;
  scrollbarValueNow.value = 0;
  scrollbarValueMax.value = 0;
  scrollbarDrag = null;
  lastColumns = 0;
  lastRows = 0;
}

function updateXtermTheme(): void {
  const terminal = xterm;
  if (terminal === null) return;
  terminal.options.theme = getXtermTheme();
  oscColorOverrides.reapply(terminal);
}

function openSearch(): void {
  isSearchVisible.value = true;
  void nextTick(() => findBar.value?.focus());
}

function closeSearch(): void {
  isSearchVisible.value = false;
  searchRequest = null;
  clearSearchResults();
  xterm?.focus();
}

function searchNext(): void {
  if (searchMatches.length === 0) return;
  selectSearchResult(searchResultIndex.value % searchMatches.length);
}

function onSearch(query: string, options: TextSearchOptions): void {
  searchRequest = { query, options };
  startSearch(query, options);
}

function searchPrevious(): void {
  if (searchMatches.length === 0) return;
  const currentIndex = Math.max(0, searchResultIndex.value - 1);
  selectSearchResult((currentIndex - 1 + searchMatches.length) % searchMatches.length);
}

function startSearch(query: string, options: TextSearchOptions): void {
  if (query.length === 0) {
    clearSearchResults();
    return;
  }
  xterm?.clearSelection();
  const result = findSearchMatches(query, options);
  searchMatches = result.matches;
  isSearchPatternValid.value = result.isPatternValid;
  searchResultCount.value = searchMatches.length;
  if (searchMatches.length === 0) {
    searchResultIndex.value = 0;
    return;
  }
  selectSearchResult(findNearestSearchResultIndex());
}

function clearSearchResults(): void {
  xterm?.clearSelection();
  searchMatches = [];
  searchResultIndex.value = 0;
  searchResultCount.value = 0;
  isSearchPatternValid.value = true;
}

function findSearchMatches(
  query: string,
  options: TextSearchOptions,
): Readonly<{ matches: TerminalSearchMatch[]; isPatternValid: boolean }> {
  const terminal = xterm;
  if (terminal === null || query.length === 0) return { matches: [], isPatternValid: true };

  const buffer = terminal.buffer.active;
  const matches: TerminalSearchMatch[] = [];
  for (let row = 0; row < buffer.length && matches.length < TEXT_SEARCH_RESULT_LIMIT; row += 1) {
    const firstLine = buffer.getLine(row);
    if (firstLine === undefined || firstLine.isWrapped) continue;

    const firstRow = row;
    let lineText = "";
    const lineOffsets = [0];
    let line = firstLine;
    do {
      const nextLine = buffer.getLine(row + 1);
      lineText += line.translateToString(nextLine?.isWrapped !== true);
      if (nextLine?.isWrapped !== true) break;
      lineOffsets.push(lineText.length);
      row += 1;
      line = nextLine;
    } while (row < buffer.length);

    const remainingLimit = TEXT_SEARCH_RESULT_LIMIT - matches.length;
    const result = findTextMatches(lineText, query, options, remainingLimit);
    if (!result.isPatternValid) return { matches: [], isPatternValid: false };
    for (const match of result.matches) {
      matches.push(createSearchMatch(firstRow, lineOffsets, match.index, match.length));
    }
  }
  return { matches, isPatternValid: true };
}

function createSearchMatch(
  firstRow: number,
  lineOffsets: readonly number[],
  matchIndex: number,
  matchLength: number,
): TerminalSearchMatch {
  const terminal = xterm;
  if (terminal === null) throw new Error("Terminal is not initialized");

  const startRowOffset = findSearchRowOffset(lineOffsets, matchIndex);
  const endRowOffset = findSearchRowOffset(lineOffsets, matchIndex + matchLength);
  const startRow = firstRow + startRowOffset;
  const endRow = firstRow + endRowOffset;
  const startColumn = getBufferColumn(startRow, matchIndex - lineOffsets[startRowOffset]);
  const endColumn = getBufferColumn(endRow, matchIndex + matchLength - lineOffsets[endRowOffset]);
  return {
    column: startColumn,
    row: startRow,
    length: endColumn - startColumn + terminal.cols * (endRow - startRow),
  };
}

function findSearchRowOffset(lineOffsets: readonly number[], stringOffset: number): number {
  let rowOffset = 0;
  while (rowOffset < lineOffsets.length - 1 && stringOffset >= lineOffsets[rowOffset + 1]) {
    rowOffset += 1;
  }
  return rowOffset;
}

function getBufferColumn(row: number, stringOffset: number): number {
  const line = xterm?.buffer.active.getLine(row);
  if (line === undefined) return 0;

  let bufferColumn = stringOffset;
  for (let column = 0; column < bufferColumn; column += 1) {
    const cell = line.getCell(column);
    if (cell === undefined) break;
    const characterLength = cell.getChars().length;
    if (characterLength > 1) bufferColumn -= characterLength - 1;
    if (line.getCell(column + 1)?.getWidth() === 0) bufferColumn += 1;
  }
  return bufferColumn;
}

function findNearestSearchResultIndex(): number {
  const terminal = xterm;
  if (terminal === null || searchMatches.length === 0) return 0;

  const buffer = terminal.buffer.active;
  const cursorRow = buffer.baseY + buffer.cursorY;
  const viewportEndRow = buffer.viewportY + terminal.rows - 1;
  const isCursorVisible = cursorRow >= buffer.viewportY && cursorRow <= viewportEndRow;
  const anchorRow = isCursorVisible ? cursorRow : buffer.viewportY + Math.floor(terminal.rows / 2);
  const anchorColumn = isCursorVisible ? buffer.cursorX : Math.floor(terminal.cols / 2);
  const anchorPosition = anchorRow * terminal.cols + anchorColumn;
  let nearestIndex = 0;
  let nearestDistance = getSearchMatchDistance(searchMatches[0], anchorPosition, terminal.cols);
  for (let index = 1; index < searchMatches.length; index += 1) {
    const distance = getSearchMatchDistance(searchMatches[index], anchorPosition, terminal.cols);
    if (distance >= nearestDistance) continue;
    nearestIndex = index;
    nearestDistance = distance;
  }
  return nearestIndex;
}

function getSearchMatchDistance(match: TerminalSearchMatch, anchorPosition: number, columns: number): number {
  return Math.abs(match.row * columns + match.column - anchorPosition);
}

function selectSearchResult(index: number): void {
  const terminal = xterm;
  const match = searchMatches[index];
  if (terminal === null || match === undefined) return;

  terminal.select(match.column, match.row, match.length);
  searchResultIndex.value = index + 1;
  const viewportEndRow = terminal.buffer.active.viewportY + terminal.rows - 1;
  if (match.row < terminal.buffer.active.viewportY || match.row > viewportEndRow) {
    terminal.scrollToLine(Math.max(0, match.row - Math.floor(terminal.rows / 2)));
  }
}

function scrollLines(lines: number): void {
  xterm?.scrollLines(lines);
}

function updateScrollbarVisibility(): void {
  const terminal = xterm;
  if (terminal === null || terminal.buffer.active.baseY === 0) {
    hasScrollableContent.value = false;
    scrollbarThumbStyle.value = {};
    scrollbarValueNow.value = 0;
    scrollbarValueMax.value = 0;
    scrollbarThumbHeight = 0;
    scrollbarThumbTop = 0;
    return;
  }

  const wasScrollable = hasScrollableContent.value;
  hasScrollableContent.value = true;
  scrollbarValueNow.value = terminal.buffer.active.viewportY;
  scrollbarValueMax.value = terminal.buffer.active.baseY;
  if (!wasScrollable) {
    void nextTick(updateScrollbarThumb);
    return;
  }
  updateScrollbarThumb();
}

function updateScrollbarThumb(): void {
  const terminal = xterm;
  const track = scrollbarTrack.value;
  if (terminal === null || track === null || terminal.buffer.active.baseY === 0) return;

  const trackHeight = track.clientHeight;
  const totalRows = terminal.buffer.active.baseY + terminal.rows;
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(MIN_SCROLLBAR_THUMB_HEIGHT, trackHeight * terminal.rows / totalRows),
  );
  const scrollRange = terminal.buffer.active.baseY;
  const thumbTop = (trackHeight - thumbHeight) * terminal.buffer.active.viewportY / scrollRange;
  scrollbarThumbHeight = thumbHeight;
  scrollbarThumbTop = thumbTop;
  scrollbarThumbStyle.value = {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  };
}

function onScrollbarTrackPointerDown(event: PointerEvent): void {
  const track = event.currentTarget;
  if (!(track instanceof HTMLElement) || xterm === null) return;
  const offset = event.clientY - track.getBoundingClientRect().top;
  xterm.scrollPages(offset < scrollbarThumbTop ? -1 : 1);
}

function onScrollbarThumbPointerDown(event: PointerEvent): void {
  const thumb = event.currentTarget;
  if (!(thumb instanceof HTMLElement) || xterm === null) return;
  scrollbarDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startViewportY: xterm.buffer.active.viewportY,
  };
  thumb.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onScrollbarThumbPointerMove(event: PointerEvent): void {
  const drag = scrollbarDrag;
  const terminal = xterm;
  const track = scrollbarTrack.value;
  if (drag === null || drag.pointerId !== event.pointerId || terminal === null || track === null) return;
  const availableDistance = track.clientHeight - scrollbarThumbHeight;
  if (availableDistance <= 0) return;
  const lineDelta = (event.clientY - drag.startY) * terminal.buffer.active.baseY / availableDistance;
  terminal.scrollToLine(Math.round(drag.startViewportY + lineDelta));
}

function stopScrollbarDrag(event: PointerEvent): void {
  if (scrollbarDrag?.pointerId !== event.pointerId) return;
  const thumb = event.currentTarget;
  if (thumb instanceof HTMLElement && thumb.hasPointerCapture(event.pointerId)) {
    thumb.releasePointerCapture(event.pointerId);
  }
  scrollbarDrag = null;
}

function getXtermTheme(): ITheme {
  return {
    background: getThemeColor("--color-terminal-background"),
    foreground: getThemeColor("--color-terminal-foreground"),
    cursor: getThemeColor("--color-terminal-cursor"),
    black: getThemeColor("--color-terminal-ansi-black"),
    red: getThemeColor("--color-terminal-ansi-red"),
    green: getThemeColor("--color-terminal-ansi-green"),
    yellow: getThemeColor("--color-terminal-ansi-yellow"),
    blue: getThemeColor("--color-terminal-ansi-blue"),
    magenta: getThemeColor("--color-terminal-ansi-magenta"),
    cyan: getThemeColor("--color-terminal-ansi-cyan"),
    white: getThemeColor("--color-terminal-ansi-white"),
    brightBlack: getThemeColor("--color-terminal-ansi-bright-black"),
    brightRed: getThemeColor("--color-terminal-ansi-bright-red"),
    brightGreen: getThemeColor("--color-terminal-ansi-bright-green"),
    brightYellow: getThemeColor("--color-terminal-ansi-bright-yellow"),
    brightBlue: getThemeColor("--color-terminal-ansi-bright-blue"),
    brightMagenta: getThemeColor("--color-terminal-ansi-bright-magenta"),
    brightCyan: getThemeColor("--color-terminal-ansi-bright-cyan"),
    brightWhite: getThemeColor("--color-terminal-ansi-bright-white"),
    overviewRulerBorder: getThemeColor("--color-terminal-overview-border"),
    scrollbarSliderActiveBackground: getThemeColor("--color-terminal-scrollbar-active"),
    scrollbarSliderBackground: getThemeColor("--color-terminal-scrollbar"),
    scrollbarSliderHoverBackground: getThemeColor("--color-terminal-scrollbar-hover"),
    selectionBackground: getThemeColor("--color-terminal-selection"),
    selectionInactiveBackground: getThemeColor("--color-terminal-selection"),
  };
}

function getThemeColor(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (value.length === 0) throw new Error(`Theme token ${token} is not defined`);
  return value;
}

function requireRuntime(): RemoteObject<TerminalServerRpcApi> {
  if (runtime === null) throw new Error("Terminal is not initialized");
  return runtime;
}

function requireXterm(): XtermTerminal {
  if (xterm === null) throw new Error("Terminal is not initialized");
  return xterm;
}

function getDimensions(): { columns: number; rows: number } {
  fitAddon?.fit();
  return {
    columns: Math.max(1, xterm?.cols ?? 80),
    rows: Math.max(1, xterm?.rows ?? 24),
  };
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

function onRuntimeError(message: string): void {
  disposePtyClientState();
  onOperationError(message);
}

function onCustomKeyEvent(event: KeyboardEvent): boolean {
  const terminal = xterm;
  if (event.type !== "keydown" || terminal === null || !event.ctrlKey || event.altKey) return true;

  const key = event.key.toLowerCase();
  if (key === "f" && !event.shiftKey) {
    event.preventDefault();
    openSearch();
    return false;
  }
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

function onTerminalDragOver(event: DragEvent): void {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer !== null) {
    event.dataTransfer.dropEffect = activeTerminalType === null ? "none" : "copy";
  }
}

function onTerminalDrop(event: DragEvent): void {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  const terminalType = activeTerminalType;
  if (terminalType === null) return;
  let writeData: string;
  try {
    writeData = files
      .map((file) => quoteTerminalPath(window.electronFileSystem.getPathForFile(file), terminalType))
      .join(" ");
  } catch (error: unknown) {
    onOperationError(error);
    return;
  }
  if (writeData.length === 0) return;
  void enqueue(async () => {
    const activeRuntime = requireRuntime();
    if (!await activeRuntime.isActive() || isTerminalRunning()) return;
    await activeRuntime.write(writeData);
    xterm?.focus();
  }).catch(onOperationError);
}

function hasDraggedFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

function isTerminalRunning(): boolean {
  return !IDLE_PROMPT_PATTERN.test(getCurrentLine());
}

function quoteTerminalPath(filePath: string, terminalType: TerminalType): string {
  if (filePath.length === 0) return "";
  return terminalType === "powershell"
    ? `'${filePath.replaceAll("'", "''")}'`
    : `"${filePath}"`;
}

async function disposeRuntime(): Promise<void> {
  const activeRuntime = runtime;
  if (activeRuntime === null) return;
  try {
    await destroyPty();
  } finally {
    try {
      await destroyTerminalRuntime(activeRuntime);
    } finally {
      runtime = null;
    }
  }
}

onBeforeUnmount(() => {
  unregisterThemeChangeHandler();
  void disposeRuntime().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[terminal] dispose failed: ${message}`);
  });
  isUnmounting = true;
  disposeXterm();
  activeTerminalType = null;
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
  isTerminalRunning,
});

let queue: Promise<void> = Promise.resolve();
let heartbeatCheckRunningTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatIntervalMs = 0;
let runningStatusChangeCallback: ((isRunning: boolean) => void) | null = null;
let lastReportedRunning: boolean | null = null;
let activeTerminalType: TerminalType | null = null;
let runtime: RemoteObject<TerminalServerRpcApi> | null = null;
let xterm: XtermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let searchMatches: readonly TerminalSearchMatch[] = [];
let searchRequest: Readonly<{ query: string; options: TextSearchOptions }> | null = null;
let resizeObserver: ResizeObserver | null = null;
let onDataSubscription: IDisposable | null = null;
let onWriteParsedSubscription: IDisposable | null = null;
let terminalResizeSubscription: IDisposable | null = null;
let scrollSubscription: IDisposable | null = null;
let scrollbarDrag: Readonly<{ pointerId: number; startY: number; startViewportY: number }> | null = null;
let scrollbarThumbHeight = 0;
let scrollbarThumbTop = 0;
let lastColumns = 0;
let lastRows = 0;
let resizeScheduled = false;
let isUnmounting = false;
</script>

<template>
  <section
    class="terminal-surface"
    aria-label="Terminal"
    @dragover="onTerminalDragOver"
    @drop="onTerminalDrop"
  >
    <FindBar
      v-if="isSearchVisible"
      ref="findBar"
      class="terminal-search"
      :result-index="searchResultIndex"
      :result-count="searchResultCount"
      :is-pattern-valid="isSearchPatternValid"
      @search="onSearch"
      @previous="searchPrevious"
      @next="searchNext"
      @close="closeSearch"
    />
    <div class="terminal-surface__viewport">
      <div ref="container" class="terminal-surface__host"></div>
    </div>
    <div
      v-show="hasScrollableContent"
      class="terminal-scrollbar"
    >
      <button
        type="button"
        class="terminal-scrollbar__button terminal-scrollbar__button--up"
        aria-label="Scroll Terminal up"
        @click="scrollLines(-1)"
      ></button>
      <div
        ref="scrollbarTrack"
        class="terminal-scrollbar__track"
        @pointerdown.self="onScrollbarTrackPointerDown"
      >
        <div
          class="terminal-scrollbar__thumb"
          :style="scrollbarThumbStyle"
          role="scrollbar"
          aria-label="Terminal scroll position"
          aria-orientation="vertical"
          :aria-valuemin="0"
          :aria-valuemax="scrollbarValueMax"
          :aria-valuenow="scrollbarValueNow"
          @pointerdown="onScrollbarThumbPointerDown"
          @pointermove="onScrollbarThumbPointerMove"
          @pointerup="stopScrollbarDrag"
          @pointercancel="stopScrollbarDrag"
        ></div>
      </div>
      <button
        type="button"
        class="terminal-scrollbar__button terminal-scrollbar__button--down"
        aria-label="Scroll Terminal down"
        @click="scrollLines(1)"
      ></button>
    </div>
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
  background: var(--color-terminal-background);
}

.terminal-surface__viewport {
  width: 100%;
  height: 100%;
  padding: var(--space-2);
}

.terminal-surface__host {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-search {
  position: absolute;
  z-index: 30;
  top: var(--space-2);
  right: calc(var(--space-3) + 10px);
  width: min(460px, calc(100% - var(--space-6) - 10px));
}

.terminal-surface__viewport :deep(.xterm-scrollable-element > .scrollbar.vertical) {
  opacity: 0 !important;
  pointer-events: none;
}

.terminal-scrollbar {
  position: absolute;
  z-index: 20;
  top: var(--space-2);
  right: var(--space-2);
  bottom: var(--space-2);
  width: 10px;
  display: flex;
  flex-direction: column;
}

.terminal-scrollbar__button {
  width: 10px;
  height: 10px;
  display: grid;
  place-items: center;
  flex: 0 0 10px;
  padding: 0;
  color: var(--color-terminal-scrollbar);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.terminal-scrollbar__button::before {
  width: 0;
  height: 0;
  content: "";
  border-inline: 2.5px solid transparent;
}

.terminal-scrollbar__button--up {
  border-radius: 999px 999px 0 0;
}

.terminal-scrollbar__button--up::before {
  border-block-end: 3px solid currentColor;
}

.terminal-scrollbar__button--down {
  border-radius: 0 0 999px 999px;
}

.terminal-scrollbar__button--down::before {
  border-block-start: 3px solid currentColor;
}

.terminal-scrollbar__button:hover {
  color: var(--color-terminal-scrollbar-hover);
  background: color-mix(in srgb, var(--color-terminal-scrollbar) 18%, transparent);
}

.terminal-scrollbar__button:active {
  color: var(--color-terminal-scrollbar-active);
  background: color-mix(in srgb, var(--color-terminal-scrollbar) 28%, transparent);
}

.terminal-scrollbar__button:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}

.terminal-scrollbar__track {
  position: relative;
  min-height: 0;
  flex: 1;
  cursor: default;
}

.terminal-scrollbar__thumb {
  position: absolute;
  top: 0;
  left: 3px;
  width: 5px;
  min-height: 20px;
  background: var(--color-terminal-scrollbar);
  border-radius: 999px;
  cursor: grab;
  touch-action: none;
}

.terminal-scrollbar__thumb:hover {
  background: var(--color-terminal-scrollbar-hover);
}

.terminal-scrollbar__thumb:active {
  background: var(--color-terminal-scrollbar-active);
  cursor: grabbing;
}

</style>

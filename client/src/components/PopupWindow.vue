<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useSlots, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";

type PopupRole = "alert" | "dialog" | "listbox" | "menu" | "status" | "tooltip";

type Props = {
  draggable?: boolean;
  resizable?: boolean;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  modal?: boolean;
  isExternallyPositioned?: boolean;
  positionType?: "absolute" | "fixed";
  semanticRole?: PopupRole;
  ariaLive?: "assertive" | "off" | "polite";
  dismissDelayMs?: number;
  fadeDurationMs?: number;
  isDismissPaused?: boolean;
  isDismissPausedOnHover?: boolean;
};

type Geometry = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type ResizeDirection = "north" | "north-east" | "east" | "south-east"
  | "south" | "south-west" | "west" | "north-west";
type Interaction = Readonly<{
  kind: "move" | "resize";
  startX: number;
  startY: number;
  geometry: Geometry;
  direction?: ResizeDirection;
}>;

const props = withDefaults(defineProps<Props>(), {
  draggable: false,
  resizable: false,
  initialWidth: undefined,
  initialHeight: undefined,
  minWidth: 320,
  minHeight: 160,
  modal: false,
  isExternallyPositioned: false,
  positionType: "fixed",
  semanticRole: "dialog",
  ariaLive: undefined,
  dismissDelayMs: undefined,
  fadeDurationMs: undefined,
  isDismissPaused: false,
  isDismissPausedOnHover: false,
});
const emit = defineEmits<{ dismiss: [] }>();
const slots = useSlots();
const popup = useTemplateRef<HTMLElement>("popup");
const geometry = shallowRef<Geometry | null>(null);
const isHovered = ref(false);
const isFading = ref(false);
const isAutoDismissPaused = computed(() => props.dismissDelayMs !== undefined
  && (props.isDismissPaused || (props.isDismissPausedOnHover && isHovered.value)));
const popupStyle = computed<CSSProperties>(() => {
  const fadeDurationMs = props.fadeDurationMs ?? 0;
  const fadeStyle: CSSProperties = {
    position: props.positionType,
    opacity: isFading.value ? 0 : 1,
    transition: fadeDurationMs > 0 ? `opacity ${fadeDurationMs}ms linear` : undefined,
  };
  const current = geometry.value;
  if (current === null) return fadeStyle;
  return {
    ...fadeStyle,
    left: `${current.left}px`,
    top: `${current.top}px`,
    width: `${current.width}px`,
    height: `${current.height}px`,
    transform: "none",
  };
});
const RESIZE_DIRECTIONS: readonly ResizeDirection[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
const VIEWPORT_MARGIN = 16;
const KEYBOARD_RESIZE_STEP = 16;
let interaction: Interaction | null = null;
let previousBodyCursor = "";
let previousBodyUserSelect = "";
let dismissTimer: number | null = null;
let fadeTimer: number | null = null;

watch(
  [
    () => props.dismissDelayMs,
    () => props.fadeDurationMs,
    isAutoDismissPaused,
  ],
  restartDismiss,
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("resize", constrainToViewport);
  if (props.draggable || props.resizable) void nextTick(initializeGeometry);
});

onUnmounted(() => {
  window.removeEventListener("resize", constrainToViewport);
  stopInteraction();
  clearDismissTimers();
});

function restartDismiss(): void {
  clearDismissTimers();
  isFading.value = false;
  const delayMs = props.dismissDelayMs;
  if (delayMs === undefined || isAutoDismissPaused.value) return;
  dismissTimer = window.setTimeout(beginDismiss, Math.max(0, delayMs));
}

function beginDismiss(): void {
  dismissTimer = null;
  const fadeDurationMs = props.fadeDurationMs ?? 0;
  if (fadeDurationMs <= 0) {
    emit("dismiss");
    return;
  }
  isFading.value = true;
  fadeTimer = window.setTimeout(() => {
    fadeTimer = null;
    emit("dismiss");
  }, fadeDurationMs);
}

function clearDismissTimers(): void {
  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  if (fadeTimer !== null) window.clearTimeout(fadeTimer);
  dismissTimer = null;
  fadeTimer = null;
}

function initializeGeometry(): void {
  const element = popup.value;
  if (element === null) return;
  const bounds = element.getBoundingClientRect();
  const width = constrainWidth(props.initialWidth ?? bounds.width);
  const height = constrainHeight(props.initialHeight ?? bounds.height);
  geometry.value = {
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.round((window.innerHeight - height) / 2),
    width,
    height,
  };
}

function startMove(event: PointerEvent): void {
  if (!props.draggable || event.button !== 0 || geometry.value === null) return;
  if (event.target instanceof Element && event.target.closest(
    "button, input, textarea, select, a, [contenteditable], [data-popup-no-drag]",
  ) !== null) return;
  startInteraction(event, {
    kind: "move",
    startX: event.clientX,
    startY: event.clientY,
    geometry: geometry.value,
  }, "move");
}

function startResize(event: PointerEvent, direction: ResizeDirection): void {
  if (!props.resizable || event.button !== 0 || geometry.value === null) return;
  event.stopPropagation();
  startInteraction(event, {
    kind: "resize",
    startX: event.clientX,
    startY: event.clientY,
    geometry: geometry.value,
    direction,
  }, resizeCursor(direction));
}

function startInteraction(event: PointerEvent, nextInteraction: Interaction, cursor: string): void {
  event.preventDefault();
  interaction = nextInteraction;
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopInteraction);
  window.addEventListener("pointercancel", stopInteraction);
}

function onPointerMove(event: PointerEvent): void {
  const current = interaction;
  if (current === null) return;
  const deltaX = event.clientX - current.startX;
  const deltaY = event.clientY - current.startY;
  geometry.value = current.kind === "move"
    ? moveGeometry(current.geometry, deltaX, deltaY)
    : resizeGeometry(current.geometry, current.direction ?? "south-east", deltaX, deltaY);
}

function stopInteraction(): void {
  if (interaction === null) return;
  interaction = null;
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopInteraction);
  window.removeEventListener("pointercancel", stopInteraction);
}

function moveGeometry(start: Geometry, deltaX: number, deltaY: number): Geometry {
  return {
    ...start,
    left: clamp(start.left + deltaX, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - start.width),
    top: clamp(start.top + deltaY, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - start.height),
  };
}

function resizeGeometry(
  start: Geometry,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
): Geometry {
  const movesWest = direction.includes("west");
  const movesEast = direction.includes("east");
  const movesNorth = direction.includes("north");
  const movesSouth = direction.includes("south");
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  const left = movesWest
    ? clamp(start.left + deltaX, VIEWPORT_MARGIN, right - minimumWidth())
    : start.left;
  const top = movesNorth
    ? clamp(start.top + deltaY, VIEWPORT_MARGIN, bottom - minimumHeight())
    : start.top;
  const width = movesWest
    ? right - left
    : movesEast
      ? clamp(start.width + deltaX, minimumWidth(), window.innerWidth - VIEWPORT_MARGIN - start.left)
      : start.width;
  const height = movesNorth
    ? bottom - top
    : movesSouth
      ? clamp(start.height + deltaY, minimumHeight(), window.innerHeight - VIEWPORT_MARGIN - start.top)
      : start.height;
  return { left, top, width, height };
}

function resizeByKey(event: KeyboardEvent, direction: ResizeDirection): void {
  const current = geometry.value;
  if (current === null) return;
  let deltaX = 0;
  let deltaY = 0;
  switch (event.key) {
    case "ArrowLeft": deltaX = -KEYBOARD_RESIZE_STEP; break;
    case "ArrowRight": deltaX = KEYBOARD_RESIZE_STEP; break;
    case "ArrowUp": deltaY = -KEYBOARD_RESIZE_STEP; break;
    case "ArrowDown": deltaY = KEYBOARD_RESIZE_STEP; break;
    default: return;
  }
  event.preventDefault();
  geometry.value = resizeGeometry(current, direction, deltaX, deltaY);
}

function constrainToViewport(): void {
  const current = geometry.value;
  if (current === null) return;
  const width = constrainWidth(current.width);
  const height = constrainHeight(current.height);
  geometry.value = {
    left: clamp(current.left, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width),
    top: clamp(current.top, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - height),
    width,
    height,
  };
}

function constrainWidth(width: number): number {
  return clamp(width, minimumWidth(), Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
}

function constrainHeight(height: number): number {
  return clamp(height, minimumHeight(), Math.max(0, window.innerHeight - VIEWPORT_MARGIN * 2));
}

function minimumWidth(): number {
  return Math.min(props.minWidth, Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
}

function minimumHeight(): number {
  return Math.min(props.minHeight, Math.max(0, window.innerHeight - VIEWPORT_MARGIN * 2));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function resizeCursor(direction: ResizeDirection): string {
  if (direction === "north" || direction === "south") return "ns-resize";
  if (direction === "east" || direction === "west") return "ew-resize";
  if (direction === "north-east" || direction === "south-west") return "nesw-resize";
  return "nwse-resize";
}

function getElement(): HTMLElement | null {
  return popup.value;
}

defineExpose({ getElement, restartDismiss });
</script>

<template>
  <section
    ref="popup"
    class="popup-window"
    :class="{
      'is-draggable': draggable,
      'is-externally-positioned': isExternallyPositioned,
    }"
    :style="popupStyle"
    :role="semanticRole"
    :aria-live="ariaLive"
    :aria-modal="semanticRole === 'dialog' && modal ? 'true' : undefined"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
  >
    <div v-if="slots.header" class="popup-window__header" @pointerdown="startMove">
      <slot name="header"></slot>
    </div>
    <div class="popup-window__content">
      <slot></slot>
    </div>
    <div v-if="slots.footer" class="popup-window__footer">
      <slot name="footer"></slot>
    </div>
    <template v-if="resizable">
      <span
        v-for="direction in RESIZE_DIRECTIONS"
        :key="direction"
        class="popup-window__resize-handle"
        :class="`is-${direction}`"
        role="separator"
        :aria-label="`Resize window ${direction}`"
        :tabindex="direction === 'east' || direction === 'south' || direction === 'west' || direction === 'north' ? 0 : -1"
        @pointerdown="startResize($event, direction)"
        @keydown="resizeByKey($event, direction)"
      ></span>
    </template>
  </section>
</template>

<style scoped>
.popup-window {
  position: fixed;
  top: 50%;
  left: 50%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  box-shadow: var(--shadow-dialog);
  transform: translate(-50%, -50%);
}

.popup-window.is-externally-positioned {
  top: auto;
  left: auto;
  transform: none;
}

.popup-window__header,
.popup-window__footer {
  flex: none;
}

.popup-window__header {
  touch-action: none;
}

.popup-window.is-draggable .popup-window__header {
  cursor: move;
}

.popup-window__content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.popup-window__resize-handle {
  position: absolute;
  z-index: 2;
  display: block;
  touch-action: none;
}

.popup-window__resize-handle.is-north,
.popup-window__resize-handle.is-south {
  inset-inline: 8px;
  height: 8px;
  cursor: ns-resize;
}

.popup-window__resize-handle.is-east,
.popup-window__resize-handle.is-west {
  inset-block: 8px;
  width: 8px;
  cursor: ew-resize;
}

.popup-window__resize-handle.is-north { top: -4px; }
.popup-window__resize-handle.is-east { right: -4px; }
.popup-window__resize-handle.is-south { bottom: -4px; }
.popup-window__resize-handle.is-west { left: -4px; }

.popup-window__resize-handle:is(.is-north-east, .is-south-east, .is-south-west, .is-north-west) {
  width: 12px;
  height: 12px;
}

.popup-window__resize-handle.is-north-east {
  top: -4px;
  right: -4px;
  cursor: nesw-resize;
}

.popup-window__resize-handle.is-south-east {
  right: -4px;
  bottom: -4px;
  cursor: nwse-resize;
}

.popup-window__resize-handle.is-south-west {
  bottom: -4px;
  left: -4px;
  cursor: nesw-resize;
}

.popup-window__resize-handle.is-north-west {
  top: -4px;
  left: -4px;
  cursor: nwse-resize;
}

.popup-window__resize-handle:focus-visible {
  background: color-mix(in srgb, var(--color-primary) 55%, transparent);
}
</style>

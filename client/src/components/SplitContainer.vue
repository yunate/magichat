<script setup lang="ts">
import {
  Comment,
  Fragment,
  Text,
  computed,
  isVNode,
  onUnmounted,
  useSlots,
  useTemplateRef,
  watch,
} from "vue";
import type { FunctionalComponent, VNode } from "vue";

type Props = {
  orientation: "horizontal" | "vertical";
  separatorLabels?: readonly string[];
  separatorVisible?: readonly boolean[];
  keyboardStep?: number;
  isReversed?: boolean;
  isDisabled?: boolean;
  hasItemBorders?: boolean;
};

type ResizeStart = Readonly<{
  index: number;
  pointerPosition: number;
  firstSize: number;
  secondSize: number;
  firstItem: HTMLElement;
  secondItem: HTMLElement;
}>;

const props = withDefaults(defineProps<Props>(), {
  separatorLabels: () => [],
  separatorVisible: () => [],
  keyboardStep: 16,
  isReversed: false,
  isDisabled: false,
  hasItemBorders: true,
});
const emit = defineEmits<{
  resize: [index: number, firstSize: number, secondSize: number];
  resizeEnd: [index: number, firstSize: number, secondSize: number];
  separatorDoubleClick: [index: number];
}>();
const slots = useSlots();
const container = useTemplateRef<HTMLElement>("container");
const items = computed(() => flattenVNodes(slots.default?.() ?? []));
const VNodeRenderer: FunctionalComponent<{ vnode: VNode }> = ({ vnode }) => vnode;
const originalItemFlex = new Map<HTMLElement, string>();
let resizeStart: ResizeStart | null = null;
let previousBodyCursor = "";
let previousBodyUserSelect = "";

watch([() => props.orientation, () => props.isReversed], () => {
  stopResize(false);
  restoreItemFlex();
});
onUnmounted(() => {
  stopResize(false);
  restoreItemFlex();
});

function flattenVNodes(nodes: readonly VNode[]): VNode[] {
  return nodes.flatMap((node) => {
    if (node.type === Comment || node.type === Text && String(node.children).trim().length === 0) return [];
    if (node.type !== Fragment || !Array.isArray(node.children)) return [node];
    return flattenVNodes(node.children.filter(isVNode));
  });
}

function startResize(index: number, event: PointerEvent): void {
  if (props.isDisabled || event.button !== 0) return;
  const separator = event.currentTarget;
  if (!(separator instanceof HTMLElement)) return;
  const firstItem = separator.previousElementSibling;
  const secondItem = separator.nextElementSibling;
  if (!(firstItem instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopPropagation();
  resizeStart = {
    index,
    pointerPosition: getPointerPosition(event),
    firstSize: getElementSize(firstItem),
    secondSize: getElementSize(secondItem),
    firstItem,
    secondItem,
  };
  freezeItemSizes();
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = props.orientation === "vertical" ? "col-resize" : "row-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeByPointer);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("pointercancel", finishResize);
}

function resetSeparator(index: number, event: MouseEvent): void {
  const separator = event.currentTarget;
  if (separator instanceof HTMLElement) {
    const firstItem = separator.previousElementSibling;
    const secondItem = separator.nextElementSibling;
    if (firstItem instanceof HTMLElement) restoreItemFlex(firstItem);
    if (secondItem instanceof HTMLElement) restoreItemFlex(secondItem);
  }
  emit("separatorDoubleClick", index);
}

function resizeByPointer(event: PointerEvent): void {
  const start = resizeStart;
  if (start === null) return;
  const direction = props.isReversed ? -1 : 1;
  applySize(start, start.firstSize + direction * (getPointerPosition(event) - start.pointerPosition), false);
}

function finishResize(): void {
  stopResize(true);
}

function stopResize(shouldEmit: boolean): void {
  const start = resizeStart;
  if (start === null) return;
  resizeStart = null;
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  window.removeEventListener("pointermove", resizeByPointer);
  window.removeEventListener("pointerup", finishResize);
  window.removeEventListener("pointercancel", finishResize);
  if (!shouldEmit) return;
  const sizes = currentSizes(start);
  emit("resizeEnd", start.index, sizes.first, sizes.second);
}

function resizeByKey(index: number, event: KeyboardEvent): void {
  if (props.isDisabled) return;
  const separator = event.currentTarget;
  if (!(separator instanceof HTMLElement)) return;
  const start = createKeyboardResizeStart(index, separator);
  if (start === null) return;
  let size: number;
  const direction = props.isReversed ? -1 : 1;
  switch (event.key) {
    case "ArrowLeft":
      if (props.orientation !== "vertical") return;
      size = start.firstSize - direction * props.keyboardStep;
      break;
    case "ArrowRight":
      if (props.orientation !== "vertical") return;
      size = start.firstSize + direction * props.keyboardStep;
      break;
    case "ArrowUp":
      if (props.orientation !== "horizontal") return;
      size = start.firstSize - direction * props.keyboardStep;
      break;
    case "ArrowDown":
      if (props.orientation !== "horizontal") return;
      size = start.firstSize + direction * props.keyboardStep;
      break;
    case "Home": size = minimumFirstSize(start); break;
    case "End": size = maximumFirstSize(start); break;
    default: return;
  }
  event.preventDefault();
  applySize(start, size, true);
}

function createKeyboardResizeStart(index: number, separator: HTMLElement): ResizeStart | null {
  const firstItem = separator.previousElementSibling;
  const secondItem = separator.nextElementSibling;
  if (!(firstItem instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) return null;
  const firstSize = getElementSize(firstItem);
  const start = {
    index,
    pointerPosition: 0,
    firstSize,
    secondSize: getElementSize(secondItem),
    firstItem,
    secondItem,
  };
  freezeItemSizes();
  return start;
}

function applySize(start: ResizeStart, requestedFirstSize: number, shouldEnd: boolean): void {
  const firstSize = Math.round(Math.min(
    maximumFirstSize(start),
    Math.max(minimumFirstSize(start), requestedFirstSize),
  ));
  const totalSize = start.firstSize + start.secondSize;
  const secondSize = Math.round(Math.max(0, totalSize - firstSize));
  start.firstItem.style.flexBasis = `${firstSize}px`;
  start.secondItem.style.flexBasis = `${secondSize}px`;
  emit("resize", start.index, firstSize, secondSize);
  if (shouldEnd) emit("resizeEnd", start.index, firstSize, secondSize);
}

function currentSizes(start: ResizeStart): { first: number; second: number } {
  return {
    first: getElementSize(start.firstItem),
    second: getElementSize(start.secondItem),
  };
}

function minimumFirstSize(start: ResizeStart): number {
  const firstMinimum = getMinimumSize(start.firstItem);
  const secondMaximum = getMaximumSize(start.secondItem);
  return Number.isFinite(secondMaximum)
    ? Math.max(firstMinimum, start.firstSize + start.secondSize - secondMaximum)
    : firstMinimum;
}

function maximumFirstSize(start: ResizeStart): number {
  return Math.max(
    minimumFirstSize(start),
    Math.min(
      getMaximumSize(start.firstItem),
      start.firstSize + start.secondSize - getMinimumSize(start.secondItem),
    ),
  );
}

function getPointerPosition(event: PointerEvent): number {
  return props.orientation === "vertical" ? event.clientX : event.clientY;
}

function getElementSize(element: HTMLElement | null): number {
  if (element === null) return 0;
  const bounds = element.getBoundingClientRect();
  return props.orientation === "vertical" ? bounds.width : bounds.height;
}

function getMinimumSize(element: HTMLElement | null): number {
  if (element === null) return 0;
  const style = getComputedStyle(element);
  return parseSize(props.orientation === "vertical" ? style.minWidth : style.minHeight, 0);
}

function getMaximumSize(element: HTMLElement | null): number {
  if (element === null) return Number.POSITIVE_INFINITY;
  const style = getComputedStyle(element);
  return parseSize(
    props.orientation === "vertical" ? style.maxWidth : style.maxHeight,
    Number.POSITIVE_INFINITY,
  );
}

function parseSize(value: string, defaultValue: number): number {
  const size = Number.parseFloat(value);
  return Number.isFinite(size) ? size : defaultValue;
}

function restoreItemFlex(item?: HTMLElement): void {
  if (item !== undefined) {
    const flex = originalItemFlex.get(item);
    if (flex !== undefined) item.style.flex = flex;
    originalItemFlex.delete(item);
    return;
  }
  for (const [managedItem, flex] of originalItemFlex) managedItem.style.flex = flex;
  originalItemFlex.clear();
}

function freezeItemSizes(): void {
  const root = container.value;
  if (root === null) return;
  const paneItems = [...root.children].filter((child): child is HTMLElement => {
    return child instanceof HTMLElement && !child.classList.contains("split-container__separator");
  });
  if (paneItems.length > 0 && paneItems.every((item) => originalItemFlex.has(item))) return;
  restoreItemFlex();
  const sizes = paneItems.map(getElementSize);
  paneItems.forEach((item, index) => {
    originalItemFlex.set(item, item.style.flex);
    const grow = index === paneItems.length - 1 ? 1 : 0;
    item.style.flex = `${grow} 1 ${sizes[index] ?? 0}px`;
  });
}

</script>

<template>
  <div
    ref="container"
    class="split-container"
    :class="{
      'split-container--vertical': orientation === 'vertical',
      'split-container--horizontal': orientation === 'horizontal',
      'split-container--reversed': isReversed,
      'split-container--item-borders': hasItemBorders,
    }"
  >
    <template v-for="(item, index) in items" :key="item.key ?? index">
      <VNodeRenderer :vnode="item" />
      <div
        v-if="index < items.length - 1"
        v-show="separatorVisible[index] !== false"
        class="split-container__separator"
        :class="{ 'is-disabled': isDisabled }"
        role="separator"
        :aria-label="separatorLabels[index] ?? 'Resize panels'"
        :aria-orientation="orientation"
        :tabindex="isDisabled ? undefined : 0"
        @pointerdown="startResize(index, $event)"
        @keydown="resizeByKey(index, $event)"
        @dblclick="resetSeparator(index, $event)"
      ></div>
    </template>
  </div>
</template>

<style scoped>
.split-container {
  min-width: 0;
  min-height: 0;
  display: flex;
}

.split-container--vertical {
  flex-direction: row;
}

.split-container--horizontal {
  flex-direction: column;
}

.split-container--vertical.split-container--reversed {
  flex-direction: row-reverse;
}

.split-container--horizontal.split-container--reversed {
  flex-direction: column-reverse;
}

.split-container__separator {
  position: relative;
  z-index: 6;
  flex: 0 0 3px;
  background: transparent;
  touch-action: none;
}

.split-container--vertical > .split-container__separator {
  width: 3px;
  cursor: col-resize;
}

.split-container--horizontal > .split-container__separator {
  height: 3px;
  cursor: row-resize;
}

.split-container__separator::before {
  position: absolute;
  width: 1px;
  height: 1px;
  border-radius: 50%;
  content: "";
  color: color-mix(in srgb, var(--color-text-muted) 55%, transparent);
  background: currentColor;
}

.split-container--vertical > .split-container__separator::before {
  top: 50%;
  left: 50%;
  box-shadow: 0 -3px currentColor, 0 3px currentColor;
  transform: translate(-50%, -50%);
}

.split-container--horizontal > .split-container__separator::before {
  top: 50%;
  left: 50%;
  box-shadow: -3px 0 currentColor, 3px 0 currentColor;
  transform: translate(-50%, -50%);
}

.split-container--vertical.split-container--item-borders:not(.split-container--reversed)
  > :not(.split-container__separator):has(+ .split-container__separator) {
  border-inline-end: 1px solid var(--color-divider);
}

.split-container--vertical.split-container--item-borders:not(.split-container--reversed)
  > .split-container__separator + :not(.split-container__separator) {
  border-inline-start: 1px solid var(--color-divider);
}

.split-container--vertical.split-container--reversed.split-container--item-borders
  > :not(.split-container__separator):has(+ .split-container__separator) {
  border-inline-start: 1px solid var(--color-divider);
}

.split-container--vertical.split-container--reversed.split-container--item-borders
  > .split-container__separator + :not(.split-container__separator) {
  border-inline-end: 1px solid var(--color-divider);
}

.split-container--horizontal.split-container--item-borders:not(.split-container--reversed)
  > :not(.split-container__separator):has(+ .split-container__separator) {
  border-block-end: 1px solid var(--color-divider);
}

.split-container--horizontal.split-container--item-borders:not(.split-container--reversed)
  > .split-container__separator + :not(.split-container__separator) {
  border-block-start: 1px solid var(--color-divider);
}

.split-container--horizontal.split-container--reversed.split-container--item-borders
  > :not(.split-container__separator):has(+ .split-container__separator) {
  border-block-start: 1px solid var(--color-divider);
}

.split-container--horizontal.split-container--reversed.split-container--item-borders
  > .split-container__separator + :not(.split-container__separator) {
  border-block-end: 1px solid var(--color-divider);
}

.split-container--vertical > .split-container__separator:hover::before,
.split-container--vertical > .split-container__separator:focus-visible::before {
  color: color-mix(in srgb, var(--color-text-muted) 78%, transparent);
  box-shadow: 0 -3px currentColor, 0 3px currentColor;
}

.split-container--horizontal > .split-container__separator:hover::before,
.split-container--horizontal > .split-container__separator:focus-visible::before {
  color: color-mix(in srgb, var(--color-text-muted) 78%, transparent);
  box-shadow: -3px 0 currentColor, 3px 0 currentColor;
}

.split-container__separator:focus-visible {
  outline: 0;
}

.split-container__separator.is-disabled {
  cursor: default;
  pointer-events: none;
}
</style>

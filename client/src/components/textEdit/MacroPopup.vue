<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import PopupWindow from "../PopupWindow.vue";
import type { MacroDisplayDetail } from "./textEditTypes";

type Props = {
  detail: MacroDisplayDetail;
  anchor: DOMRect;
  isAnchorHovered: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const CLOSE_DELAY_MS = 300;
const FADE_DURATION_MS = 300;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;
const VALUE_MIN_HEIGHT = 20;
const VALUE_MAX_HEIGHT = 220;
const popupWindow = useTemplateRef<InstanceType<typeof PopupWindow>>("popupWindow");
const valueControl = useTemplateRef<HTMLTextAreaElement>("valueControl");
const popupHeight = shallowRef<number | null>(null);
const viewportSize = shallowRef({ width: window.innerWidth, height: window.innerHeight });
let resizeObserver: ResizeObserver | null = null;

const popupStyle = computed<CSSProperties>(() => {
  const { width: viewportWidth, height: viewportHeight } = viewportSize.value;
  const popupWidth = Math.min(320, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, props.anchor.left),
    viewportWidth - popupWidth - VIEWPORT_MARGIN,
  );
  const below = props.anchor.bottom + ANCHOR_GAP;
  const measuredHeight = popupHeight.value;
  const top = measuredHeight === null || below + measuredHeight <= viewportHeight - VIEWPORT_MARGIN
    ? below
    : Math.max(VIEWPORT_MARGIN, props.anchor.top - measuredHeight - ANCHOR_GAP);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${popupWidth}px`,
    visibility: measuredHeight === null ? "hidden" : "visible",
  };
});
const displayedValue = computed(() => props.detail.error ?? props.detail.value);

watch(displayedValue, () => void nextTick(updateValueControlHeight));

onMounted(async () => {
  window.addEventListener("resize", updateViewportSize);
  await nextTick();
  updateValueControlHeight();
  const element = popupWindow.value?.getElement();
  if (element === null || element === undefined) return;
  resizeObserver = new ResizeObserver(() => updatePopupHeight(element));
  resizeObserver.observe(element);
  updatePopupHeight(element);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateViewportSize);
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function updateViewportSize(): void {
  viewportSize.value = { width: window.innerWidth, height: window.innerHeight };
  void nextTick(updateValueControlHeight);
}

function updatePopupHeight(element: HTMLElement): void {
  popupHeight.value = element.getBoundingClientRect().height;
}

function updateValueControlHeight(): void {
  const element = valueControl.value;
  if (element === null) return;
  element.style.height = "0";
  const height = Math.min(VALUE_MAX_HEIGHT, Math.max(VALUE_MIN_HEIGHT, element.scrollHeight));
  element.style.height = `${height}px`;
  element.style.overflowY = element.scrollHeight > VALUE_MAX_HEIGHT ? "auto" : "hidden";
}

</script>

<template>
  <PopupWindow
    ref="popupWindow"
    class="macro-popup"
    :style="popupStyle"
    is-externally-positioned
    semantic-role="tooltip"
    :dismiss-delay-ms="CLOSE_DELAY_MS"
    :fade-duration-ms="FADE_DURATION_MS"
    :is-dismiss-paused="isAnchorHovered"
    is-dismiss-paused-on-hover
    @dismiss="emit('close')"
  >
    <header class="macro-popup__header">
      <code>{{ detail.key }}</code>
      <span :class="{ 'is-warning': !detail.successful }">{{ detail.sourceType }}</span>
    </header>
    <p class="macro-popup__path">{{ detail.sourcePath }}</p>
    <div class="macro-popup__value" :class="{ 'is-warning': !detail.successful }">
      <div class="macro-popup__value-content">
        <textarea
          ref="valueControl"
          class="macro-popup__value-control"
          :value="displayedValue"
          rows="1"
          wrap="soft"
          readonly
          aria-label="Macro value"
          spellcheck="false"
        ></textarea>
      </div>
    </div>
  </PopupWindow>
</template>

<style scoped>
.macro-popup {
  position: fixed;
  z-index: 1000;
  padding: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface-deep);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-flyout);
}

.macro-popup__header,
.macro-popup__value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.macro-popup__header code {
  color: var(--color-code-variable);
  font-weight: 600;
}

.macro-popup__header span {
  padding: 2px 6px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-medium);
  font-size: 11px;
  font-weight: 600;
}

.macro-popup__header span.is-warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}

.macro-popup__path {
  margin: var(--space-2) 0;
  color: var(--color-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.macro-popup__value {
  min-height: 36px;
  align-items: flex-start;
  padding: var(--space-2);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.macro-popup__value:hover,
.macro-popup__value:focus-within {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-content-bg));
}

.macro-popup__value:focus-within {
  border-color: var(--color-primary);
}

.macro-popup__value.is-warning {
  border-color: color-mix(in srgb, var(--color-warning) 52%, var(--color-border));
}

.macro-popup__value-content {
  min-width: 0;
  max-height: 220px;
  flex: 1;
  overflow: hidden;
}

.macro-popup__value-control {
  width: 100%;
  min-height: 20px;
  max-height: 220px;
  display: block;
  padding: 0;
  resize: none;
  overflow-x: hidden;
  overflow-y: hidden;
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-radius: 0;
  font: inherit;
  line-height: 20px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  cursor: text;
  scrollbar-color: transparent transparent;
}

.macro-popup__value:hover .macro-popup__value-control,
.macro-popup__value:focus-within .macro-popup__value-control {
  scrollbar-color: var(--color-border) transparent;
}

.macro-popup__value-control::-webkit-scrollbar-thumb {
  background: transparent;
}

.macro-popup__value:hover .macro-popup__value-control::-webkit-scrollbar-thumb,
.macro-popup__value:focus-within .macro-popup__value-control::-webkit-scrollbar-thumb {
  background: var(--color-border);
  background-clip: padding-box;
}

.macro-popup__value-control:focus {
  outline: 0;
}

.macro-popup__value-control::selection {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 42%, transparent);
}

</style>

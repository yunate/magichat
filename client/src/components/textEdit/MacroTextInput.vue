<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type { ComponentPublicInstance, CSSProperties } from "vue";
import { MacroParser } from "../../../../common/macroParser";
import MacroPopup from "./MacroPopup.vue";
import type { MacroDisplayDetail } from "./textEditTypes";

type Props = {
  id: string;
  value: string;
  macroDetails: ReadonlyMap<string, MacroDisplayDetail>;
  readonly?: boolean;
  accessibleLabel: string;
  placeholder?: string;
};

type Segment = Readonly<{
  kind: "text" | "macro";
  text: string;
  key: string;
  index: number;
}>;

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  placeholder: "",
});
const emit = defineEmits<{
  input: [event: Event];
  compositionstart: [event: CompositionEvent];
  compositionend: [event: CompositionEvent];
  paste: [event: ClipboardEvent];
  heightChange: [lineCount: number];
}>();

const control = useTemplateRef<HTMLTextAreaElement>("control");
const scrollLeft = ref(0);
const scrollTop = ref(0);
const hoveredIndex = ref<number | null>(null);
const popupAnchor = ref<DOMRect | null>(null);
const isMacroHovered = ref(false);
const macroElements = new Map<number, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

watch(() => props.value, () => void nextTick(updateLineCount));

onMounted(() => {
  updateLineCount();
  const element = control.value;
  if (element === null) return;
  resizeObserver = new ResizeObserver(updateLineCount);
  resizeObserver.observe(element);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const segments = computed<readonly Segment[]>(() => {
  const result: Segment[] = [];
  let textStart = 0;
  MacroParser.extractReferences(props.value).forEach((reference, index) => {
    if (reference.start > textStart) {
      appendTextSegments(result, props.value.slice(textStart, reference.start));
    }
    result.push({
      kind: "macro",
      text: props.value.slice(reference.start, reference.end),
      key: reference.key,
      index,
    });
    textStart = reference.end;
  });
  if (textStart < props.value.length || result.length === 0) {
    appendTextSegments(result, props.value.slice(textStart));
  }
  return result;
});

function appendTextSegments(result: Segment[], text: string): void {
  result.push({ kind: "text", text, key: "", index: -1 });
}

const activeSegment = computed(() => segments.value.find(
  (segment) => segment.kind === "macro" && segment.index === hoveredIndex.value,
) ?? null);
const activeDetail = computed<MacroDisplayDetail | null>(() => {
  const segment = activeSegment.value;
  if (segment === null) return null;
  const detail = props.macroDetails.get(segment.key);
  if (detail !== undefined) return detail;
  return {
    key: segment.key || segment.text,
    sourceType: "Unresolved",
    sourcePath: "No matching parameter",
    value: segment.text,
    successful: false,
    error: `Unknown macro "${segment.key}"`,
  };
});

const overlayStyle = computed<CSSProperties>(() => ({
  transform: `translate(${-scrollLeft.value}px, ${-scrollTop.value}px)`,
}));

function setMacroElement(element: Element | ComponentPublicInstance | null, index: number): void {
  if (element instanceof HTMLElement) macroElements.set(index, element);
  else macroElements.delete(index);
}

function onScroll(): void {
  const element = control.value;
  if (element === null) return;
  scrollLeft.value = element.scrollLeft;
  scrollTop.value = element.scrollTop;
  closePopup();
}

function updateLineCount(): void {
  const element = control.value;
  if (element === null) return;
  const style = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0 || !Number.isFinite(padding)) return;
  const previousHeight = element.style.height;
  element.style.height = "0";
  const contentHeight = Math.max(lineHeight, element.scrollHeight - padding);
  element.style.height = previousHeight;
  emit("heightChange", Math.max(1, Math.ceil(contentHeight / lineHeight)));
}

function onPointerMove(event: PointerEvent): void {
  for (const segment of segments.value) {
    if (segment.kind !== "macro") continue;
    const element = macroElements.get(segment.index);
    if (element === undefined) continue;
    const bounds = element.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) continue;
    isMacroHovered.value = true;
    hoveredIndex.value = segment.index;
    popupAnchor.value = bounds;
    return;
  }
  isMacroHovered.value = false;
}

function leaveMacro(): void {
  isMacroHovered.value = false;
}

function closePopup(): void {
  isMacroHovered.value = false;
  hoveredIndex.value = null;
  popupAnchor.value = null;
}
</script>

<template>
  <div
    class="macro-input"
    @pointermove="onPointerMove"
    @pointerleave="leaveMacro"
  >
    <div class="macro-input__overlay" aria-hidden="true">
      <div class="macro-input__overlay-content" :style="overlayStyle">
        <span
          v-for="(segment, index) in segments"
          :key="`${index}:${segment.text}`"
          :ref="(element) => segment.kind === 'macro' && setMacroElement(element, segment.index)"
          :class="{
            'macro-input__macro': segment.kind === 'macro',
            'is-warning': segment.kind === 'macro'
              && macroDetails.get(segment.key)?.successful !== true,
          }"
        >{{ segment.text }}</span>
      </div>
    </div>
    <textarea
      :id="id"
      ref="control"
      class="macro-input__control"
      :value="value"
      :aria-label="accessibleLabel"
      :placeholder="placeholder"
      :readonly="readonly"
      wrap="soft"
      spellcheck="false"
      @input="emit('input', $event)"
      @compositionstart="emit('compositionstart', $event)"
      @compositionend="emit('compositionend', $event)"
      @paste="emit('paste', $event)"
      @scroll="onScroll"
      @blur="leaveMacro"
    ></textarea>
  </div>
  <Teleport to="body">
    <MacroPopup
      v-if="activeDetail !== null && popupAnchor !== null"
      :detail="activeDetail"
      :anchor="popupAnchor"
      :is-anchor-hovered="isMacroHovered"
      @close="closePopup"
    />
  </Teleport>
</template>

<style scoped>
.macro-input {
  position: relative;
  min-width: 0;
  min-height: 30px;
  height: 100%;
  overflow: hidden;
  color: var(--color-text);
  background: var(--macro-input-background, transparent);
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  font-family: var(--font-family);
  font-size: 13px;
  line-height: 20px;
}

.macro-input:focus-within {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-raised));
}

.macro-input__control,
.macro-input__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: var(--space-1) var(--space-2);
  margin: 0;
  font: inherit;
  line-height: inherit;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.macro-input__control {
  z-index: 2;
  resize: none;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  color: transparent;
  caret-color: var(--color-text);
  background: transparent;
  border: 0;
  outline: 0;
}

.macro-input:is(:hover, :focus-within) .macro-input__control {
  scrollbar-color: var(--color-border) transparent;
}

.macro-input__control::-webkit-scrollbar-thumb {
  background: transparent;
}

.macro-input:is(:hover, :focus-within) .macro-input__control::-webkit-scrollbar-thumb {
  background: var(--color-border);
  background-clip: padding-box;
}

.macro-input__control::selection {
  color: transparent;
  background: color-mix(in srgb, var(--color-primary) 42%, transparent);
}

.macro-input__control::placeholder {
  color: var(--color-text-muted);
}

.macro-input__overlay {
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.macro-input__overlay-content {
  width: 100%;
  min-width: 100%;
  min-height: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  transform-origin: top left;
}

.macro-input__macro {
  color: var(--color-code-variable);
  font-weight: 600;
}

.macro-input__macro.is-warning {
  color: var(--color-warning);
  font-weight: 400;
  text-decoration: wavy underline var(--color-warning);
  text-underline-offset: 2px;
}

</style>

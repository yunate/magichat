<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef } from "vue";
import type { ComponentPublicInstance, CSSProperties } from "vue";
import { MacroParser } from "../../../../common/macroParser";
import MacroPopup from "./MacroPopup.vue";
import type { MacroDisplayDetail } from "./textEditTypes";

type Props = {
  id: string;
  value: string;
  macroDetails: ReadonlyMap<string, MacroDisplayDetail>;
  multiline?: boolean;
  lineNumbers?: boolean;
  showWhitespace?: boolean;
  readonly?: boolean;
  accessibleLabel: string;
  placeholder?: string;
};

type Segment = Readonly<{
  kind: "text" | "space" | "tab" | "macro";
  text: string;
  key: string;
  index: number;
  isValid: boolean;
}>;

const props = withDefaults(defineProps<Props>(), {
  multiline: false,
  lineNumbers: false,
  showWhitespace: false,
  readonly: false,
  placeholder: "",
});
const emit = defineEmits<{
  input: [event: Event];
  beforeinput: [event: InputEvent];
  compositionstart: [event: CompositionEvent];
  compositionend: [event: CompositionEvent];
  keydown: [event: KeyboardEvent];
  copy: [event: ClipboardEvent];
  cut: [event: ClipboardEvent];
  paste: [event: ClipboardEvent];
}>();

const control = useTemplateRef<HTMLInputElement | HTMLTextAreaElement>("control");
const scrollLeft = ref(0);
const scrollTop = ref(0);
const hoveredIndex = ref<number | null>(null);
const popupAnchor = ref<DOMRect | null>(null);
const macroElements = new Map<number, HTMLElement>();
let closeTimer: number | null = null;

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
      isValid: true,
    });
    textStart = reference.end;
  });
  if (textStart < props.value.length || result.length === 0) {
    appendTextSegments(result, props.value.slice(textStart));
  }
  return result;
});

function appendTextSegments(result: Segment[], text: string): void {
  if (!props.showWhitespace) {
    result.push({ kind: "text", text, key: "", index: -1, isValid: true });
    return;
  }
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== " " && character !== "\t") continue;
    if (index > start) {
      result.push({ kind: "text", text: text.slice(start, index), key: "", index: -1, isValid: true });
    }
    result.push({
      kind: character === " " ? "space" : "tab",
      text: character,
      key: "",
      index: -1,
      isValid: true,
    });
    start = index + 1;
  }
  if (start < text.length || text.length === 0) {
    result.push({ kind: "text", text: text.slice(start), key: "", index: -1, isValid: true });
  }
}

const activeSegment = computed(() => segments.value.find(
  (segment) => segment.kind === "macro" && segment.index === hoveredIndex.value,
) ?? null);
const activeDetail = computed<MacroDisplayDetail | null>(() => {
  const segment = activeSegment.value;
  if (segment === null) return null;
  const detail = props.macroDetails.get(segment.key);
  if (detail !== undefined && segment.isValid) return detail;
  return {
    key: segment.key || segment.text,
    sourceType: "Unresolved",
    sourcePath: "No matching parameter",
    value: segment.text,
    successful: false,
    error: segment.isValid ? `Unknown macro "${segment.key}"` : "Macro key is invalid",
  };
});

const overlayStyle = computed<CSSProperties>(() => ({
  transform: `translate(${-scrollLeft.value}px, ${-scrollTop.value}px)`,
}));
const lineNumberStyle = computed<CSSProperties>(() => ({
  transform: `translateY(${-scrollTop.value}px)`,
}));
const displayedLineNumbers = computed(() => Array.from(
  { length: props.value.split("\n").length },
  (_value, index) => index + 1,
));

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

function onPointerMove(event: PointerEvent): void {
  for (const segment of segments.value) {
    if (segment.kind !== "macro") continue;
    const element = macroElements.get(segment.index);
    if (element === undefined) continue;
    const bounds = element.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) continue;
    cancelClose();
    hoveredIndex.value = segment.index;
    popupAnchor.value = bounds;
    return;
  }
  scheduleClose();
}

function scheduleClose(): void {
  cancelClose();
  closeTimer = window.setTimeout(closePopup, 120);
}

function cancelClose(): void {
  if (closeTimer === null) return;
  window.clearTimeout(closeTimer);
  closeTimer = null;
}

function closePopup(): void {
  cancelClose();
  hoveredIndex.value = null;
  popupAnchor.value = null;
}

onUnmounted(cancelClose);
</script>

<template>
  <div
    class="macro-input"
    :class="{
      'is-multiline': multiline,
      'has-line-numbers': multiline && lineNumbers,
    }"
    @pointermove="onPointerMove"
    @pointerleave="scheduleClose"
  >
    <div v-if="multiline && lineNumbers" class="macro-input__line-numbers" aria-hidden="true">
      <div :style="lineNumberStyle">
        <span v-for="lineNumber in displayedLineNumbers" :key="lineNumber">{{ lineNumber }}</span>
      </div>
    </div>
    <div class="macro-input__overlay" aria-hidden="true">
      <div class="macro-input__overlay-content" :style="overlayStyle">
        <span
          v-for="(segment, index) in segments"
          :key="`${index}:${segment.text}`"
          :ref="(element) => segment.kind === 'macro' && setMacroElement(element, segment.index)"
          :class="{
            'macro-input__macro': segment.kind === 'macro',
            'macro-input__whitespace': segment.kind === 'space' || segment.kind === 'tab',
            'is-space': segment.kind === 'space',
            'is-tab': segment.kind === 'tab',
            'is-warning': segment.kind === 'macro'
              && (!segment.isValid || macroDetails.get(segment.key)?.successful !== true),
          }"
        >{{ segment.text }}</span>
      </div>
    </div>
    <textarea
      v-if="multiline"
      :id="id"
      ref="control"
      class="macro-input__control"
      :value="value"
      :aria-label="accessibleLabel"
      :placeholder="placeholder"
      :readonly="readonly"
      spellcheck="false"
      wrap="off"
      @beforeinput="emit('beforeinput', $event)"
      @input="emit('input', $event)"
      @compositionstart="emit('compositionstart', $event)"
      @compositionend="emit('compositionend', $event)"
      @keydown="emit('keydown', $event)"
      @copy="emit('copy', $event)"
      @cut="emit('cut', $event)"
      @paste="emit('paste', $event)"
      @scroll="onScroll"
      @blur="closePopup"
    ></textarea>
    <input
      v-else
      :id="id"
      ref="control"
      class="macro-input__control"
      type="text"
      :value="value"
      :aria-label="accessibleLabel"
      :placeholder="placeholder"
      :readonly="readonly"
      spellcheck="false"
      @input="emit('input', $event)"
      @compositionstart="emit('compositionstart', $event)"
      @compositionend="emit('compositionend', $event)"
      @keydown="emit('keydown', $event)"
      @paste="emit('paste', $event)"
      @scroll="onScroll"
      @blur="closePopup"
    />
  </div>
  <Teleport to="body">
    <MacroPopup
      v-if="activeDetail !== null && popupAnchor !== null"
      :detail="activeDetail"
      :anchor="popupAnchor"
      @pointer-enter="cancelClose"
      @pointer-leave="scheduleClose"
    />
  </Teleport>
</template>

<style scoped>
.macro-input {
  position: relative;
  min-width: 0;
  height: 30px;
  overflow: hidden;
  color: var(--color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 20px;
}

.macro-input.is-multiline {
  height: 100%;
  min-height: 120px;
  border: 0;
  border-radius: 0;
  font-size: 14px;
  line-height: 22px;
}

.macro-input:not(.is-multiline):focus-within {
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
  tab-size: 2;
  white-space: pre;
}

.macro-input.has-line-numbers .macro-input__control,
.macro-input.has-line-numbers .macro-input__overlay {
  padding-inline-start: 52px;
}

.macro-input__control {
  z-index: 2;
  resize: none;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  color: transparent;
  caret-color: var(--color-text);
  background: transparent;
  border: 0;
  outline: 0;
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
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  transform-origin: top left;
}

.macro-input__macro {
  color: #9cdcfe;
  background: color-mix(in srgb, var(--color-primary) 13%, transparent);
  border-radius: 3px;
}

.macro-input__macro.is-warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}

.macro-input__whitespace {
  position: relative;
  color: transparent;
}

.macro-input__whitespace::before {
  position: absolute;
  inset-inline-start: 0;
  color: color-mix(in srgb, var(--color-text-muted) 58%, transparent);
}

.macro-input__whitespace.is-space::before {
  content: "·";
  color: color-mix(in srgb, var(--color-text-muted) 34%, transparent);
}

.macro-input__whitespace.is-tab::before {
  content: "→";
  color: color-mix(in srgb, var(--color-text-muted) 34%, transparent);
}

.macro-input__line-numbers {
  position: absolute;
  z-index: 3;
  inset: 0 auto 0 0;
  width: 44px;
  padding-block: var(--space-1);
  overflow: hidden;
  color: var(--color-text-muted);
  background: var(--color-content-bg);
  border-inline-end: 1px solid var(--color-border);
  font: inherit;
  line-height: inherit;
  text-align: end;
  pointer-events: none;
}

.macro-input__line-numbers div {
  display: flex;
  flex-direction: column;
  padding-inline-end: var(--space-2);
}

.macro-input__line-numbers span {
  height: 22px;
}
</style>

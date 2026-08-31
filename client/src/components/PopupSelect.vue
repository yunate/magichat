<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from "vue";
import type { CSSProperties } from "vue";
import PopupWindow from "./PopupWindow.vue";

export type PopupSelectOption = Readonly<{
  value: string;
  label: string;
}>;

const props = withDefaults(defineProps<{
  value: string;
  options: readonly PopupSelectOption[];
  accessibleLabel: string;
  labelledBy?: string;
  disabled?: boolean;
  isOptionRemovalEnabled?: boolean;
  isIndicatorVisible?: boolean;
  menuWidth?: number;
}>(), {
  disabled: false,
  isOptionRemovalEnabled: false,
  isIndicatorVisible: true,
});
const emit = defineEmits<{
  updateValue: [value: string];
  removeOption: [value: string];
}>();
defineSlots<{
  trigger(props: { selectedLabel: string }): unknown;
}>();

const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const menu = useTemplateRef<{ getElement: () => HTMLElement | null }>("menu");
const optionElements = ref<HTMLButtonElement[]>([]);
const anchor = shallowRef<DOMRect | null>(null);
const isOpen = ref(false);
const activeIndex = ref(0);
const menuId = `popup-select-${crypto.randomUUID()}`;

const selectedLabel = computed(() => props.options.find(
  (option) => option.value === props.value,
)?.label ?? props.value);
const isMenuAbove = computed(() => {
  const bounds = anchor.value;
  if (bounds === null) return false;
  const margin = 8;
  const menuHeight = Math.min(240, props.options.length * 30 + 8);
  return bounds.bottom + menuHeight > window.innerHeight - margin;
});
const menuStyle = computed<CSSProperties>(() => {
  const bounds = anchor.value;
  if (bounds === null) return {};
  const margin = 8;
  const menuHeight = Math.min(240, props.options.length * 30 + 8);
  const menuWidth = props.menuWidth ?? bounds.width;
  const top = isMenuAbove.value
    ? Math.max(margin, bounds.top - menuHeight + 1)
    : bounds.bottom - 1;
  return {
    top: `${top}px`,
    left: `${Math.max(margin, Math.min(bounds.left, window.innerWidth - menuWidth - margin))}px`,
    width: `${menuWidth}px`,
  };
});

onMounted(() => {
  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("resize", closeFromViewportChange);
  window.addEventListener("scroll", closeFromViewportChange, true);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", onWindowPointerDown);
  window.removeEventListener("resize", closeFromViewportChange);
  window.removeEventListener("scroll", closeFromViewportChange, true);
});

function toggleMenu(): void {
  if (isOpen.value) closeMenu(false);
  else openMenu();
}

function openMenu(preferredIndex?: number): void {
  if (props.disabled || props.options.length === 0 || trigger.value === null) return;
  const selectedIndex = props.options.findIndex((option) => option.value === props.value);
  activeIndex.value = preferredIndex ?? Math.max(0, selectedIndex);
  anchor.value = trigger.value.getBoundingClientRect();
  isOpen.value = true;
  void nextTick(() => optionElements.value[activeIndex.value]?.focus());
}

function closeMenu(shouldRestoreFocus: boolean): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  anchor.value = null;
  optionElements.value = [];
  if (shouldRestoreFocus) void nextTick(() => trigger.value?.focus());
}

function selectOption(value: string): void {
  emit("updateValue", value);
  closeMenu(true);
}

function removeOption(value: string, index: number): void {
  emit("removeOption", value);
  if (props.options.length === 1) {
    closeMenu(true);
    return;
  }
  void nextTick(() => {
    const nextIndex = Math.min(index, props.options.length - 1);
    activeIndex.value = nextIndex;
    optionElements.value[nextIndex]?.focus();
  });
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? 0 : props.options.length - 1);
  } else if (event.key === "Escape") {
    if (!isOpen.value) return;
    event.stopPropagation();
    closeMenu(false);
  }
}

function onOptionKeydown(event: KeyboardEvent): void {
  let nextIndex: number;
  switch (event.key) {
    case "ArrowDown": nextIndex = (activeIndex.value + 1) % props.options.length; break;
    case "ArrowUp": nextIndex = (activeIndex.value - 1 + props.options.length) % props.options.length; break;
    case "Home": nextIndex = 0; break;
    case "End": nextIndex = props.options.length - 1; break;
    case "Escape":
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    default: return;
  }
  event.preventDefault();
  activeIndex.value = nextIndex;
  optionElements.value[nextIndex]?.focus();
}

function setOptionElement(element: unknown, index: number): void {
  if (element instanceof HTMLButtonElement) optionElements.value[index] = element;
}

function onWindowPointerDown(event: PointerEvent): void {
  if (!isOpen.value || !(event.target instanceof Node)) return;
  if (trigger.value?.contains(event.target) || menu.value?.getElement()?.contains(event.target)) return;
  closeMenu(false);
}

function closeFromViewportChange(): void {
  closeMenu(false);
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="popup-select__trigger"
    :class="{ 'is-menu-above': isOpen && isMenuAbove }"
    :disabled="disabled"
    :aria-label="accessibleLabel"
    :aria-labelledby="labelledBy"
    aria-haspopup="listbox"
    :aria-expanded="isOpen"
    :aria-controls="isOpen ? menuId : undefined"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <slot name="trigger" :selected-label="selectedLabel">
      <span>{{ selectedLabel }}</span>
    </slot>
    <svg v-if="isIndicatorVisible" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
  </button>

  <Teleport to="body">
    <PopupWindow
      v-if="isOpen"
      :id="menuId"
      ref="menu"
      class="popup-select__menu"
      :class="isMenuAbove ? 'is-above' : 'is-below'"
      :style="menuStyle"
      is-externally-positioned
      semantic-role="listbox"
      :aria-label="accessibleLabel"
      :aria-labelledby="labelledBy"
    >
      <div
        v-for="(option, index) in options"
        :key="option.value"
        class="popup-select__option-row"
        role="presentation"
      >
        <button
          :ref="(element) => setOptionElement(element, index)"
          type="button"
          class="popup-select__option"
          :class="{ 'is-selected': option.value === value }"
          role="option"
          :aria-selected="option.value === value"
          @click="selectOption(option.value)"
          @focus="activeIndex = index"
          @keydown="onOptionKeydown"
        >
          <span>{{ option.label }}</span>
          <svg v-if="option.value === value" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>
        </button>
        <button
          v-if="isOptionRemovalEnabled"
          type="button"
          class="popup-select__remove"
          :aria-label="`Delete ${option.label}`"
          :title="`Delete ${option.label}`"
          @click="removeOption(option.value, index)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 4.5h9m-7.5 0 .5 8h5l.5-8M6.5 2.5h3l.5 2h-4zM7 6.5v4m2-4v4" />
          </svg>
        </button>
      </div>
    </PopupWindow>
  </Teleport>
</template>

<style scoped>
.popup-select__trigger {
  width: 100%;
  min-width: 0;
  height: var(--tree-row-height);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.popup-select__trigger:hover,
.popup-select__trigger[aria-expanded="true"] {
  border-color: var(--color-border);
  background: var(--color-surface-raised);
}

.popup-select__trigger[aria-expanded="true"]:not(.is-menu-above) {
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}

.popup-select__trigger[aria-expanded="true"].is-menu-above {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.popup-select__trigger:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.popup-select__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.popup-select__trigger span,
.popup-select__option span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popup-select__trigger svg,
.popup-select__option svg,
.popup-select__remove svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.popup-select__menu {
  z-index: 500;
  max-height: 240px;
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-popup);
}

.popup-select__menu.is-below {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.popup-select__menu.is-above {
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}

.popup-select__menu :deep(.popup-window__content) {
  padding: var(--space-1);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.popup-select__option {
  min-width: 0;
  flex: 1;
}

.popup-select__option-row {
  min-width: 0;
  display: flex;
  align-items: center;
}

.popup-select__option,
.popup-select__remove {
  min-width: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-small);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.popup-select__remove {
  width: 30px;
  flex: 0 0 30px;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted);
}

.popup-select__option:hover,
.popup-select__option:focus-visible,
.popup-select__remove:hover,
.popup-select__remove:focus-visible {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
  outline: 0;
}

.popup-select__remove:hover,
.popup-select__remove:focus-visible {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.popup-select__option.is-selected {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 18%, var(--color-surface-raised));
}
</style>

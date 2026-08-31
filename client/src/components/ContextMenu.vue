<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type { CSSProperties } from "vue";
import type { ContextMenuArea, ContextMenuPosition } from "./contextMenuTypes";

type Props = {
  position: ContextMenuPosition;
  area: ContextMenuArea;
};

const props = defineProps<Props>();
const menu = useTemplateRef<HTMLElement>("menu");
const VIEWPORT_MARGIN = 8;
const style = ref<CSSProperties>(createInitialStyle());

watch([() => props.position, () => props.area], () => {
  style.value = createInitialStyle();
  void nextTick(positionInArea);
});

onMounted(() => {
  void nextTick(positionInArea);
  window.addEventListener("resize", positionInArea);
});

onUnmounted(() => {
  window.removeEventListener("resize", positionInArea);
});

function positionInArea(): void {
  const element = menu.value;
  if (element === null) return;
  const bounds = element.getBoundingClientRect();
  const minimumX = props.area.left + VIEWPORT_MARGIN;
  const minimumY = props.area.top + VIEWPORT_MARGIN;
  const maximumX = Math.max(minimumX, props.area.right - bounds.width - VIEWPORT_MARGIN);
  const maximumY = Math.max(minimumY, props.area.bottom - bounds.height - VIEWPORT_MARGIN);
  style.value = {
    ...createInitialStyle(),
    left: `${Math.min(Math.max(minimumX, props.position.x), maximumX)}px`,
    top: `${Math.min(Math.max(minimumY, props.position.y), maximumY)}px`,
  };
}

function createInitialStyle(): CSSProperties {
  return {
    left: `${props.position.x}px`,
    top: `${props.position.y}px`,
    maxWidth: `${Math.max(0, props.area.right - props.area.left - 2 * VIEWPORT_MARGIN)}px`,
    maxHeight: `${Math.max(0, props.area.bottom - props.area.top - 2 * VIEWPORT_MARGIN)}px`,
  };
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="context-menu"
      :style="style"
      role="menu"
      @pointerdown.stop
    >
      <slot></slot>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 200;
  width: min(190px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  padding: var(--space-1);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-popup);
}

.context-menu :deep(button) {
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-medium);
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.context-menu :deep(button:hover) {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.context-menu :deep(button.is-danger) {
  color: var(--color-danger);
}

.context-menu :deep([role="separator"]) {
  height: 0;
  flex: none;
  margin: var(--space-1);
  border-block-start: 1px solid color-mix(in srgb, var(--color-text-muted) 36%, transparent);
}
</style>

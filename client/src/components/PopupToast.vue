<script setup lang="ts">
import { onUnmounted, ref } from "vue";

const DISPLAY_DURATION_MS = 1500;

const isVisible = ref(false);
const message = ref("");

let hideTimer: number | null = null;

function show(text: string): void {
  message.value = text;
  isVisible.value = true;
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    isVisible.value = false;
    hideTimer = null;
  }, DISPLAY_DURATION_MS);
}

defineExpose({ show });

onUnmounted(() => {
  if (hideTimer !== null) window.clearTimeout(hideTimer);
});
</script>

<template>
  <Transition name="popup-toast">
    <div v-if="isVisible" class="popup-toast" role="status" aria-live="polite">
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.popup-toast {
  position: absolute;
  z-index: 10;
  inset-block-start: var(--space-3);
  inset-inline-start: 50%;
  max-width: min(calc(100% - var(--space-6)), 320px);
  padding: var(--space-2) var(--space-3);
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  pointer-events: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgb(0 0 0 / 24%);
  transform: translateX(-50%);
}

.popup-toast-enter-active {
  transition: opacity 160ms ease-out, transform 160ms ease-out;
}

.popup-toast-leave-active {
  transition: opacity 120ms ease-in, transform 120ms ease-in;
}

.popup-toast-enter-from,
.popup-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -4px);
}

@media (prefers-reduced-motion: reduce) {
  .popup-toast-enter-active,
  .popup-toast-leave-active {
    transition: none;
  }
}
</style>
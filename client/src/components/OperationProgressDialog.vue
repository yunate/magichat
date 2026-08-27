<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, useTemplateRef, watch } from "vue";
import { getOperationProgressRequest } from "./operationProgressDialog";

const dialog = useTemplateRef<HTMLElement>("dialog");
const labelId = `operation-progress-dialog-label-${useId()}`;
const request = computed(() => getOperationProgressRequest());
const isVisible = ref(false);
let showTimer: number | null = null;
let returnFocus: HTMLElement | null = null;

watch(request, (currentRequest) => {
  clearShowTimer();
  if (currentRequest === null) {
    isVisible.value = false;
    return;
  }
  showTimer = window.setTimeout(() => {
    showTimer = null;
    isVisible.value = request.value?.id === currentRequest.id;
  }, currentRequest.delayMs);
}, { immediate: true });

watch(isVisible, (visible) => {
  if (visible) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(() => dialog.value?.focus());
    return;
  }
  const target = returnFocus;
  returnFocus = null;
  void nextTick(() => {
    if (target?.isConnected) target.focus();
  });
});

onUnmounted(() => {
  clearShowTimer();
});

function clearShowTimer(): void {
  if (showTimer === null) return;
  window.clearTimeout(showTimer);
  showTimer = null;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible && request !== null" class="operation-progress-dialog-backdrop">
      <section
        ref="dialog"
        class="operation-progress-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelId"
        tabindex="-1"
        @keydown.tab.prevent
      >
        <span class="operation-progress-dialog__spinner" aria-hidden="true"></span>
        <span :id="labelId" aria-live="polite">{{ request.label }}</span>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.operation-progress-dialog-backdrop {
  position: fixed;
  z-index: 350;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 36%);
  backdrop-filter: blur(2px);
}

.operation-progress-dialog {
  min-width: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5, 20px);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 16px 48px rgb(0 0 0 / 42%);
  font-size: 13px;
  font-weight: 500;
}

.operation-progress-dialog:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.operation-progress-dialog__spinner {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border: 2px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  border-block-start-color: var(--color-primary);
  border-radius: 50%;
  animation: operation-progress-dialog-spin 0.7s linear infinite;
}

@keyframes operation-progress-dialog-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .operation-progress-dialog__spinner {
    animation: none;
    border-color: var(--color-primary);
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, useId, useTemplateRef, watch } from "vue";
import {
  cancelConfirmDialog,
  getConfirmDialogRequest,
  resolveConfirmDialog,
} from "./confirmDialog";
import PopupWindow from "./PopupWindow.vue";

const dialog = useTemplateRef<InstanceType<typeof PopupWindow>>("dialog");
const titleId = `confirm-dialog-title-${useId()}`;
const descriptionId = `confirm-dialog-description-${useId()}`;
const request = computed(() => getConfirmDialogRequest());
let returnFocus: HTMLElement | null = null;

watch(request, (currentRequest, previousRequest) => {
  if (previousRequest === null && currentRequest !== null) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  if (currentRequest !== null) {
    void nextTick(() => {
      const dialogElement = dialog.value?.getElement();
      const defaultAction = dialogElement?.querySelector<HTMLElement>("[data-default-action]");
      (defaultAction ?? dialogElement)?.focus();
    });
    return;
  }
  const target = returnFocus;
  returnFocus = null;
  void nextTick(() => {
    if (target?.isConnected) target.focus();
  });
}, { immediate: true });

onUnmounted(() => {
  cancelConfirmDialog();
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    const currentRequest = request.value;
    if (currentRequest !== null) resolveConfirmDialog(currentRequest.cancelActionId);
    return;
  }
  const dialogElement = dialog.value?.getElement();
  if (event.key !== "Tab" || dialogElement === null || dialogElement === undefined) return;
  const focusable = Array.from(dialogElement.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    dialogElement.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    v-if="request !== null"
    class="confirm-dialog-backdrop"
    @pointerdown.self="resolveConfirmDialog(request.cancelActionId)"
  >
    <PopupWindow
      ref="dialog"
      class="confirm-dialog"
      modal
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <template #header>
        <header class="confirm-dialog__header">
          <h2 :id="titleId">{{ request.title }}</h2>
        </header>
      </template>
      <div :id="descriptionId" class="confirm-dialog__content">
        <div class="confirm-dialog__message">
          <p v-for="description in request.descriptions" :key="description">{{ description }}</p>
          <ul v-if="request.details !== undefined && request.details.length > 0" class="confirm-dialog__details">
            <li v-for="detail in request.details" :key="detail.id">{{ detail.label }}</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <footer>
          <button
            v-for="action in request.actions"
            :key="action.id"
            type="button"
            :class="{ 'is-primary': action.appearance === 'primary' }"
            :data-default-action="action.isDefault ? '' : undefined"
            @click="resolveConfirmDialog(action.id)"
          >{{ action.label }}</button>
        </footer>
      </template>
    </PopupWindow>
  </div>
</template>

<style scoped>
.confirm-dialog-backdrop {
  position: fixed;
  z-index: 400;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: var(--color-backdrop-emphasis);
  backdrop-filter: blur(3px);
}

.confirm-dialog {
  width: min(480px, calc(100vw - 32px));
  box-shadow: var(--shadow-confirm-dialog);
}

.confirm-dialog__header {
  min-height: 64px;
  display: flex;
  align-items: center;
  padding: var(--space-4) var(--space-5, 20px);
  border-block-end: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-text-muted));
  text-align: left;
}

.confirm-dialog h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.confirm-dialog__content {
  min-height: 112px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: var(--space-5, 20px);
  border-block-end: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-text-muted));
  text-align: left;
}

.confirm-dialog__message {
  width: 100%;
  min-width: 0;
}

.confirm-dialog__content p {
  margin: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: color-mix(in srgb, var(--color-text) 78%, var(--color-text-muted));
  font-size: 14px;
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: 0.005em;
}

.confirm-dialog__content p + p {
  margin-block-start: var(--space-1);
}

.confirm-dialog__details {
  max-height: 176px;
  margin: var(--space-3) 0 0;
  padding: var(--space-1);
  overflow: auto;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-bg) 48%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  list-style: none;
}

.confirm-dialog__details li {
  position: relative;
  min-height: 30px;
  min-width: 0;
  display: flex;
  align-items: center;
  padding-inline: var(--space-3) var(--space-2);
  overflow-wrap: anywhere;
  word-break: break-word;
  border-radius: var(--radius-small);
  font-size: 14px;
  line-height: 1.45;
  text-align: left;
}

.confirm-dialog__details li::before {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  margin-inline-end: var(--space-2);
  content: "";
  background: var(--color-primary);
  border-radius: 50%;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 13%, transparent);
}

.confirm-dialog__details li + li {
  border-block-start: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-text-muted));
}

.confirm-dialog footer {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5, 20px);
  text-align: right;
}

.confirm-dialog button {
  min-width: 72px;
  min-height: 32px;
  padding-inline: var(--space-4);
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface-raised) 88%, var(--color-text) 4%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.confirm-dialog button:hover {
  background: color-mix(in srgb, var(--color-text) 9%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-border) 58%, var(--color-text-muted));
}

.confirm-dialog button:active {
  transform: translateY(1px);
}

.confirm-dialog button.is-primary {
  color: var(--color-bg);
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 600;
}

.confirm-dialog button.is-primary:hover {
  filter: brightness(1.1);
}

.confirm-dialog button:focus-visible,
.confirm-dialog:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .confirm-dialog__header {
    padding-inline: var(--space-4);
  }

  .confirm-dialog__content {
    padding: var(--space-4);
  }

  .confirm-dialog footer {
    padding-inline: var(--space-4);
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog button {
    transition: none;
  }
}
</style>

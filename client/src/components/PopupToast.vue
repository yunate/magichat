<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";
import { gMessageStore } from "../messages/messageStore";
import type { PopupToastOptions } from "./popupToast";
import PopupWindow from "./PopupWindow.vue";

const DISPLAY_DURATION_MS = 1500;

const isVisible = ref(false);
const isPersistent = ref(false);
const message = ref("");
const actionText = ref("Close");
const popupWindow = useTemplateRef<{ restartDismiss: () => void }>("popupWindow");

function show(text: string, options: PopupToastOptions = {}): void {
  gMessageStore.pushMessage(options.level ?? "info", text);
  message.value = text;
  actionText.value = options.actionText ?? "Close";
  isPersistent.value = options.isPersistent ?? false;
  isVisible.value = true;
  void nextTick(() => popupWindow.value?.restartDismiss());
}

function hide(): void {
  isVisible.value = false;
}

defineExpose({ show });
</script>

<template>
  <PopupWindow
    v-if="isVisible"
    ref="popupWindow"
    class="popup-toast"
    :class="{ 'popup-toast--persistent': isPersistent }"
    style="top: var(--space-3); left: 50%; transform: translateX(-50%)"
    is-externally-positioned
    position-type="absolute"
    :semantic-role="isPersistent ? 'alert' : 'status'"
    :aria-live="isPersistent ? 'assertive' : 'polite'"
    :dismiss-delay-ms="isPersistent ? undefined : DISPLAY_DURATION_MS"
    :fade-duration-ms="isPersistent ? undefined : 300"
    @dismiss="hide"
  >
    <span>{{ message }}</span>
    <button v-if="isPersistent" type="button" @click="hide">{{ actionText }}</button>
  </PopupWindow>
</template>

<style scoped>
.popup-toast {
  position: absolute;
  z-index: 10;
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
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-toast);
}

.popup-toast--persistent {
  max-width: min(calc(100% - var(--space-6)), 560px);
  text-align: start;
  pointer-events: auto;
}

.popup-toast--persistent :deep(.popup-window__content) {
  gap: var(--space-2);
}

.popup-toast--persistent span {
  min-width: 0;
}

.popup-toast--persistent button {
  align-self: flex-end;
  flex: none;
  min-height: 30px;
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  cursor: pointer;
}

.popup-toast--persistent button:hover {
  border-color: var(--color-primary);
}

.popup-toast--persistent button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

</style>
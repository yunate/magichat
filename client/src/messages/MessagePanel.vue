<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { gMessageStore, messageLevelMeta } from "./messageStore";

// Store is oldest-first, so render as-is: newest at the bottom like a chat log.
const messages = computed(() => gMessageStore.messages);

// Within this distance from the bottom, auto-follow stays on; keeps it from fighting manual scroll-up.
const NEAR_BOTTOM_THRESHOLD = 48;

const emit = defineEmits<{
  (event: "close"): void;
}>();

const listRef = ref<HTMLUListElement | null>(null);

function onClear(): void {
  gMessageStore.clearMessages();
}

function onClose(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") onClose();
}

function scrollToBottom(): void {
  const list = listRef.value;
  if (list === null) return;
  list.scrollTop = list.scrollHeight;
}

function isNearBottom(): boolean {
  const list = listRef.value;
  if (list === null) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM_THRESHOLD;
}

// Track newest id, not length: at the cap length stays pinned (drop-oldest + append), so length-based follow would never fire.
watch(
  () => gMessageStore.latest.value?.id ?? null,
  (id) => {
    if (id === null) return; // Cleared list has no latest, so there is nothing to follow.
    if (!isNearBottom()) return; // Reading history: judged before the DOM patches in the new item.
    void nextTick(scrollToBottom);
  },
);

// Panel mounts only while open; bind/release Escape with the lifecycle.
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // Land on the latest message the moment the panel opens.
  void nextTick(scrollToBottom);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
</script>

<template>
  <section class="message-panel" role="dialog" aria-label="Message log" aria-modal="false">
    <header class="message-panel__header">
      <h2 class="message-panel__title">Messages</h2>
      <div class="message-panel__actions">
        <button type="button" class="message-panel__btn" :disabled="messages.length === 0" @click="onClear">
          Clear
        </button>
        <button type="button" class="message-panel__btn" aria-label="Close message log" @click="onClose">
          Close
        </button>
      </div>
    </header>

    <ul v-if="messages.length > 0" ref="listRef" class="message-panel__list">
      <li
        v-for="message in messages"
        :key="message.id"
        class="message-panel__item"
        :class="`is-${message.level}`"
      >
        <span class="message-panel__icon" :aria-label="messageLevelMeta[message.level].label">
          {{ messageLevelMeta[message.level].icon }}
        </span>
        <span class="message-panel__text">{{ message.text }}</span>
        <time class="message-panel__time" :datetime="new Date(message.timestamp).toISOString()">
          {{ formatTime(message.timestamp) }}
        </time>
      </li>
    </ul>
    <p v-else class="message-panel__empty">No messages</p>
  </section>
</template>

<style scoped>
.message-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: var(--message-bar-height);
  z-index: 60;
  width: min(360px, 90vw);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.message-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}

.message-panel__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.message-panel__actions {
  display: flex;
  gap: var(--space-2);
}

.message-panel__btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.message-panel__btn:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-primary);
}

.message-panel__btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.message-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-panel__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.message-panel__item {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-border);
  background: var(--color-bg);
}

.message-panel__item.is-info {
  border-left-color: var(--color-primary);
}

.message-panel__item.is-success {
  border-left-color: var(--color-success);
}

.message-panel__item.is-warning {
  border-left-color: var(--color-warning);
}

.message-panel__item.is-error {
  border-left-color: var(--color-danger);
}

.message-panel__icon {
  flex: none;
  font-size: 14px;
}

.message-panel__item.is-info .message-panel__icon {
  color: var(--color-primary);
}

.message-panel__item.is-success .message-panel__icon {
  color: var(--color-success);
}

.message-panel__item.is-warning .message-panel__icon {
  color: var(--color-warning);
}

.message-panel__item.is-error .message-panel__icon {
  color: var(--color-danger);
}

.message-panel__text {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.message-panel__time {
  flex: none;
  color: var(--color-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.message-panel__empty {
  margin: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

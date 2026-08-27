<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { gMessageStore, messageLevelMeta } from "./messageStore";
import MessagePanel from "./MessagePanel.vue";

const isPanelOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const latest = computed(() => gMessageStore.latest.value);
const unreadCount = computed(() => gMessageStore.unreadCount.value);
const latestText = computed(() => latest.value?.text ?? "No messages");
const levelClass = computed(() => (latest.value ? `is-${latest.value.level}` : "is-empty"));
const levelIcon = computed(() => (latest.value ? messageLevelMeta[latest.value.level].icon : "…"));

function togglePanel(): void {
  isPanelOpen.value = !isPanelOpen.value;
  if (isPanelOpen.value) gMessageStore.markAllRead();
}

function closePanel(): void {
  isPanelOpen.value = false;
}

function onWindowPointerDown(event: PointerEvent): void {
  if (!isPanelOpen.value) return;
  if (!(event.target instanceof Node)) return;
  if (rootRef.value?.contains(event.target)) return;
  closePanel();
}

onMounted(() => window.addEventListener("pointerdown", onWindowPointerDown));
onUnmounted(() => window.removeEventListener("pointerdown", onWindowPointerDown));
</script>

<template>
  <div ref="rootRef" class="message-bar-root">
    <transition name="message-panel-slide">
      <MessagePanel v-if="isPanelOpen" @close="closePanel" />
    </transition>
    <div
      class="message-bar"
      role="button"
      tabindex="0"
      :aria-expanded="isPanelOpen"
      aria-label="Toggle message log"
      @click="togglePanel"
      @keydown.enter.prevent="togglePanel"
      @keydown.space.prevent="togglePanel"
    >
      <span class="message-bar__icon" :class="levelClass" aria-hidden="true">{{ levelIcon }}</span>
      <span class="message-bar__text">{{ latestText }}</span>
      <span
        v-if="unreadCount > 0"
        class="message-bar__badge"
        :aria-label="`${unreadCount} unread messages`"
      >{{ unreadCount }}</span>
      <span class="message-bar__chevron" aria-hidden="true">{{ isPanelOpen ? "▾" : "▴" }}</span>
    </div>
  </div>
</template>

<style scoped>
.message-bar-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
}

.message-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: var(--message-bar-height);
  padding: 0 var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.message-bar:hover {
  background: var(--color-surface-raised);
}

.message-bar:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.message-bar__icon {
  flex: none;
  font-size: 14px;
  color: var(--color-text-muted);
}

.message-bar__icon.is-info {
  color: var(--color-primary);
}

.message-bar__icon.is-success {
  color: var(--color-success);
}

.message-bar__icon.is-warning {
  color: var(--color-warning);
}

.message-bar__icon.is-error {
  color: var(--color-danger);
}

.message-bar__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text);
}

.message-bar__badge {
  flex: none;
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-bg);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.message-bar__chevron {
  flex: none;
  color: var(--color-text-muted);
  font-size: 12px;
}

.message-panel-slide-enter-active,
.message-panel-slide-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.message-panel-slide-enter-from,
.message-panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>

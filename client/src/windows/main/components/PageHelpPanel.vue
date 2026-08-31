<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { PageDefinition } from "../pages/types";

type Props = {
  page: PageDefinition | null;
};

defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onUnmounted(() => window.removeEventListener("keydown", onWindowKeydown));

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}
</script>

<template>
  <div class="page-help-layer">
    <aside id="page-help-panel" class="page-help-panel" aria-label="Current page help">
      <header class="page-help-panel__header">
        <strong>{{ page?.title ?? "Page" }} Help</strong>
        <button type="button" aria-label="Close help" title="Close" @click="emit('close')">×</button>
      </header>
      <div class="page-help-panel__content">
        <component v-if="page?.helpComponent" :is="page.helpComponent" />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.page-help-layer {
  position: fixed;
  z-index: 30;
  inset: 48px 0 var(--message-bar-height);
}

.page-help-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-content-bg);
}

.page-help-panel__header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.page-help-panel__header strong {
  font-size: 13px;
  font-weight: 600;
}

.page-help-panel__header button {
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 20px;
  cursor: pointer;
}

.page-help-panel__header button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.page-help-panel__header button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.page-help-panel__content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
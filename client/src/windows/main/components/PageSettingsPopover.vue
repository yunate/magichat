<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";
import type { PageDefinition } from "../pages/types";

type Props = {
  page: PageDefinition | null;
};

defineProps<Props>();
const emit = defineEmits<{ close: [] }>();
const settingsComponent = useTemplateRef<{
  getCurrent?: () => unknown | Promise<unknown>;
  save?: () => void | Promise<void>;
}>("settingsComponent");

defineExpose({ getCurrent, save });

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onUnmounted(() => window.removeEventListener("keydown", onWindowKeydown));

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

async function save(): Promise<void> {
  await settingsComponent.value?.save?.();
}

async function getCurrent(): Promise<unknown> {
  return await settingsComponent.value?.getCurrent?.();
}
</script>

<template>
  <div class="page-settings-layer">
    <aside id="page-settings-panel" class="page-settings-panel" aria-label="Current page settings">
      <header class="page-settings-panel__header">
        <strong>{{ page?.title ?? "Page" }} Settings</strong>
        <button type="button" aria-label="Close settings" title="Close" @click="emit('close')">×</button>
      </header>
      <div class="page-settings-panel__content">
        <component
          v-if="page?.settingsComponent"
          :is="page.settingsComponent"
          ref="settingsComponent"
        />
        <p v-else>No settings are available for this page.</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.page-settings-layer {
  position: fixed;
  z-index: 30;
  inset: 48px 0 var(--message-bar-height);
}

.page-settings-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-content-bg);
}

.page-settings-panel__header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.page-settings-panel__header strong {
  font-size: 13px;
  font-weight: 600;
}

.page-settings-panel__header button {
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

.page-settings-panel__header button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.page-settings-panel__header button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.page-settings-panel__content {
  flex: 1;
  min-height: 0;
  padding: var(--space-6);
  overflow: auto;
}

.page-settings-panel__content p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>

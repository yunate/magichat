<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { APP_VERSION } from "../../../environment";

const emit = defineEmits<{ close: [] }>();

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onUnmounted(() => window.removeEventListener("keydown", onWindowKeydown));

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}
</script>

<template>
  <div class="about-layer">
    <aside id="about-panel" class="about-panel" aria-label="About MagicHat">
      <header class="about-panel__header">
        <strong>About MagicHat</strong>
        <button type="button" aria-label="Close About" title="Close" @click="emit('close')">×</button>
      </header>
      <div class="about-panel__content">
        <dl class="about-panel__details">
          <div>
            <dt>Version</dt>
            <dd>{{ APP_VERSION }}</dd>
          </div>
        </dl>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.about-layer {
  position: fixed;
  z-index: 30;
  inset: 48px 0 var(--message-bar-height);
}

.about-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-content-bg);
}

.about-panel__header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.about-panel__header strong {
  font-size: 13px;
  font-weight: 600;
}

.about-panel__header button {
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

.about-panel__header button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.about-panel__header button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.about-panel__content {
  flex: 1;
  min-height: 0;
  padding: var(--space-6);
  overflow: auto;
}

.about-panel__details {
  max-width: 480px;
  margin: 0;
}

.about-panel__details > div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: baseline;
  gap: var(--space-4);
  padding-block: var(--space-3);
}

.about-panel__details dt {
  color: var(--color-text-muted);
  font-size: 13px;
}

.about-panel__details dd {
  margin: 0;
  font-size: 13px;
}
</style>

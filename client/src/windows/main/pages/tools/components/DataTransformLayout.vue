<script setup lang="ts">
import SplitContainer from "../../../../../components/SplitContainer.vue";

type Props = {
  title: string;
  hint: string;
  leftLabel: string;
  rightLabel: string;
  separatorLabel: string;
};

defineProps<Props>();
</script>

<template>
  <section class="data-transform">
    <header class="data-transform__header">
      <h1 class="data-transform__title">{{ title }}</h1>
      <p class="data-transform__hint">{{ hint }}</p>
    </header>
    <div class="data-transform__toolbar">
      <slot name="toolbar"></slot>
    </div>
    <SplitContainer
      class="data-transform__workspace"
      orientation="vertical"
      :separator-labels="[separatorLabel]"
      :has-item-borders="false"
    >
      <section class="data-transform__pane">
        <div class="data-transform__pane-label">
          <span>{{ leftLabel }}</span>
          <slot name="leftActions"></slot>
        </div>
        <slot name="left"></slot>
      </section>
      <section class="data-transform__pane">
        <div class="data-transform__pane-label">
          <span>{{ rightLabel }}</span>
          <slot name="rightActions"></slot>
        </div>
        <slot name="right"></slot>
      </section>
    </SplitContainer>
  </section>
</template>

<style scoped>
.data-transform {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.data-transform__header,
.data-transform__toolbar {
  flex: none;
}

.data-transform__title {
  margin: 0 0 var(--space-1);
  font-size: 22px;
}

.data-transform__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.data-transform__toolbar,
.data-transform__pane-label {
  display: flex;
  align-items: center;
}

.data-transform__toolbar {
  gap: var(--space-3);
}

.data-transform__workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.data-transform__pane {
  min-width: 240px;
  min-height: 0;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface);
}

.data-transform__pane-label {
  height: var(--tool-pane-header-height);
  flex: none;
  justify-content: space-between;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  border-block-end: 1px solid var(--color-border);
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
</style>
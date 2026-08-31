<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import SplitContainer from "../../../../../components/SplitContainer.vue";

type Props = {
  title: string;
  hint?: string;
  leftLabel?: string;
  rightLabel?: string;
};

const props = defineProps<Props>();
const narrowLayoutQuery = window.matchMedia("(max-width: 720px)");
const isNarrowLayout = ref(narrowLayoutQuery.matches);

onMounted(() => narrowLayoutQuery.addEventListener("change", onNarrowLayoutChange));
onUnmounted(() => narrowLayoutQuery.removeEventListener("change", onNarrowLayoutChange));

function onNarrowLayoutChange(event: MediaQueryListEvent): void {
  isNarrowLayout.value = event.matches;
}
</script>

<template>
  <div class="tool-split">
    <header class="tool-split__header">
      <h1 class="tool-split__title">{{ title }}</h1>
      <p v-if="hint" class="tool-split__hint">{{ hint }}</p>
    </header>
    <div v-if="$slots.toolbar" class="tool-split__toolbar">
      <slot name="toolbar" />
    </div>
    <SplitContainer
      class="tool-split__split"
      :orientation="isNarrowLayout ? 'horizontal' : 'vertical'"
      :separator-labels="[`Resize ${props.leftLabel ?? 'left'} and ${props.rightLabel ?? 'right'} panes`]"
      :has-item-borders="false"
    >
      <section class="tool-split__pane">
        <div v-if="leftLabel || $slots.leftActions" class="tool-split__pane-label">
          <span>{{ leftLabel }}</span>
          <slot name="leftActions" />
        </div>
        <slot name="left" />
      </section>
      <section class="tool-split__pane">
        <div v-if="rightLabel || $slots.rightActions" class="tool-split__pane-label">
          <span>{{ rightLabel }}</span>
          <slot name="rightActions" />
        </div>
        <slot name="right" />
      </section>
    </SplitContainer>
  </div>
</template>

<style scoped>
.tool-split {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  gap: var(--space-4);
}

.tool-split__header {
  flex: none;
}

.tool-split__title {
  margin: 0 0 var(--space-1);
  font-size: 22px;
}

.tool-split__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.tool-split__toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tool-split__split {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tool-split__pane {
  min-width: 240px;
  min-height: 0;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  overflow: hidden;
  background: var(--color-surface);
}

.tool-split__pane-label {
  height: var(--tool-pane-header-height);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}

@media (max-width: 720px) {
  .tool-split {
    min-width: 0;
    overflow-y: auto;
  }

  .tool-split__split {
    min-height: 443px;
    flex: none;
  }

  .tool-split__pane {
    min-width: 0;
    min-height: 220px;
  }
}
</style>

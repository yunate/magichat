<script setup lang="ts">
import { computed } from "vue";
import type { ToolDefinition } from "../../tools/types";

const props = defineProps<{
  tools: readonly ToolDefinition[];
  activeId: string;
}>();

defineEmits<{
  select: [id: string];
}>();

const topTools = computed(() => props.tools.filter((tool) => !tool.isPinnedToBottom));
const bottomTools = computed(() => props.tools.filter((tool) => tool.isPinnedToBottom));
const orderedTools = computed(() => [...topTools.value, ...bottomTools.value]);
const pinnedFirstId = computed(() => bottomTools.value[0]?.id);
</script>

<template>
  <nav class="tool-tabs" role="tablist" aria-orientation="vertical" aria-label="Tools">
    <button
      v-for="tool in orderedTools"
      :id="`tool-tab-${tool.id}`"
      :key="tool.id"
      type="button"
      role="tab"
      class="tool-tabs__item"
      :class="{ 'is-active': tool.id === activeId, 'is-pinned-first': tool.id === pinnedFirstId }"
      :aria-selected="tool.id === activeId"
      :tabindex="tool.id === activeId ? 0 : -1"
      @click="$emit('select', tool.id)"
    >
      {{ tool.title }}
    </button>
  </nav>
</template>

<style scoped>
.tool-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  height: 100%;
  padding: var(--space-3);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.tool-tabs__item.is-pinned-first {
  margin-top: auto;
}

.tool-tabs__item {
  appearance: none;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.tool-tabs__item:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.tool-tabs__item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.tool-tabs__item.is-active {
  color: var(--color-primary);
  background: var(--color-surface-selected);
}
</style>

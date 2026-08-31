<script setup lang="ts">
import { computed } from "vue";
import {
  TOOL_CATEGORIES,
  type ToolCategory,
  type ToolDefinition,
  type ToolsGroupId,
} from "../../tools/types";

type ToolGroupDefinition = Readonly<{
  id: ToolCategory;
  title: string;
}>;

type ToolGroup = Readonly<{
  id: ToolsGroupId;
  title: string;
  tools: readonly ToolDefinition[];
}>;

const TOOL_GROUP_TITLES: Readonly<Record<ToolCategory, string>> = {
  system: "System",
  "text-data": "Text & Data",
  developer: "Developer",
  image: "Image",
};
const TOOL_GROUPS: readonly ToolGroupDefinition[] = TOOL_CATEGORIES.map((id) => ({
  id,
  title: TOOL_GROUP_TITLES[id],
}));

const props = defineProps<{
  tools: readonly ToolDefinition[];
  activeId: string;
  favoriteToolIds: readonly string[];
  collapsedGroupIds: readonly ToolsGroupId[];
  settingsStatus: "loading" | "ready" | "error";
  settingsDisabled: boolean;
  selectionDisabled: boolean;
}>();

defineEmits<{
  select: [id: string];
  retrySettings: [];
  toggleFavorite: [id: string];
  toggleGroup: [id: ToolsGroupId];
}>();

const favoriteIds = computed(() => new Set(props.favoriteToolIds));
const groups = computed<readonly ToolGroup[]>(() => {
  const favoriteTools = props.tools.filter((tool) => favoriteIds.value.has(tool.id));
  const categoryGroups = TOOL_GROUPS
    .map((group) => ({
      ...group,
      tools: props.tools.filter((tool) => tool.category === group.id),
    }))
    .filter((group) => group.tools.length > 0);
  return favoriteTools.length > 0
    ? [{ id: "favorites", title: "Favorites", tools: favoriteTools }, ...categoryGroups]
    : categoryGroups;
});

function isGroupCollapsed(id: ToolsGroupId): boolean {
  return props.collapsedGroupIds.includes(id);
}
</script>

<template>
  <nav class="tool-tabs" aria-label="Tools" :aria-busy="settingsStatus === 'loading'">
    <div v-if="settingsStatus === 'error'" class="tool-tabs__settings-error" role="alert">
      <span>Failed to load settings.</span>
      <button type="button" class="tool-tabs__retry" @click="$emit('retrySettings')">
        Retry
      </button>
    </div>
    <section v-for="group in groups" :key="group.id" class="tool-tabs__group">
      <h2 class="tool-tabs__group-title">
        <button
          class="tool-tabs__group-toggle"
          type="button"
          :aria-expanded="!isGroupCollapsed(group.id)"
          :aria-controls="`tools-group-${group.id}`"
          :disabled="settingsDisabled"
          @click="$emit('toggleGroup', group.id)"
        >
          <svg
            class="tool-tabs__chevron"
            :class="{ 'is-collapsed': isGroupCollapsed(group.id) }"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="m7 9 5 5 5-5" />
          </svg>
          <span>{{ group.title }}</span>
          <span class="tool-tabs__count">{{ group.tools.length }}</span>
        </button>
      </h2>
      <div v-if="!isGroupCollapsed(group.id)" :id="`tools-group-${group.id}`" class="tool-tabs__items">
        <div v-for="tool in group.tools" :key="tool.id" class="tool-tabs__row">
          <button
            :id="`tool-tab-${group.id}-${tool.id}`"
            type="button"
            class="tool-tabs__item"
            :class="{ 'is-active': tool.id === activeId }"
            :aria-current="tool.id === activeId ? 'page' : undefined"
            :disabled="selectionDisabled"
            @click="$emit('select', tool.id)"
          >
            {{ tool.title }}
          </button>
          <button
            class="tool-tabs__favorite"
            :class="{ 'is-favorite': favoriteIds.has(tool.id) }"
            type="button"
            :aria-label="favoriteIds.has(tool.id) ? `Remove ${tool.title} from favorites` : `Add ${tool.title} to favorites`"
            :title="favoriteIds.has(tool.id) ? 'Remove from favorites' : 'Add to favorites'"
            :aria-pressed="favoriteIds.has(tool.id)"
            :disabled="settingsDisabled"
            @click="$emit('toggleFavorite', tool.id)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.19l-5.56 2.93 1.06-6.2L3 9.53l6.22-.9L12 3Z" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  </nav>
</template>

<style scoped>
.tool-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-2);
  background: var(--color-surface);
  overflow-y: auto;
}

.tool-tabs__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tool-tabs__settings-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  color: var(--color-text-muted);
  font-size: 12px;
}

.tool-tabs__retry {
  flex: none;
  margin-left: auto;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-small);
  color: var(--color-primary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.tool-tabs__retry:hover {
  background: var(--color-surface-raised);
}

.tool-tabs__retry:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.tool-tabs__group + .tool-tabs__group {
  padding-top: var(--space-2);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
}

.tool-tabs__group-title {
  margin: 0;
  font-size: 11px;
}

.tool-tabs__group-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-small);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: left;
  cursor: pointer;
}

.tool-tabs__group-toggle:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.tool-tabs__group-toggle:focus-visible,
.tool-tabs__item:focus-visible,
.tool-tabs__favorite:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.tool-tabs__group-toggle:disabled,
.tool-tabs__favorite:disabled {
  cursor: wait;
  opacity: 0.6;
}

.tool-tabs__chevron {
  width: 14px;
  height: 14px;
  flex: none;
  margin-right: var(--space-1);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s ease;
}

.tool-tabs__chevron.is-collapsed {
  transform: rotate(-90deg);
}

.tool-tabs__count {
  margin-left: auto;
  min-width: 20px;
  padding: 1px var(--space-1);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  text-align: center;
  opacity: 0.8;
}

.tool-tabs__items {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 24px;
}

.tool-tabs__items::before {
  content: "";
  position: absolute;
  top: -4px;
  bottom: 17px;
  left: 15px;
  width: 1px;
  background: color-mix(in srgb, var(--color-border) 80%, var(--color-surface));
  pointer-events: none;
}

.tool-tabs__row {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  border-radius: var(--radius-small);
}

.tool-tabs__item {
  min-width: 0;
  flex: 1;
  appearance: none;
  overflow: hidden;
  min-height: 34px;
  padding: var(--space-2) 38px var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.tool-tabs__row:hover .tool-tabs__item:not(.is-active) {
  color: var(--color-text);
  background: var(--color-surface-hover, color-mix(in srgb, var(--color-surface-raised) 62%, var(--color-surface)));
}

.tool-tabs__item.is-active {
  color: var(--color-text);
  background: var(--color-surface-selected);
  font-weight: 400;
}

.tool-tabs__favorite {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  z-index: 1;
  display: grid;
  place-items: center;
  visibility: hidden;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  padding: 0;
  border: 0;
  border-radius: var(--radius-small);
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  cursor: pointer;
}

.tool-tabs__row:hover .tool-tabs__favorite,
.tool-tabs__row:focus-within .tool-tabs__favorite {
  visibility: visible;
}

.tool-tabs__favorite:hover:not(:disabled),
.tool-tabs__favorite.is-favorite {
  color: var(--color-primary);
}

.tool-tabs__favorite svg {
  width: 16px;
  height: 16px;
  fill: transparent;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
}

.tool-tabs__favorite.is-favorite svg {
  fill: currentColor;
}

@media (prefers-reduced-motion: reduce) {
  .tool-tabs__chevron,
  .tool-tabs__item {
    transition: none;
  }
}
</style>

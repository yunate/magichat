<script setup lang="ts">
import { computed } from "vue";
import type { TaskTemplate } from "../../../../../../../common/tasks/taskTemplate";

const props = defineProps<{
  templates: readonly TaskTemplate[];
  isCollapsed: boolean;
}>();

const emit = defineEmits<{
  select: [template: TaskTemplate];
  delete: [template: TaskTemplate];
  toggleCollapse: [];
}>();

const builtinTemplates = computed(() => props.templates.filter((t) => t.builtin));
const savedTemplates = computed(() => props.templates.filter((t) => !t.builtin));

function onSelect(template: TaskTemplate): void {
  emit("select", template);
}

// Saved (user) templates only; the parent confirms before it calls the delete RPC.
function onDelete(template: TaskTemplate): void {
  emit("delete", template);
}

function onToggle(): void {
  emit("toggleCollapse");
}
</script>

<template>
  <aside class="template-sidebar" :class="{ 'is-collapsed': props.isCollapsed }">
    <div class="template-sidebar__header">
      <h2 v-show="!props.isCollapsed" class="template-sidebar__title">Templates</h2>
      <button
        type="button"
        class="template-sidebar__toggle"
        :aria-label="props.isCollapsed ? 'Expand templates' : 'Collapse templates'"
        :aria-expanded="!props.isCollapsed"
        @click="onToggle"
      >
        <svg
          class="template-sidebar__toggle-icon"
          :class="{ 'is-collapsed': props.isCollapsed }"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 2.5 4.5 7 9 11.5" />
        </svg>
      </button>
    </div>

    <div v-show="!props.isCollapsed" class="template-sidebar__body">
      <p class="template-sidebar__group-label">Built-in</p>
      <ul class="template-sidebar__list">
        <li v-for="template in builtinTemplates" :key="template.id">
          <button type="button" class="template-sidebar__item" @click="onSelect(template)">
            <span class="template-sidebar__item-name">{{ template.name }}</span>
            <span class="template-sidebar__item-type">Script</span>
          </button>
        </li>
      </ul>

      <template v-if="savedTemplates.length > 0">
        <p class="template-sidebar__group-label">Saved scripts</p>
        <ul class="template-sidebar__list">
          <li v-for="template in savedTemplates" :key="template.id" class="template-sidebar__row">
            <button type="button" class="template-sidebar__item" @click="onSelect(template)">
              <span class="template-sidebar__item-name">{{ template.name }}</span>
              <span class="template-sidebar__item-type">Script</span>
            </button>
            <button
              type="button"
              class="template-sidebar__delete"
              :aria-label="`Delete template ${template.name}`"
              @click.stop="onDelete(template)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                <path d="M3 4h8M5.5 4V2.5h3V4M5.5 6.5v4M8.5 6.5v4M4 4l.5 7.5h5L10 4" />
              </svg>
            </button>
          </li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.template-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: none;
  width: 220px;
  min-height: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  transition: width 0.15s ease;
}

.template-sidebar.is-collapsed {
  width: 44px;
  padding: var(--space-2);
  overflow: hidden;
}

.template-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex: none;
}

.template-sidebar__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.template-sidebar__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.template-sidebar__toggle:hover {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.template-sidebar__toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.template-sidebar__toggle-icon {
  display: block;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  transition: transform 0.15s ease;
}

.template-sidebar__toggle-icon.is-collapsed {
  transform: rotate(180deg);
}

.template-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
}

.template-sidebar__group-label {
  margin: var(--space-1) 0 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.template-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.template-sidebar__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

/* Saved rows overlay a delete button on the right, revealed on hover/focus-within to stay uncluttered. */
.template-sidebar__row {
  position: relative;
}

.template-sidebar__row .template-sidebar__item {
  padding-right: calc(var(--space-3) + 24px);
}

.template-sidebar__delete {
  position: absolute;
  top: 50%;
  right: var(--space-2);
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.template-sidebar__row:hover .template-sidebar__delete,
.template-sidebar__row:focus-within .template-sidebar__delete {
  opacity: 1;
}

.template-sidebar__delete svg {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.template-sidebar__delete:hover {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.template-sidebar__delete:focus-visible {
  opacity: 1;
  outline: 2px solid var(--color-danger);
  outline-offset: 2px;
}

.template-sidebar__item:hover {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-raised));
}

.template-sidebar__item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.template-sidebar__item-name {
  font-size: 13px;
  font-weight: 500;
}

.template-sidebar__item-type {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>

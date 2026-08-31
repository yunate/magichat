<script setup lang="ts">
type SortDirection = "none" | "descending" | "ascending";

type Props = {
  label: string;
  direction: SortDirection;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  updateDirection: [direction: SortDirection];
}>();

function onClick(): void {
  const nextDirection = props.direction === "none"
    ? "descending"
    : props.direction === "descending" ? "ascending" : "none";
  emit("updateDirection", nextDirection);
}

function getTip(): string {
  switch (props.direction) {
    case "ascending": return `${props.label}: currently ascending. Click to clear sorting.`;
    case "descending": return `${props.label}: currently descending. Click to sort ascending.`;
    case "none": return `${props.label}: not sorted. Click to sort descending.`;
  }
}
</script>

<template>
  <button
    type="button"
    class="sort-button"
    :class="{ 'is-active': props.direction !== 'none' }"
    :aria-label="getTip()"
    :aria-pressed="props.direction !== 'none'"
    :title="getTip()"
    @click="onClick"
  >
    <span class="sort-button__label">{{ props.label }}</span>
    <span class="sort-button__icon-wrap" aria-hidden="true">
      <svg class="sort-button__icon" viewBox="0 0 16 16" focusable="false">
        <path
          v-if="props.direction === 'descending'"
          d="m4.5 6 3.5 3.5L11.5 6"
        />
        <path
          v-else-if="props.direction === 'ascending'"
          d="M4.5 10 8 6.5l3.5 3.5"
        />
        <path
          v-else
          d="m5 6 3-3 3 3M5 10l3 3 3-3"
        />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.sort-button {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  min-width: 124px;
  min-height: 34px;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sort-button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}

.sort-button.is-active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.sort-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.sort-button__label {
  white-space: nowrap;
}

.sort-button__icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
}

.sort-button:hover .sort-button__icon-wrap,
.sort-button.is-active .sort-button__icon-wrap {
  color: currentColor;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
}

.sort-button__icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}
</style>

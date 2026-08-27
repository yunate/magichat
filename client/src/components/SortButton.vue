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
    <span>{{ props.label }}</span>
    <svg
      v-if="props.direction === 'descending'"
      class="sort-button__icon"
      viewBox="0 0 10 18"
      aria-hidden="true"
    ><path d="M5 2v13m-3-3 3 3 3-3" /></svg>
    <svg
      v-else-if="props.direction === 'ascending'"
      class="sort-button__icon"
      viewBox="0 0 10 18"
      aria-hidden="true"
    ><path d="M5 16V3M2 6l3-3 3 3" /></svg>
  </button>
</template>

<style scoped>
.sort-button {
  position: relative;
  width: 112px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.sort-button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.sort-button.is-active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.sort-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.sort-button__icon {
  position: absolute;
  inset-inline-end: var(--space-2);
  inset-block-start: 50%;
  width: 10px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
  transform: translateY(-50%);
}

</style>

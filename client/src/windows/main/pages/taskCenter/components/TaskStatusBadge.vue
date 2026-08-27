<script setup lang="ts">
import { computed } from "vue";
import type { TaskStatus } from "../../../../../../../common/tasks/taskType";

const props = defineProps<{ status: TaskStatus }>();

const STATUS_LABELS: Record<TaskStatus, string> = {
  notStarted: "Not started",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  abandoned: "Abandoned",
};

const label = computed(() => STATUS_LABELS[props.status]);
</script>

<template>
  <span class="task-badge" :class="`task-badge--${props.status}`">{{ label }}</span>
</template>

<style scoped>
.task-badge {
  width: 76px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.task-badge--notStarted {
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.task-badge--running {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-primary);
}

.task-badge--succeeded {
  background: color-mix(in srgb, var(--color-success) 20%, transparent);
  color: var(--color-success);
}

.task-badge--failed {
  background: color-mix(in srgb, var(--color-danger) 20%, transparent);
  color: var(--color-danger);
}

.task-badge--abandoned {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}
</style>

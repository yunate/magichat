<script setup lang="ts">
import ScriptDetail from "./ScriptDetail.vue";
import TaskItemTemplate from "./TaskItemTemplate.vue";
import type { TaskInfo } from "../../../../../../../common/tasks/taskInfo";

const props = defineProps<{
  task: TaskInfo;
  isExpanded: boolean;
  logs: readonly string[];
  isLogLoading: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  isUnviewed?: boolean;
}>();

const emit = defineEmits<{
  stop: [id: string];
  toggle: [id: string];
  runNew: [id: string];
  select: [payload: { id: string; isChecked: boolean }];
  pin: [payload: { id: string; isPinned: boolean }];
  revealLog: [id: string];
  viewed: [id: string];
}>();
</script>

<template>
  <TaskItemTemplate
    :task="props.task"
    :is-expanded="props.isExpanded"
    :logs="props.logs"
    :is-log-loading="props.isLogLoading"
    :is-selectable="props.isSelectable"
    :is-selected="props.isSelected"
    :is-unviewed="props.isUnviewed"
    @stop="emit('stop', $event)"
    @toggle="emit('toggle', $event)"
    @run-new="emit('runNew', $event)"
    @select="emit('select', $event)"
    @pin="emit('pin', $event)"
    @reveal-log="emit('revealLog', $event)"
    @viewed="emit('viewed', $event)"
  >
    <template #detail>
      <ScriptDetail :task="props.task" />
    </template>
  </TaskItemTemplate>
</template>

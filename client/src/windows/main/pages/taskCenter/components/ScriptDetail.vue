<script setup lang="ts">
import { computed } from "vue";
import type { TaskInfo } from "../../../../../../../common/tasks/taskInfo";
import { TextEditComponent } from "../../../../../components/textEdit";
import type { TextEditParamGroup } from "../../../../../components/textEdit";

const props = defineProps<{
  task: TaskInfo;
}>();

const scriptInfo = computed(() => {
  const info = props.task.tasksSpectialInfo;
  return {
    scriptType: info?.scriptType ?? "",
    scriptContent: info?.scriptContent ?? "",
    exitCode: info?.exitCode ?? null,
    variables: info?.variables ?? {},
  };
});
const variableGroups = computed<readonly TextEditParamGroup[]>(() => [{
  id: `task-${props.task.id}-variables`,
  name: "Variables",
  sourceType: "Task",
  sourcePath: props.task.title,
  params: Object.entries(scriptInfo.value.variables).map(([key, value]) => ({
    key,
    value,
    enabled: true,
  })),
}]);
</script>

<template>
  <dl class="task-item__info">
    <div class="task-item__meta-item">
      <dt>Interpreter</dt>
      <dd v-if="scriptInfo.scriptType.length > 0">{{ scriptInfo.scriptType }}</dd>
      <dd v-else class="task-item__muted">-</dd>
    </div>
    <div class="task-item__meta-item">
      <dt>Exit code</dt>
      <dd v-if="scriptInfo.exitCode !== null">{{ scriptInfo.exitCode }}</dd>
      <dd v-else class="task-item__muted">-</dd>
    </div>
  </dl>
  <TextEditComponent
    class="script-detail__text-edit"
    :param-groups="variableGroups"
    :selected-group-id="variableGroups[0]?.id"
    :text="scriptInfo.scriptContent"
    :text-identity="props.task.id"
    :is-param-group-management-disabled="true"
    :readonly="true"
    accessible-label="Task script and variables"
  />
</template>

<style scoped>
.task-item__info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-1) var(--space-4);
  margin: 0;
}

.task-item__meta-item {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}

.task-item__meta-item dt {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.task-item__meta-item dd {
  margin: 0;
  min-width: 0;
  color: var(--color-text);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-item__muted {
  color: var(--color-text-muted);
}

.script-detail__text-edit {
  min-height: 320px;
  margin-top: var(--space-3);
}
</style>

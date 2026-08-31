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
    scriptContent: info?.scriptContent ?? "",
    variables: info?.variables ?? {},
  };
});
const variableGroups = computed<readonly TextEditParamGroup[]>(() => {
  const variables = Object.entries(scriptInfo.value.variables);
  if (variables.length === 0) return [];
  return [{
    id: `task-${props.task.id}-variables`,
    name: "Variables",
    sourceType: "Task",
    sourcePath: props.task.title,
    params: variables.map(([key, value]) => ({
      key,
      value,
      enabled: true,
    })),
  }];
});
</script>

<template>
  <TextEditComponent
    class="script-detail__text-edit"
    :class="{ 'has-parameters': variableGroups.length > 0 }"
    :param-groups="variableGroups"
    :selected-group-id="variableGroups[0]?.id"
    :text="scriptInfo.scriptContent"
    :text-identity="props.task.id"
    :script-type="props.task.tasksSpectialInfo?.scriptType"
    :is-param-group-management-disabled="true"
    :readonly="true"
    accessible-label="Task script and variables"
  />
</template>

<style scoped>
.script-detail__text-edit {
  height: 100%;
  min-height: 0;
}

.script-detail__text-edit.has-parameters {
  border-block-start: 1px solid var(--color-divider);
}

.script-detail__text-edit :deep(.text-area-editor:focus-within) {
  box-shadow: none;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import PopupSelect from "../../PopupSelect.vue";
import type { TreeViewWorkspaceSelectorModel } from "./treeViewWorkspaceSelectorModel";

const props = defineProps<{
  model: TreeViewWorkspaceSelectorModel;
  selectedWorkspacePath: string | null;
}>();

const emit = defineEmits<{
  workspaceSelected: [workspacePath: string];
}>();

const options = computed(() => props.model.workspaceRefs.value.length === 0
  ? [{ value: "", label: "No workspace" }]
  : props.model.workspaceRefs.value.map((workspaceRef) => ({
      value: workspaceRef.workspacePath,
      label: props.model.storageRoots.length === 1
        ? workspaceRef.workspaceName
        : `${workspaceRef.rootKey} / ${workspaceRef.workspaceName}`,
    })));
</script>

<template>
  <div class="workspace-selector" @pointerdown.stop>
    <PopupSelect
      :value="selectedWorkspacePath ?? ''"
      :options="options"
      accessible-label="Workspace"
      :disabled="model.workspaceRefs.value.length === 0"
      @update-value="emit('workspaceSelected', $event)"
    />
  </div>
</template>

<style scoped>
.workspace-selector {
  position: relative;
  min-width: 0;
  flex: 1;
}
</style>
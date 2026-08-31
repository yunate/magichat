<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import {
  commandWorkspaceDataSerializer,
  type CommandParamGroup,
  type CommandWorkspaceData,
} from "../../../../../../common/command";
import PopupWindow from "../../../../components/PopupWindow.vue";
import { TextEditComponent, type TextEditParamGroup } from "../../../../components/textEdit";
import { gMessageStore } from "../../../../messages/messageStore";

type Props = {
  workspaceName: string | null;
  data: CommandWorkspaceData;
  saveData: (data: CommandWorkspaceData) => Promise<void>;
};

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();
const draft = shallowRef<CommandWorkspaceData>(cloneWorkspaceData(props.data));
const baseline = shallowRef<CommandWorkspaceData>(cloneWorkspaceData(props.data));
const editorGroupId = shallowRef(props.data.selectedEnvGroupId);
const isSaving = shallowRef(false);
const isDirty = computed(() => !areWorkspaceDataEqual(draft.value, baseline.value));
const paramGroups = computed<readonly TextEditParamGroup[]>(() => draft.value.envGroups.map((group) => ({
  ...cloneParamGroup(group),
  sourceType: "Environment",
  sourcePath: props.workspaceName ?? "",
})));

watch(() => props.data, (data) => {
  if (isDirty.value) return;
  draft.value = cloneWorkspaceData(data);
  baseline.value = cloneWorkspaceData(data);
  editorGroupId.value = data.selectedEnvGroupId;
}, { deep: true });

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
});

function updateParamGroups(groups: TextEditParamGroup[]): void {
  const envGroups = groups.map(cloneParamGroup);
  const selectedEnvGroupId = envGroups.some((group) => group.id === draft.value.selectedEnvGroupId)
    ? draft.value.selectedEnvGroupId
    : envGroups[0]?.id;
  if (selectedEnvGroupId === undefined) return;
  draft.value = { selectedEnvGroupId, envGroups };
}

function updateEditorGroupId(groupId: string | null): void {
  if (groupId === null) return;
  editorGroupId.value = groupId;
  draft.value = { ...draft.value, selectedEnvGroupId: groupId };
}

async function save(): Promise<boolean> {
  if (props.workspaceName === null || isSaving.value) return false;
  isSaving.value = true;
  try {
    const data = cloneWorkspaceData(draft.value);
    commandWorkspaceDataSerializer.validate(data);
    await props.saveData(data);
    baseline.value = cloneWorkspaceData(data);
    gMessageStore.pushMessage("success", "Workspace environment saved.");
    return true;
  } catch (reason: unknown) {
    gMessageStore.pushMessage("error", errorMessage(reason));
    return false;
  } finally {
    isSaving.value = false;
  }
}

async function requestClose(): Promise<boolean> {
  if (isSaving.value) return false;
  if (props.workspaceName !== null && !await save()) return false;
  emit("close");
  return true;
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  void requestClose();
}

function cloneWorkspaceData(data: CommandWorkspaceData): CommandWorkspaceData {
  return {
    selectedEnvGroupId: data.selectedEnvGroupId,
    envGroups: data.envGroups.map(cloneParamGroup),
  };
}

function cloneParamGroup(group: CommandParamGroup): CommandParamGroup {
  return {
    id: group.id,
    name: group.name,
    params: group.params.map((param) => ({ ...param })),
  };
}

function areWorkspaceDataEqual(left: CommandWorkspaceData, right: CommandWorkspaceData): boolean {
  return commandWorkspaceDataSerializer.toJson(left) === commandWorkspaceDataSerializer.toJson(right);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

defineExpose({ requestClose });
</script>

<template>
  <Teleport to="body">
    <PopupWindow
      id="command-env-panel"
      class="command-env-panel"
      draggable
      resizable
      :initial-width="720"
      :initial-height="560"
      :min-width="480"
      :min-height="320"
      aria-label="Workspace Environment"
    >
      <template #header>
        <header class="command-env-panel__header">
          <div class="command-env-panel__heading">
            <h2>Workspace Environment</h2>
          </div>
          <button
            type="button"
            class="command-env-panel__close"
            :disabled="isSaving"
            :aria-busy="isSaving"
            aria-label="Save and close Workspace Environment"
            title="Save and close"
            @click="requestClose"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 3 13 13M13 3 3 13" />
            </svg>
          </button>
        </header>
      </template>
      <p v-if="workspaceName === null" class="command-env-panel__empty" role="status">
        Create or select a Workspace to edit its environment.
      </p>
      <TextEditComponent
        v-else
        class="command-env-panel__editor"
        :param-groups="paramGroups"
        :selected-group-id="editorGroupId"
        :is-text-area-visible="false"
        :is-param-expanded-initially="true"
        accessible-label="Workspace Environment variables"
        @update-param-groups="updateParamGroups"
        @update-selected-group-id="updateEditorGroupId"
      />
    </PopupWindow>
  </Teleport>
</template>

<style scoped>
.command-env-panel {
  z-index: 200;
}

.command-env-panel__header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-inline: var(--space-4);
}

.command-env-panel__heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.command-env-panel__heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.command-env-panel__close {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: none;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-medium);
  cursor: pointer;
}

.command-env-panel__close svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.75;
}

.command-env-panel__close:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-selected);
}

.command-env-panel__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-env-panel__close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.command-env-panel__empty {
  margin: auto;
  color: var(--color-text-muted);
}

.command-env-panel__editor {
  margin: 0 var(--space-3) var(--space-3);
  border-inline: 1px solid var(--color-border);
  border-block-start: 1px solid var(--color-border);
}

@media (max-width: 640px) {
  .command-env-panel__header {
    padding-block: var(--space-3);
  }
}
</style>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  TASK_CENTER_CONFIG_KEY,
  taskCenterConfigSerializer,
  type TaskCenterConfig,
  type TaskTemplateRootConfig,
} from "../../../../../../common/config/taskCenter";
import { gMessageStore } from "../../../../messages/messageStore";
import { gMainApplication } from "../../main";
import {
  TASK_TEMPLATES_CHANGED_EVENT,
  gTaskTemplatesChangedCenter,
} from "./taskCenter";

const config = ref<TaskCenterConfig>(taskCenterConfigSerializer.getDefault());
const maxParallelInput = ref<number | "">("");
const defaultRootPath = ref("");
const isLoading = ref(true);

onMounted(async () => {
  await loadConfig();
});

defineExpose({ getCurrent, save });

function normalizeMaxParallel(value: number | ""): number {
  if (value === "") return 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("Max parallel must be 0 or a positive whole number.");
  }
  return value;
}

function addRoot(): void {
  const keys = new Set(config.value.templateRoots.map((root) => root.key));
  let index = 1;
  while (keys.has(`root ${index}`)) index += 1;
  config.value.templateRoots.push({ key: `root ${index}`, path: "" });
}

function updateRoot(index: number, field: "key" | "path", event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const root = config.value.templateRoots[index];
  if (root === undefined) return;
  const value = input.value.trim();
  if (field === "key" && root.key === config.value.activeTemplateRootKey) {
    config.value.activeTemplateRootKey = value;
  }
  root[field] = value;
}

function activateRoot(root: TaskTemplateRootConfig): void {
  if (root.path.trim().length === 0) return;
  config.value.activeTemplateRootKey = root.key;
}

function deleteRoot(index: number): void {
  const root = config.value.templateRoots[index];
  if (index === 0 || root === undefined || root.key === config.value.activeTemplateRootKey) return;
  config.value.templateRoots.splice(index, 1);
}

async function loadConfig(): Promise<void> {
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const tasksRpcObject = await gMainApplication.window.getTasksServerRpcObject();
    const loaded = taskCenterConfigSerializer.fromJson(
      await configRpcObject.getJson(TASK_CENTER_CONFIG_KEY),
    );
    const defaultRoot = loaded.templateRoots[0];
    if (defaultRoot === undefined) throw new Error("Task template default root does not exist");
    const resolvedRoots = await tasksRpcObject.resolveTaskTemplateRoots([defaultRoot]);
    const resolvedDefaultRoot = resolvedRoots[0];
    if (resolvedDefaultRoot === undefined) {
      throw new Error("Task template default root could not be resolved");
    }
    config.value = loaded;
    maxParallelInput.value = loaded.maxParallel > 0 ? loaded.maxParallel : "";
    defaultRootPath.value = resolvedDefaultRoot.path;
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    gMessageStore.pushMessage("error", message);
    throw reason;
  } finally {
    isLoading.value = false;
  }
}

function getCurrent(): unknown {
  return {
    ...config.value,
    maxParallel: normalizeMaxParallel(maxParallelInput.value),
  };
}

async function save(): Promise<void> {
  if (isLoading.value) return;
  const nextConfig = taskCenterConfigSerializer.fromValue(getCurrent());
  const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
  const tasksRpcObject = await gMainApplication.window.getTasksServerRpcObject();
  await configRpcObject.setJson(
    TASK_CENTER_CONFIG_KEY,
    taskCenterConfigSerializer.toJson(nextConfig),
  );
  config.value = nextConfig;
  maxParallelInput.value = nextConfig.maxParallel > 0 ? nextConfig.maxParallel : "";
  const templates = await tasksRpcObject.listTaskTemplates();
  gTaskTemplatesChangedCenter.emitEvent({
    key: TASK_TEMPLATES_CHANGED_EVENT,
    payload: templates,
  });
}
</script>

<template>
  <div class="task-settings-layout">
    <fieldset class="task-settings">
      <legend>Execution</legend>
      <label class="task-settings__field">
        <span>Max parallel</span>
        <input
          v-model.number="maxParallelInput"
          type="number"
          min="0"
          inputmode="numeric"
          placeholder="0"
          :disabled="isLoading"
        />
      </label>
      <p class="task-settings__description">0 or empty means unlimited.</p>
    </fieldset>

    <fieldset class="task-settings task-template-roots">
      <div class="task-template-roots__heading">
        <legend>Template paths</legend>
        <button type="button" :disabled="isLoading" @click="addRoot">Add root</button>
      </div>
      <p>Only the selected root is used. Root changes apply when settings are closed.</p>
      <div class="task-template-roots__list">
        <div
          v-for="(root, index) in config.templateRoots"
          :key="`${index}-${root.key}`"
          class="task-template-root"
        >
          <input
            type="radio"
            name="task-active-template-root"
            :value="root.key"
            :checked="root.key === config.activeTemplateRootKey"
            :disabled="isLoading || root.path.trim().length === 0"
            :aria-label="`Use ${root.key} template root`"
            @change="activateRoot(root)"
          />
          <label>
            <span>Key</span>
            <input
              type="text"
              :value="root.key"
              :readonly="index === 0"
              :disabled="isLoading"
              @change="updateRoot(index, 'key', $event)"
            />
          </label>
          <label>
            <span>Path</span>
            <input
              type="text"
              :value="index === 0 ? defaultRootPath : root.path"
              :readonly="index === 0"
              :disabled="isLoading"
              placeholder="Absolute folder path"
              @change="updateRoot(index, 'path', $event)"
            />
          </label>
          <button
            type="button"
            class="task-template-root__delete"
            :disabled="isLoading || index === 0 || root.key === config.activeTemplateRootKey"
            :title="index === 0 ? 'The default root cannot be deleted' : root.key === config.activeTemplateRootKey ? 'Select another root before deleting' : 'Delete root'"
            :aria-label="`Delete ${root.key} template root`"
            @click="deleteRoot(index)"
          >Delete</button>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.task-settings-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.task-settings {
  padding: 0;
  border: 0;
}

.task-settings legend {
  margin-block-end: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.task-settings__field,
.task-template-root label {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
}

.task-settings__field input {
  width: min(240px, 100%);
}

.task-settings__field input,
.task-template-root label input {
  min-height: 30px;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-default-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
}

.task-settings__description,
.task-template-roots > p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.task-template-roots__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.task-template-roots__heading legend {
  margin: 0;
}

.task-template-roots__heading button,
.task-template-root__delete {
  min-height: 30px;
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  cursor: pointer;
}

.task-template-roots__heading button:hover:not(:disabled),
.task-template-root__delete:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.task-template-roots__heading button:disabled,
.task-template-root__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-template-roots__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-block-start: var(--space-3);
}

.task-template-root {
  display: grid;
  grid-template-columns: auto minmax(100px, 0.5fr) minmax(220px, 1.5fr) auto;
  align-items: end;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.task-template-root > input[type="radio"] {
  align-self: center;
  margin: 0;
  accent-color: var(--color-primary);
}

.task-template-root label input {
  width: 100%;
}

.task-template-root label input:read-only {
  color: var(--color-text-muted);
}

.task-template-root__delete {
  color: var(--color-danger);
}

.task-template-roots__heading button:focus-visible,
.task-template-root__delete:focus-visible,
.task-settings input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

@media (max-width: 720px) {
  .task-template-root {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .task-template-root label:nth-of-type(2) {
    grid-column: 2 / -1;
  }
}
</style>
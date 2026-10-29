<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  commandConfigSerializer,
  type CommandConfig,
} from "../../../../../../common/config/command";
import { gMessageStore } from "../../../../messages/messageStore";
import { gMainApplication } from "../../main";
import {
  gCommandSettings,
  type CommandRootConfig,
  type TerminalPlacement,
} from "./commandSettings";

const config = ref<CommandConfig>(commandConfigSerializer.getDefault());
const defaultRootPath = ref("");
const isLoading = ref(true);

const terminalPlacementOptions: readonly Readonly<{
  value: TerminalPlacement;
  label: string;
}>[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

onMounted(async () => {
  await loadConfig();
});

defineExpose({ getCurrent, save });

function onTerminalPlacementChange(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const option = terminalPlacementOptions.find(({ value }) => value === input.value);
  if (option !== undefined) config.value.terminalPlacement = option.value;
}

function updateTerminalInitialPath(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  config.value.terminalInitialPath = input.value.trim();
}

function addRoot(): void {
  const keys = new Set(config.value.roots.map((root) => root.key));
  let index = 1;
  while (keys.has(`root ${index}`)) index += 1;
  config.value.roots.push({ key: `root ${index}`, path: "" });
}

function updateRoot(index: number, field: "key" | "path", event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const root = config.value.roots[index];
  if (root === undefined) return;
  const value = input.value.trim();
  if (field === "key" && root.key === config.value.activeRootKey) {
    config.value.activeRootKey = value;
  }
  root[field] = value;
}

function activateRoot(root: CommandRootConfig): void {
  if (root.path.trim().length === 0) return;
  config.value.activeRootKey = root.key;
}

function deleteRoot(index: number): void {
  const root = config.value.roots[index];
  if (index === 0 || root === undefined || root.key === config.value.activeRootKey) return;
  config.value.roots.splice(index, 1);
}

async function loadConfig(): Promise<void> {
  try {
    const loadedConfig = await gCommandSettings.getConfig();
    const defaultRoot = loadedConfig.roots[0];
    if (defaultRoot === undefined) throw new Error("Command default root does not exist");
    const commandStorage = await gMainApplication.window.getCommandStorageServerRpcObject();
    const resolvedRoots = await commandStorage.resolveRoots([defaultRoot]);
    const resolvedDefaultRoot = resolvedRoots[0];
    if (resolvedDefaultRoot === undefined) {
      throw new Error("Command default root could not be resolved");
    }
    const terminalInitialPath = await commandStorage.resolveTerminalInitialPath(
      loadedConfig.terminalInitialPath,
    );
    defaultRootPath.value = resolvedDefaultRoot.path;
    config.value = { ...loadedConfig, terminalInitialPath };
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    gMessageStore.pushMessage("error", message);
    throw reason;
  } finally {
    isLoading.value = false;
  }
}

function getCurrent(): unknown {
  return config.value;
}

async function save(): Promise<void> {
  if (isLoading.value) return;
  try {
    await gCommandSettings.saveConfig(config.value);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    gMessageStore.pushMessage("error", message);
    throw reason;
  }
}
</script>

<template>
  <div class="command-settings-layout">
    <fieldset class="command-settings">
      <legend>Terminal placement for new Commands</legend>
      <div class="command-settings__options">
        <label
          v-for="option in terminalPlacementOptions"
          :key="option.value"
          class="command-settings__option"
        >
          <input
            type="radio"
            name="command-terminal-placement"
            :value="option.value"
            :checked="config.terminalPlacement === option.value"
            :disabled="isLoading"
            @change="onTerminalPlacementChange"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="command-settings">
      <legend>Terminal initial path</legend>
      <label class="command-settings__field">
        <span>Path</span>
        <input
          type="text"
          :value="config.terminalInitialPath"
          :disabled="isLoading"
          placeholder="Absolute folder path"
          @change="updateTerminalInitialPath"
        />
      </label>
      <p class="command-settings__description">
        Used when a Terminal is created.
      </p>
    </fieldset>

    <fieldset class="command-settings command-roots">
      <div class="command-roots__heading">
        <legend>Root paths</legend>
        <button type="button" :disabled="isLoading" @click="addRoot">Add root</button>
      </div>
      <p>Only the selected root is used. Root changes apply when settings are closed.</p>
      <div class="command-roots__list">
        <div v-for="(root, index) in config.roots" :key="`${index}-${root.key}`" class="command-root">
          <input
            type="radio"
            name="command-active-root"
            :value="root.key"
            :checked="root.key === config.activeRootKey"
            :disabled="isLoading || root.path.trim().length === 0"
            :aria-label="`Use ${root.key} root`"
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
            class="command-root__delete"
            :disabled="isLoading || index === 0 || root.key === config.activeRootKey"
            :title="index === 0 ? 'The default root cannot be deleted' : root.key === config.activeRootKey ? 'Select another root before deleting' : 'Delete root'"
            :aria-label="`Delete ${root.key} root`"
            @click="deleteRoot(index)"
          >Delete</button>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.command-settings-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.command-settings {
  padding: 0;
  border: 0;
}

.command-settings legend {
  margin-block-end: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.command-settings__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.command-settings__option {
  width: 120px;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font-size: 13px;
  cursor: pointer;
}

.command-settings__option:has(input:disabled) {
  opacity: 0.6;
  cursor: wait;
}

.command-settings__option:hover {
  background: var(--color-surface-raised);
}

.command-settings__option:has(input:checked) {
  background: color-mix(in srgb, var(--color-primary) 18%, var(--color-content-bg));
  border-color: var(--color-primary);
}

.command-settings__option:has(input:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-settings__option input {
  margin: 0;
  accent-color: var(--color-primary);
}

.command-settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
}

.command-settings__field input {
  width: 100%;
  min-height: 30px;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-default-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
}

.command-settings__field input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-settings__description {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.command-roots__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.command-roots__heading legend {
  margin: 0;
}

.command-roots__heading button,
.command-root__delete {
  min-height: 30px;
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  cursor: pointer;
}

.command-roots__heading button:hover:not(:disabled),
.command-root__delete:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.command-roots__heading button:focus-visible,
.command-root__delete:focus-visible,
.command-root input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-roots__heading button:disabled,
.command-root__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.command-roots > p {
  margin: var(--space-2) 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: 12px;
}

.command-roots__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.command-root {
  display: grid;
  grid-template-columns: auto minmax(100px, 0.5fr) minmax(220px, 1.5fr) auto;
  align-items: end;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
}

.command-root > input[type="radio"] {
  align-self: center;
  margin: 0;
  accent-color: var(--color-primary);
}

.command-root label {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
}

.command-root label input {
  width: 100%;
  min-height: 30px;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-default-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  font: inherit;
}

.command-root label input:read-only {
  color: var(--color-text-muted);
}

.command-root__delete {
  color: var(--color-danger);
}
</style>

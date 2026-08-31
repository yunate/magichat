<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PersistentStack from "../../../../../../components/PersistentStack.vue";
import SplitContainer from "../../../../../../components/SplitContainer.vue";
import { gMessageStore } from "../../../../../../messages/messageStore";
import { gToolsRegistry } from "../../tools/registry";
import { TOOL_CATEGORIES, type ToolsConfig, type ToolsGroupId } from "../../tools/types";
import { gToolsSettings } from "../../toolsSettings";
import ToolsTabList from "./ToolsTabList.vue";

type SettingsStatus = "loading" | "ready" | "error";

const tools = computed(() => gToolsRegistry.getTools());
const activeId = ref(tools.value[0]?.id ?? "");
const favoriteToolIds = ref<string[]>([]);
const collapsedGroupIds = ref<ToolsGroupId[]>([]);
const settingsStatus = ref<SettingsStatus>("loading");
const isSavingSettings = ref(false);

const activeTool = computed(
  () => tools.value.find((tool) => tool.id === activeId.value) ?? tools.value[0],
);

function onSelect(id: string): void {
  if (isSavingSettings.value || !tools.value.some((tool) => tool.id === id)) return;
  activeId.value = id;
  void saveSettings({
    activeToolId: id,
    favoriteToolIds: [...favoriteToolIds.value],
    collapsedGroupIds: [...collapsedGroupIds.value],
  });
}

function applyConfig(config: ToolsConfig): void {
  activeId.value = config.activeToolId ?? "";
  favoriteToolIds.value = [...config.favoriteToolIds];
  collapsedGroupIds.value = [...config.collapsedGroupIds];
}

function getDefaultToolId(config: ToolsConfig): string | undefined {
  if (!config.collapsedGroupIds.includes("favorites")) {
    const favoriteTool = tools.value.find((tool) => config.favoriteToolIds.includes(tool.id));
    if (favoriteTool !== undefined) return favoriteTool.id;
  }
  for (const category of TOOL_CATEGORIES) {
    if (config.collapsedGroupIds.includes(category)) continue;
    const tool = tools.value.find((item) => item.category === category);
    if (tool !== undefined) return tool.id;
  }
  return tools.value[0]?.id;
}

async function loadSettings(): Promise<void> {
  settingsStatus.value = "loading";
  try {
    const loadedConfig = await gToolsSettings.getConfig();
    const defaultToolId = getDefaultToolId(loadedConfig);
    if (defaultToolId === undefined) throw new Error("No tool is registered");
    const config = loadedConfig.activeToolId !== null
      && tools.value.some((tool) => tool.id === loadedConfig.activeToolId)
      ? loadedConfig
      : { ...loadedConfig, activeToolId: defaultToolId };
    await gToolsSettings.saveConfig(config);
    applyConfig(config);
    settingsStatus.value = "ready";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tools] failed to load settings: ${message}`);
    gMessageStore.pushMessage("error", "Tools settings could not be loaded.");
    settingsStatus.value = "error";
  }
}

async function saveSettings(config: ToolsConfig): Promise<void> {
  if (settingsStatus.value !== "ready" || isSavingSettings.value) return;
  isSavingSettings.value = true;
  try {
    await gToolsSettings.saveConfig(config);
    applyConfig(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tools] failed to save settings: ${message}`);
    gMessageStore.pushMessage("error", "Tools settings could not be saved.");
  } finally {
    isSavingSettings.value = false;
  }
}

function toggleFavorite(id: string): void {
  if (!tools.value.some((tool) => tool.id === id)) return;
  const nextIds = favoriteToolIds.value.includes(id)
    ? favoriteToolIds.value.filter((favoriteId) => favoriteId !== id)
    : [...favoriteToolIds.value, id];
  void saveSettings({
    activeToolId: activeId.value,
    favoriteToolIds: nextIds,
    collapsedGroupIds: [...collapsedGroupIds.value],
  });
}

function toggleGroup(id: ToolsGroupId): void {
  const nextIds = collapsedGroupIds.value.includes(id)
    ? collapsedGroupIds.value.filter((groupId) => groupId !== id)
    : [...collapsedGroupIds.value, id];
  void saveSettings({
    activeToolId: activeId.value,
    favoriteToolIds: [...favoriteToolIds.value],
    collapsedGroupIds: nextIds,
  });
}

onMounted(() => void loadSettings());
</script>

<template>
  <SplitContainer
    class="tools-layout"
    orientation="vertical"
    :separator-labels="['Resize tools directory']"
  >
    <ToolsTabList
      class="tools-directory"
      :tools="tools"
      :active-id="activeId"
      :favorite-tool-ids="favoriteToolIds"
      :collapsed-group-ids="collapsedGroupIds"
      :settings-status="settingsStatus"
      :settings-disabled="settingsStatus !== 'ready' || isSavingSettings"
      :selection-disabled="isSavingSettings"
      @select="onSelect"
      @retry-settings="loadSettings"
      @toggle-favorite="toggleFavorite"
      @toggle-group="toggleGroup"
    />
    <section
      class="tools-panel"
      :aria-label="activeTool?.title"
    >
      <template v-if="tools.length > 0">
        <PersistentStack :entries="tools" :active-key="activeId" :get-entry-key="(tool) => tool.id">
          <template #default="{ entry: tool }">
            <component :is="tool.component" />
          </template>
        </PersistentStack>
      </template>
      <p v-else class="tools-panel__empty">No tool available.</p>
    </section>
  </SplitContainer>
</template>

<style scoped>
.tools-layout {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.tools-directory {
  min-width: 180px;
  max-width: 420px;
  flex: 0 1 240px;
}

.tools-panel {
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  display: flex;
  overflow: hidden;
}

.tools-panel__empty {
  padding: var(--space-6);
  color: var(--color-text-muted);
}
</style>

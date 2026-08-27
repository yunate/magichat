<script setup lang="ts">
import { computed, ref } from "vue";
import PersistentStack from "../../../../../../components/PersistentStack.vue";
import { gToolsRegistry } from "../../tools/registry";
import ToolsTabList from "./ToolsTabList.vue";

const tools = computed(() => gToolsRegistry.getTools());
const activeId = ref(tools.value[0]?.id ?? "");

const activeTool = computed(
  () => tools.value.find((tool) => tool.id === activeId.value) ?? tools.value[0],
);

function onSelect(id: string): void {
  activeId.value = id;
}
</script>

<template>
  <div class="tools-layout">
    <ToolsTabList :tools="tools" :active-id="activeId" @select="onSelect" />
    <section
      class="tools-panel"
      role="tabpanel"
      :aria-labelledby="activeTool ? `tool-tab-${activeTool.id}` : undefined"
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
  </div>
</template>

<style scoped>
.tools-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: minmax(0, 1fr);
}

.tools-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.tools-panel__empty {
  padding: var(--space-6);
  color: var(--color-text-muted);
}
</style>

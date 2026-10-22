<script setup lang="ts">
import { basename } from "pathe";
import { nextTick, onMounted, onUnmounted, shallowRef, watch } from "vue";
import {
  TREE_VIEW_ITEM_FILE_EXTENSION,
  type TreeViewFolder,
  type TreeViewItem,
  type TreeViewTab,
} from "../../../../../common/treeView";
import type { TreeViewTabsModel } from "./treeViewTabsModel";

type TabResolution =
  | { state: "loading" }
  | { state: "ready"; entity: TreeViewFolder | TreeViewItem }
  | { state: "invalid"; message: string };

const props = defineProps<{
  tab: TreeViewTab;
  isActive: boolean;
  isEntityComplete: boolean;
  model: TreeViewTabsModel;
  notifyReady: () => void;
}>();

defineSlots<{
  default(props: {
    entity: TreeViewFolder | TreeViewItem;
    notifyReady: () => void;
  }): unknown;
}>();

const resolution = shallowRef<TabResolution>({ state: "loading" });
let isMounted = false;
let requestId = 0;

watch(() => props.isEntityComplete, (isComplete) => {
  if (isComplete) return;
  requestId += 1;
  resolution.value = {
    state: "invalid",
    message: props.tab.kind === "item" ? "File does not exist" : "Folder does not exist",
  };
  void notifyReady();
}, { immediate: true });

watch(() => props.tab.path, (path) => {
  const current = resolution.value;
  if (current.state !== "ready") return;
  resolution.value = {
    state: "ready",
    entity: {
      ...current.entity,
      path,
      name: props.tab.kind === "item"
        ? basename(path, TREE_VIEW_ITEM_FILE_EXTENSION)
        : basename(path),
    },
  };
});
watch(() => props.isActive, (isActive) => {
  if (isActive && resolution.value.state === "loading") void resolveTab();
});

onMounted(() => {
  isMounted = true;
  if (resolution.value.state === "invalid") void notifyReady();
  else if (props.isActive) void resolveTab();
});

onUnmounted(() => {
  isMounted = false;
  requestId += 1;
});

async function resolveTab(): Promise<void> {
  const currentRequestId = ++requestId;
  try {
    const entity = await props.model.resolveTabEntity(props.tab);
    if (!isMounted || currentRequestId !== requestId) return;
    resolution.value = { state: "ready", entity };
    return;
  } catch (reason: unknown) {
    if (!isMounted || currentRequestId !== requestId) return;
    resolution.value = {
      state: "invalid",
      message: reason instanceof Error ? reason.message : String(reason),
    };
  }
  await notifyReady(currentRequestId);
}

async function notifyReady(currentRequestId = requestId): Promise<void> {
  await nextTick();
  if (isMounted && currentRequestId === requestId) props.notifyReady();
}
</script>

<template>
  <p
    v-if="resolution.state === 'invalid'"
    class="tree-view-tab-state"
    role="alert"
  >
    {{ resolution.message }}
  </p>
  <slot
    v-else-if="resolution.state === 'ready'"
    :entity="resolution.entity"
    :notify-ready="notifyReady"
  ></slot>
</template>

<style scoped>
.tree-view-tab-state {
  width: 100%;
  height: 100%;
  border: 1px solid var(--color-border);
  display: grid;
  place-items: center;
  padding: var(--space-6);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
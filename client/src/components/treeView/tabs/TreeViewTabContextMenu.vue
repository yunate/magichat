<script setup lang="ts">
import type { TreeViewTab } from "../../../../../common/treeView";
import ContextMenu from "../../ContextMenu.vue";
import type { ContextMenuArea, ContextMenuPosition } from "../../contextMenuTypes";

defineProps<{
  tab: TreeViewTab | null;
  position: ContextMenuPosition;
  area: ContextMenuArea;
}>();

const emit = defineEmits<{
  close: [];
  togglePinned: [];
  openInExplorer: [];
  copyPath: [kind: "relative" | "full"];
  closeOthers: [mode: "others" | "left" | "right" | "othersExceptPinned"];
}>();
</script>

<template>
  <ContextMenu :position="position" :area="area">
    <button type="button" role="menuitem" @click="emit('close')">Close</button>
    <button v-if="tab !== null" type="button" role="menuitem" @click="emit('togglePinned')">
      {{ tab.isPinned ? "Unpin" : "Pin" }}
    </button>
    <span role="separator"></span>
    <button type="button" role="menuitem" @click="emit('openInExplorer')">Open in Folder</button>
    <button type="button" role="menuitem" @click="emit('copyPath', 'relative')">Copy Path</button>
    <button type="button" role="menuitem" @click="emit('copyPath', 'full')">Copy Full Path</button>
    <span role="separator"></span>
    <button type="button" role="menuitem" @click="emit('closeOthers', 'others')">Close Others</button>
    <button type="button" role="menuitem" @click="emit('closeOthers', 'left')">Close Left</button>
    <button type="button" role="menuitem" @click="emit('closeOthers', 'right')">Close Right</button>
    <button type="button" role="menuitem" @click="emit('closeOthers', 'othersExceptPinned')">Close Others Except Pinned</button>
  </ContextMenu>
</template>
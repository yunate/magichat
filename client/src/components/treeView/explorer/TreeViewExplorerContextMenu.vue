<script setup lang="ts">
import ContextMenu from "../../ContextMenu.vue";
import type { ContextMenuArea, ContextMenuPosition } from "../../contextMenuTypes";

defineProps<{
  kind: "folder" | "item";
  isMissing: boolean;
  position: ContextMenuPosition;
  area: ContextMenuArea;
  isMultiSelection: boolean;
  folderLabel: string;
  itemLabel: string;
}>();

const emit = defineEmits<{
  createItem: [];
  createFolder: [];
  open: [openMode: "normal" | "pinned"];
  openInExplorer: [];
  copyPath: [kind: "relative" | "full"];
  setSubtreeExpanded: [isExpanded: boolean];
  clone: [];
  rename: [];
  delete: [];
}>();
</script>

<template>
  <ContextMenu :position="position" :area="area">
    <template v-if="isMissing">
      <button type="button" role="menuitem" class="is-danger" @click="emit('delete')">Delete</button>
    </template>
    <template v-else-if="isMultiSelection">
      <button type="button" role="menuitem" @click="emit('clone')">Clone</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" class="is-danger" @click="emit('delete')">Delete</button>
    </template>
    <template v-else-if="kind === 'folder'">
      <button type="button" role="menuitem" @click="emit('createItem')">New {{ itemLabel.toLowerCase() }}</button>
      <button type="button" role="menuitem" @click="emit('createFolder')">New {{ folderLabel.toLowerCase() }}</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('open', 'normal')">Open</button>
      <button type="button" role="menuitem" @click="emit('openInExplorer')">Open in Explorer</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('copyPath', 'relative')">Copy Path</button>
      <button type="button" role="menuitem" @click="emit('copyPath', 'full')">Copy Full Path</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('setSubtreeExpanded', true)">Expand All</button>
      <button type="button" role="menuitem" @click="emit('setSubtreeExpanded', false)">Collapse All</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('clone')">Clone</button>
      <button type="button" role="menuitem" @click="emit('rename')">Rename</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" class="is-danger" @click="emit('delete')">Delete</button>
    </template>
    <template v-else>
      <button type="button" role="menuitem" @click="emit('open', 'normal')">Open</button>
      <button type="button" role="menuitem" @click="emit('openInExplorer')">Open in Explorer</button>
      <button type="button" role="menuitem" @click="emit('open', 'pinned')">Pin</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('copyPath', 'relative')">Copy Path</button>
      <button type="button" role="menuitem" @click="emit('copyPath', 'full')">Copy Full Path</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" @click="emit('clone')">Clone</button>
      <button type="button" role="menuitem" @click="emit('rename')">Rename</button>
      <span role="separator"></span>
      <button type="button" role="menuitem" class="is-danger" @click="emit('delete')">Delete</button>
    </template>
  </ContextMenu>
</template>
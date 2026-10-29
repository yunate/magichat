<script setup lang="ts">
import { dirname, join, relative } from "pathe";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type {
  TreeViewFolder,
  TreeViewItem,
  TreeViewWorkspaceRef,
} from "../../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "../../../../../common/treeView";
import { confirmActionDialog } from "../../confirmDialog";
import type { ContextMenuArea, ContextMenuPosition } from "../../contextMenuTypes";
import { runWithOperationProgress } from "../../operationProgressDialog";
import type { TreeViewController } from "../TreeView";
import TreeViewNode from "./TreeViewNode.vue";
import type {
  TreeViewActivateParams,
  TreeViewDropPosition,
  TreeViewSelection,
} from "../treeViewTypes";
import TreeViewExplorerContextMenu from "./TreeViewExplorerContextMenu.vue";
import type {
  TreeViewEntityPathChange,
  TreeViewExplorerModel,
} from "./treeViewExplorerModel";

type TreeViewExplorerActions = Pick<
  TreeViewController,
  | "deleteFolder"
  | "deleteItem"
  | "deleteWorkspace"
  | "clone"
  | "renameWorkspace"
>;

type MenuState = Readonly<{
  kind: "folder" | "item";
  id: string;
  isMissing: boolean;
  position: ContextMenuPosition;
}> | null;

type TreeViewDragSource = Readonly<{
  kind: "folder" | "item";
  sourcePath: string;
}>;

const props = defineProps<{
  model: TreeViewExplorerModel;
  actions: TreeViewExplorerActions;
  workspacePath: string | null;
  workspaceRevision: number;
  workspaceRootKey: string | null;
  workspaceRefs: readonly TreeViewWorkspaceRef[];
  folderLabel: string;
  itemLabel: string;
  contextMenuArea: ContextMenuArea;
}>();

const emit = defineEmits<{
  entityActivated: [params: TreeViewActivateParams];
  entityPathChanged: [change: TreeViewEntityPathChange];
  error: [message: string];
  message: [message: string, level: "success"];
}>();

defineSlots<{
  folderOverlay(props: { folder: TreeViewFolder; isSelected: boolean }): unknown;
  itemIcon(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  itemOverlay(props: { item: TreeViewItem; isSelected: boolean }): unknown;
}>();

const menu = ref<MenuState>(null);
const renameTarget = ref<TreeViewSelection | null>(null);
const selectedNodes = ref<readonly TreeViewSelection[]>([]);
const rootFolder = props.model.rootFolder;
const selectedNodeKeys = computed<ReadonlySet<string>>(() => new Set(
  selectedNodes.value.map(selectionKey),
));
const highlightedNodeKeys = computed<ReadonlySet<string>>(() => {
  const keys = new Set(selectedNodeKeys.value);
  const root = rootFolder.value;
  if (root === null) return keys;
  keys.delete(selectionKey({ kind: "folder", id: root.properties.id }));
  const selectedPaths = selectedNodes.value.flatMap((selection) => {
    const entity = resolveSelection(selection);
    return entity === null ? [] : [entity.path];
  });
  const activeEntityPath = props.model.activeEntityPath.value;
  if (activeEntityPath !== null) selectedPaths.push(activeEntityPath);
  const pending = [...root.folders];
  while (pending.length > 0) {
    const folder = pending.pop();
    if (folder === undefined) continue;
    if (selectedPaths.some((path) => path === folder.path || path.startsWith(`${folder.path}/`))) {
      keys.add(selectionKey({ kind: "folder", id: folder.properties.id }));
    }
    pending.push(...folder.folders);
  }
  return keys;
});
const isMultiNodeMenu = computed(() => {
  const target = menu.value;
  const selection = target === null ? null : { kind: target.kind, id: target.id };
  return selection !== null && selectedNodes.value.length > 1
    && selectedNodeKeys.value.has(selectionKey(selection));
});

watch(() => props.workspaceRevision, () => {
  selectedNodes.value = selectionArray(props.model.selection.value);
  closeMenu();
  renameTarget.value = null;
  report(props.model.loadWorkspace(props.workspacePath));
}, { immediate: true });
watch(() => props.model.selection.value, (selection) => {
  if (selection !== null && !selectedNodeKeys.value.has(selectionKey(selection))) {
    selectedNodes.value = [selection];
  }
});
watch(rootFolder, () => {
  selectedNodes.value = selectedNodes.value.filter((selection) => resolveSelection(selection) !== null);
});

function report(operation: Promise<unknown>): void {
  void operation.catch((reason: unknown) => {
    emit("error", reason instanceof Error ? reason.message : String(reason));
  });
}

function activate(
  selection: TreeViewSelection,
  openMode: "preview" | "normal" | "pinned",
  isAdditive = false,
): void {
  if (isAdditive && !isWorkspaceRoot(selection)) {
    toggleNodeSelection(selection);
    return;
  }
  selectedNodes.value = [selection];
  emit("entityActivated", { ...selection, openMode });
}

function toggleFolder(folder: TreeViewFolder): void {
  const isExpanded = !folder.properties.isExpanded;
  report((async (): Promise<void> => {
    await props.model.updateFolder(folder.path, {
      ...structuredClone(folder.properties),
      isExpanded,
    });
    if (isExpanded) await props.model.loadFolderChildren(folder.path);
  })());
}

function openMenu(event: MouseEvent | KeyboardEvent, selection: TreeViewSelection): void {
  const bounds = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.getBoundingClientRect()
    : null;
  const target = {
    ...selection,
    isMissing: false,
    position: {
      x: event instanceof MouseEvent ? event.clientX : bounds?.left ?? 0,
      y: event instanceof MouseEvent ? event.clientY : bounds?.bottom ?? 0,
    },
  };
  menu.value = null;
  const entity = resolveSelection(selection);
  if (entity === null) return;
  const entityPath = entity.path;
  const workspaceRevision = props.workspaceRevision;
  report((async (): Promise<void> => {
    const isComplete = await props.model.isEntityComplete(selection.kind, entityPath);
    if (workspaceRevision !== props.workspaceRevision
      || resolveSelection(selection)?.path !== entityPath) return;
    menu.value = { ...target, isMissing: !isComplete };
  })());
}

function clearNodeSelectionOnExplorerBlank(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest(".tree-row") !== null) return;
  selectedNodes.value = selectionArray(props.model.selection.value);
}

function selectedFolder(): TreeViewFolder | null {
  const target = menu.value;
  if (target?.kind === "folder") return props.model.getFolderById(target.id);
  if (target?.kind === "item") {
    const item = props.model.getItemById(target.id);
    return item === null ? null : props.model.findLoadedFolderByPath(dirname(item.path));
  }
  return rootFolder.value;
}

function availableName(folder: TreeViewFolder, base: string): string {
  const names = new Set(
    [...folder.folders, ...folder.items].map((entry) => entry.name.toLocaleLowerCase("en-US")),
  );
  let name = base;
  let sequence = 2;
  while (names.has(name.toLocaleLowerCase("en-US"))) name = `${base} ${sequence++}`;
  return name;
}

async function prepareCreationParent(parent: TreeViewFolder): Promise<TreeViewFolder> {
  if (!parent.properties.isExpanded) {
    await props.model.updateFolder(parent.path, {
      ...structuredClone(parent.properties),
      isExpanded: true,
    });
  }
  return props.model.loadFolderChildren(parent.path);
}

function createFolder(): void {
  const parent = selectedFolder();
  menu.value = null;
  if (parent === null) return;
  report((async (): Promise<void> => {
    const loadedParent = await prepareCreationParent(parent);
    const name = availableName(loadedParent, `Untitled ${props.folderLabel.toLowerCase()}`);
    const folderId = await props.model.createFolder(join(loadedParent.path, name));
    renameTarget.value = { kind: "folder", id: folderId };
  })());
}

function createItem(): void {
  const parent = selectedFolder();
  menu.value = null;
  if (parent === null) return;
  report((async (): Promise<void> => {
    const loadedParent = await prepareCreationParent(parent);
    const name = availableName(loadedParent, "Untitled");
    const item = await props.model.createItem(
      join(loadedParent.path, `${name}${TREE_VIEW_ITEM_FILE_EXTENSION}`),
      { isDraft: false },
    );
    emit("entityActivated", {
      kind: "item",
      id: item.properties.id,
      openMode: "preview",
    });
    renameTarget.value = { kind: "item", id: item.properties.id };
  })());
}

function beginRename(): void {
  const target = menu.value;
  menu.value = null;
  if (target !== null) renameTarget.value = { kind: target.kind, id: target.id };
}

function rename(selection: TreeViewSelection, name: string): void {
  renameTarget.value = null;
  const entity = resolveSelection(selection);
  if (entity === null || name.length === 0 || name === entity.name) return;
  const parent = dirname(entity.path);
  if (entity.path === rootFolder.value?.path) {
    if (selection.kind === "folder") {
      report(props.actions.renameWorkspace(entity.path, name));
    }
    return;
  }
  report(moveEntity({
    kind: selection.kind,
    sourcePath: entity.path,
    targetPath: join(
      parent,
      selection.kind === "item" ? `${name}${TREE_VIEW_ITEM_FILE_EXTENSION}` : name,
    ),
    targetOrder: entityOrder(selection.kind, entity.path),
  }));
}

function deleteTarget(): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  const selection: TreeViewSelection = { kind: target.kind, id: target.id };
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(deleteSelections(selections));
}

async function deleteSelections(selections: readonly TreeViewSelection[]): Promise<void> {
  for (const selection of selections) {
    if (!isWorkspaceRoot(selection)) continue;
    const folder = props.model.getFolderById(selection.id);
    if (folder === null) continue;
    const action = await confirmActionDialog({
      title: "Delete workspace",
      descriptions: [
        `Delete "${folder.name}" and all of its contents?`,
        "This action cannot be undone.",
      ],
      actionId: "delete",
      actionLabel: "Delete",
    });
    if (action === "cancel") return;
  }
  await runWithOperationProgress("Deleting...", async () => {
    for (const selection of selections) {
      if (selection.kind === "folder") {
        const folder = props.model.getFolderById(selection.id);
        if (folder === null) continue;
        if (folder.path === rootFolder.value?.path) {
          await props.actions.deleteWorkspace(folder.path);
        } else {
          await props.actions.deleteFolder(selection.id);
        }
      } else {
        await props.actions.deleteItem(selection.id);
      }
    }
  }, 0);
  selectedNodes.value = selectionArray(props.model.selection.value);
}

function cloneTarget(): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  const selection: TreeViewSelection = { kind: target.kind, id: target.id };
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(runWithOperationProgress(
    selections.length === 1 ? "Cloning..." : "Cloning items...",
    async () => {
      for (const current of selections) await cloneSelection(current);
    },
    0,
  ));
}

async function cloneSelection(selection: TreeViewSelection): Promise<void> {
  const entity = resolveSelection(selection);
  if (entity === null) return;
  const parentPath = dirname(entity.path);
  if (entity.path === rootFolder.value?.path) {
    const cloneName = nextCloneName(
      entity.name,
      props.workspaceRefs
        .filter((workspaceRef) => workspaceRef.rootKey === props.workspaceRootKey)
        .map((workspaceRef) => workspaceRef.workspaceName),
    );
    await props.actions.clone({
      kind: "workspace",
      sourcePath: entity.path,
      targetPath: join(parentPath, cloneName),
    });
    emit("message", "Workspace cloned. Please switch manually.", "success");
    return;
  }
  const parentFolder = props.model.findLoadedFolderByPath(parentPath);
  if (parentFolder === null) return;
  const cloneName = nextCloneName(
    entity.name,
    [...parentFolder.folders, ...parentFolder.items].map((entry) => entry.name),
  );
  const clone = await props.model.clone({
    kind: selection.kind,
    sourcePath: entity.path,
    targetPath: join(
      parentPath,
      selection.kind === "item"
        ? `${cloneName}${TREE_VIEW_ITEM_FILE_EXTENSION}`
        : cloneName,
    ),
  });
  if (clone !== null && selectedNodes.value.length === 1) {
    renameTarget.value = { kind: selection.kind, id: clone.properties.id };
  }
}

function nextCloneName(sourceName: string, siblingNames: readonly string[]): string {
  const baseName = sourceName.replace(/ copy(?: \d+)?$/i, "");
  const normalizedNames = new Set(
    siblingNames.map((name) => name.toLocaleLowerCase("en-US")),
  );
  let sequence = 1;
  while (true) {
    const candidate = sequence === 1 ? `${baseName} copy` : `${baseName} copy ${sequence}`;
    if (!normalizedNames.has(candidate.toLocaleLowerCase("en-US"))) return candidate;
    sequence += 1;
  }
}

function openMenuTarget(openMode: "normal" | "pinned"): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  activate({ kind: target.kind, id: target.id }, openMode);
}

function openMenuTargetInExplorer(): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  report(props.model.openInExplorer({ kind: target.kind, id: target.id }));
}

async function copyMenuPath(kind: "relative" | "full"): Promise<void> {
  const target = menu.value;
  const entity = target === null
    ? null
    : resolveSelection({ kind: target.kind, id: target.id });
  menu.value = null;
  if (entity === null || props.workspacePath === null) return;
  const path = kind === "full" ? entity.path : relative(dirname(props.workspacePath), entity.path);
  try {
    await navigator.clipboard.writeText(path);
    emit("message", kind === "full" ? "Full path copied." : "Path copied.", "success");
  } catch (reason: unknown) {
    emit("error", "Failed to copy path.");
    console.error("Failed to copy TreeView path:", reason);
  }
}

function setMenuSubtreeExpanded(isExpanded: boolean): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind !== "folder") return;
  const folder = props.model.getFolderById(target.id);
  if (folder === null) return;
  report((async (): Promise<void> => {
    const pending = [folder.path];
    while (pending.length > 0) {
      const path = pending.shift();
      if (path === undefined) continue;
      let current = props.model.findLoadedFolderByPath(path);
      if (current === null) continue;
      if (current.properties.isExpanded !== isExpanded) {
        await props.model.updateFolder(current.path, {
          ...structuredClone(current.properties),
          isExpanded,
        });
      }
      if (isExpanded) current = await props.model.loadFolderChildren(current.path);
      pending.push(...current.folders.map((child) => child.path));
    }
  })());
}

function moveNode(
  dragSources: readonly TreeViewDragSource[],
  targetKind: "folder" | "item",
  targetPath: string,
  position: TreeViewDropPosition,
): void {
  const draggedSelection = selectionFromSource(dragSources[0]);
  if (draggedSelection === null) return;
  const selections = selectedNodeKeys.value.has(selectionKey(draggedSelection))
    ? normalizeSelections(selectedNodes.value)
    : [draggedSelection];
  report(moveSelections(selections, targetKind, targetPath, position));
}

async function moveSelections(
  selections: readonly TreeViewSelection[],
  targetKind: "folder" | "item",
  targetPath: string,
  position: TreeViewDropPosition,
): Promise<void> {
  const targetEntity = targetKind === "folder"
    ? props.model.findLoadedFolderByPath(targetPath)
    : props.model.findLoadedItemByPath(targetPath);
  if (targetEntity === null) return;
  if (selections.some((selection) => selectionKey(selection) === selectionKey({
    kind: targetKind,
    id: targetEntity.properties.id,
  }))) return;
  const targetFolder = targetKind === "folder"
    && (position === "inside" || position === "inside-before")
    ? targetEntity
    : props.model.findLoadedFolderByPath(dirname(targetPath));
  if (!isTreeViewFolder(targetFolder)) return;
  validateMoveSelections(selections, targetFolder);
  const moveOrder = position === "inside-before"
    ? [...selections].reverse()
    : position === "after"
      ? [
          ...selections.filter((selection) => selection.kind === targetKind).reverse(),
          ...selections.filter((selection) => selection.kind !== targetKind),
        ]
      : selections;
  for (const selection of moveOrder) {
    const entity = resolveSelection(selection);
    if (entity === null) continue;
    const currentTargetFolder = props.model.findLoadedFolderByPath(targetFolder.path);
    if (currentTargetFolder === null) throw new Error("TreeView move target folder is missing");
    const targetOrder = position === "inside-before"
      ? 0
      : position === "inside" || selection.kind !== targetKind
        ? childCount(currentTargetFolder, selection.kind)
        : entityOrder(targetKind, targetPath) + (position === "after" ? 1 : 0);
    await moveEntity({
      kind: selection.kind,
      sourcePath: entity.path,
      targetPath: join(
        currentTargetFolder.path,
        selection.kind === "item"
          ? `${entity.name}${TREE_VIEW_ITEM_FILE_EXTENSION}`
          : entity.name,
      ),
      targetOrder,
    });
  }
}

async function moveEntity(params: Parameters<TreeViewExplorerModel["move"]>[0]): Promise<void> {
  const change = await props.model.move(params);
  if (change === null) throw new Error("TreeView move source is missing");
  emit("entityPathChanged", change);
}

function validateMoveSelections(
  selections: readonly TreeViewSelection[],
  targetFolder: TreeViewFolder,
): void {
  const sourcePaths = new Set(selections.flatMap((selection) => {
    const entity = resolveSelection(selection);
    return entity === null ? [] : [entity.path];
  }));
  const occupiedNames = new Set([...targetFolder.folders, ...targetFolder.items]
    .filter((entity) => !sourcePaths.has(entity.path))
    .map((entity) => entity.name.toLocaleLowerCase("en-US")));
  for (const selection of selections) {
    const entity = resolveSelection(selection);
    if (entity === null) throw new Error("TreeView move source is missing");
    if (selection.kind === "folder"
      && (targetFolder.path === entity.path || targetFolder.path.startsWith(`${entity.path}/`))) {
      throw new Error("TreeView folder cannot move into its own subtree");
    }
    const normalizedName = entity.name.toLocaleLowerCase("en-US");
    if (occupiedNames.has(normalizedName)) {
      throw new Error(`TreeView target already contains ${entity.name}`);
    }
    occupiedNames.add(normalizedName);
  }
}

function normalizeSelections(selections: readonly TreeViewSelection[]): TreeViewSelection[] {
  const selectedPaths = new Set(selections.flatMap((selection) => {
    const entity = resolveSelection(selection);
    return entity === null ? [] : [entity.path];
  }));
  return selections.filter((selection) => {
    const entity = resolveSelection(selection);
    if (entity === null) return false;
    let parentPath = dirname(entity.path);
    while (true) {
      if (selectedPaths.has(parentPath)) return false;
      const nextParentPath = dirname(parentPath);
      if (nextParentPath === parentPath) break;
      parentPath = nextParentPath;
    }
    return true;
  });
}

function selectionFromSource(source: TreeViewDragSource | undefined): TreeViewSelection | null {
  if (source === undefined) return null;
  const entity = source.kind === "folder"
    ? props.model.findLoadedFolderByPath(source.sourcePath)
    : props.model.findLoadedItemByPath(source.sourcePath);
  return entity === null ? null : { kind: source.kind, id: entity.properties.id };
}

function resolveSelection(selection: TreeViewSelection): TreeViewFolder | TreeViewItem | null {
  return selection.kind === "folder"
    ? props.model.getFolderById(selection.id)
    : props.model.getItemById(selection.id);
}

function toggleNodeSelection(selection: TreeViewSelection): void {
  const key = selectionKey(selection);
  selectedNodes.value = selectedNodeKeys.value.has(key)
    ? selectedNodes.value.filter((candidate) => selectionKey(candidate) !== key)
    : [...selectedNodes.value, selection];
}

function selectionKey(selection: TreeViewSelection): string {
  return `${selection.kind}:${selection.id}`;
}

function selectionArray(selection: TreeViewSelection | null): readonly TreeViewSelection[] {
  return selection === null ? [] : [selection];
}

function isWorkspaceRoot(selection: TreeViewSelection): boolean {
  if (selection.kind !== "folder") return false;
  const folder = props.model.getFolderById(selection.id);
  return folder !== null && folder.path === rootFolder.value?.path;
}

function isTreeViewFolder(entity: TreeViewFolder | TreeViewItem | null): entity is TreeViewFolder {
  return entity !== null && "folders" in entity;
}

function childCount(folder: TreeViewFolder, kind: "folder" | "item"): number {
  return kind === "folder"
    ? folder.folders.length
    : folder.items.filter((item) => !item.properties.isDraft).length;
}

function entityOrder(kind: "folder" | "item", path: string): number {
  const parent = props.model.findLoadedFolderByPath(dirname(path));
  if (parent === null) return 0;
  return kind === "folder"
    ? parent.folders.findIndex((folder) => folder.path === path)
    : parent.items
      .filter((item) => !item.properties.isDraft)
      .findIndex((item) => item.path === path);
}

function closeMenu(): void {
  menu.value = null;
}

onMounted(() => window.addEventListener("pointerdown", closeMenu));
onUnmounted(() => {
  closeMenu();
  window.removeEventListener("pointerdown", closeMenu);
});
</script>

<template>
  <nav
    class="tree-view__explorer"
    aria-label="Workspace files"
    @click="clearNodeSelectionOnExplorerBlank"
    @contextmenu.prevent
  >
    <ul v-if="rootFolder" class="tree-view__root">
      <TreeViewNode
        :folder="rootFolder"
        :selected-keys="selectedNodeKeys"
        :highlighted-keys="highlightedNodeKeys"
        :rename-target="renameTarget"
        :depth="0"
        @activate="activate"
        @toggle="toggleFolder"
        @context-menu="openMenu"
        @begin-rename="renameTarget = $event"
        @rename="rename"
        @move="moveNode"
      >
        <template #folderOverlay="slotProps"><slot name="folderOverlay" v-bind="slotProps"></slot></template>
        <template v-if="$slots.itemIcon" #itemIcon="slotProps"><slot name="itemIcon" v-bind="slotProps"></slot></template>
        <template #itemOverlay="slotProps"><slot name="itemOverlay" v-bind="slotProps"></slot></template>
      </TreeViewNode>
    </ul>

    <TreeViewExplorerContextMenu
      v-if="menu !== null"
      :kind="menu.kind"
      :is-missing="menu.isMissing"
      :position="menu.position"
      :area="contextMenuArea"
      :is-multi-selection="isMultiNodeMenu"
      :folder-label="folderLabel"
      :item-label="itemLabel"
      @create-item="createItem"
      @create-folder="createFolder"
      @open="openMenuTarget"
      @open-in-explorer="openMenuTargetInExplorer"
      @copy-path="copyMenuPath"
      @set-subtree-expanded="setMenuSubtreeExpanded"
      @clone="cloneTarget"
      @rename="beginRename"
      @delete="deleteTarget"
    />
  </nav>
</template>

<style scoped>
.tree-view__explorer {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-1);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-muted) 30%, transparent) transparent;
}

.tree-view__root {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
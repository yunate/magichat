<script setup lang="ts">
import { dirname, join, relative } from "pathe";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/vue-virtual";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
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
  path: string;
  isMissing: boolean;
  position: ContextMenuPosition;
}> | null;

type TreeViewDragSource = Readonly<{
  kind: "folder" | "item";
  sourcePath: string;
}>;

type ExplorerRow = Readonly<{
  key: string;
  folder: TreeViewFolder;
  item: TreeViewItem | null;
  depth: number;
}>;

const props = defineProps<{
  model: TreeViewExplorerModel;
  actions: TreeViewExplorerActions;
  selectedPath: string | null;
  workspacePath: string | null;
  workspaceRef: TreeViewWorkspaceRef | null;
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
const scrollElement = ref<HTMLElement | null>(null);
const draggedNodeKey = ref<string | null>(null);
const pendingRevealPath = ref<string | null>(null);
const rows = computed(() => {
  const result: ExplorerRow[] = [];
  const root = rootFolder.value;
  if (root === null) return result;
  const pending: ExplorerRow[] = [{ key: `folder:${root.path}`, folder: root, item: null, depth: 0 }];
  while (pending.length > 0) {
    const row = pending.pop();
    if (row === undefined) break;
    result.push(row);
    if (row.item !== null || !row.folder.properties.isExpanded || !isFolderLoaded(row.folder.path)) continue;
    for (let index = row.folder.items.length - 1; index >= 0; index -= 1) {
      const item = row.folder.items[index];
      if (item === undefined || item.properties.isDraft) continue;
      pending.push({ key: `item:${item.path}`, folder: row.folder, item, depth: row.depth });
    }
    for (let index = row.folder.folders.length - 1; index >= 0; index -= 1) {
      const folder = row.folder.folders[index];
      if (folder === undefined) continue;
      pending.push({ key: `folder:${folder.path}`, folder, item: null, depth: row.depth + 1 });
    }
  }
  return result;
});
const rowIndexes = computed(() => new Map(rows.value.map((row, index) => [row.key, index])));
const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => {
  const renameKey = renameTarget.value === null ? null : selectionKey(renameTarget.value);
  const pinnedIndexes = [renameKey, draggedNodeKey.value].flatMap((key) => {
    const index = key === null ? undefined : rowIndexes.value.get(key);
    return index === undefined ? [] : [index];
  });
  return {
    count: rows.value.length,
    getScrollElement: () => scrollElement.value,
    estimateSize: () => 32,
    overscan: 8,
    getItemKey: (index: number) => {
      const row = rows.value[index];
      if (row === undefined) throw new Error("TreeView virtual row is unavailable");
      return row.key;
    },
    rangeExtractor: (range: Parameters<typeof defaultRangeExtractor>[0]) => [...new Set([
      ...defaultRangeExtractor(range), ...pinnedIndexes,
    ])].sort((first, second) => first - second),
  };
}));
const visibleRows = computed(() => virtualizer.value.getVirtualItems().flatMap((virtualRow) => {
  const row = rows.value[virtualRow.index];
  return row === undefined ? [] : [{ ...row, index: virtualRow.index, start: virtualRow.start }];
}));
const selectedNodeKeys = computed<ReadonlySet<string>>(() => new Set(
  selectedNodes.value.map(selectionKey),
));
const highlightedNodeKeys = computed<ReadonlySet<string>>(() => {
  const keys = new Set(selectedNodeKeys.value);
  const root = rootFolder.value;
  if (root === null) return keys;
  keys.delete(selectionKey({ kind: "folder", path: root.path }));
  const selectedPaths = selectedNodes.value.flatMap((selection) => {
    const entity = resolveSelection(selection);
    return entity === null ? [] : [entity.path];
  });
  const selectedPath = props.selectedPath;
  if (selectedPath !== null) selectedPaths.push(selectedPath);
  const rootPrefix = root.path.endsWith("/") ? root.path : `${root.path}/`;
  for (const path of selectedPaths) {
    let ancestorPath = path;
    while (ancestorPath !== root.path && ancestorPath.startsWith(rootPrefix)) {
      if (props.model.findLoadedFolderByPath(ancestorPath) !== null) {
        keys.add(selectionKey({ kind: "folder", path: ancestorPath }));
      }
      ancestorPath = dirname(ancestorPath);
    }
  }
  return keys;
});
const isMultiNodeMenu = computed(() => {
  const target = menu.value;
  const selection = target === null ? null : { kind: target.kind, path: target.path };
  return selection !== null && selectedNodes.value.length > 1
    && selectedNodeKeys.value.has(selectionKey(selection));
});

watch(() => props.workspaceRef, (current, previous) => {
  if (current !== null && previous !== undefined
    && current.workspacePath !== previous?.workspacePath
    && rootFolder.value?.path === current.workspacePath) return;
  selectedNodes.value = selectionArray(props.selectedPath);
  closeMenu();
  renameTarget.value = null;
  report(props.model.loadWorkspace(props.workspacePath));
}, { immediate: true });
watch([() => props.selectedPath, rootFolder], ([path]) => {
  selectedNodes.value = selectedNodes.value.filter((selection) => resolveSelection(selection) !== null);
  const [selected] = selectionArray(path);
  if (selected !== undefined && !selectedNodeKeys.value.has(selectionKey(selected))) {
    selectedNodes.value = [selected];
  }
});

function report(operation: Promise<unknown>): void {
  void operation.catch((reason: unknown) => {
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    emit("error", reason instanceof Error ? reason.message : String(reason));
  });
}

function measureRow(element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) virtualizer.value.measureElement(element);
}

function pinDraggedNode(event: DragEvent): void {
  if (!(event.target instanceof Element)) return;
  draggedNodeKey.value = event.target.closest<HTMLElement>("[data-tree-row-key]")?.dataset.treeRowKey ?? null;
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
  if (openMode !== "preview" || !selectedNodeKeys.value.has(selectionKey(selection))) {
    selectedNodes.value = [selection];
  }
  emit("entityActivated", { ...selection, openMode });
}

function isFolderLoaded(folderPath: string): boolean {
  return props.model.isFolderLoaded(folderPath);
}

function toggleFolder(folder: TreeViewFolder): void {
  const isExpanded = !folder.properties.isExpanded;
  report((async (): Promise<void> => {
    await props.model.updateFolder(folder.path, {
      ...structuredClone(folder.properties),
      isExpanded,
    });
    if (isExpanded) await props.model.loadFolder(folder.path);
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
  const workspacePath = props.workspacePath;
  report((async (): Promise<void> => {
    const isComplete = await props.model.isEntityComplete(selection.kind, entityPath);
    if (workspacePath !== props.workspacePath
      || resolveSelection(selection)?.path !== entityPath) return;
    menu.value = { ...target, isMissing: !isComplete };
  })());
}

function clearNodeSelectionOnExplorerBlank(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest(".tree-row") !== null) return;
  selectedNodes.value = selectionArray(props.selectedPath);
}

function selectedFolder(): TreeViewFolder | null {
  const target = menu.value;
  if (target?.kind === "folder") return props.model.findLoadedFolderByPath(target.path);
  if (target?.kind === "item") {
    const item = props.model.findLoadedItemByPath(target.path);
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
  await props.model.loadFolder(parent.path);
  const loadedParent = props.model.findLoadedFolderByPath(parent.path);
  if (loadedParent === null) throw new Error("TreeView folder is missing");
  return loadedParent;
}

function createFolder(): void {
  const parent = selectedFolder();
  menu.value = null;
  if (parent === null) return;
  report((async (): Promise<void> => {
    const loadedParent = await prepareCreationParent(parent);
    const name = availableName(loadedParent, `Untitled ${props.folderLabel.toLowerCase()}`);
    const folder = await props.model.createFolder(join(loadedParent.path, name));
    renameTarget.value = { kind: "folder", path: folder.path };
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
      { isDraft: false, iconDescription: "" },
    );
    emit("entityActivated", {
      kind: "item",
      path: item.path,
      openMode: "preview",
    });
    renameTarget.value = { kind: "item", path: item.path };
  })());
}

function beginRename(): void {
  const target = menu.value;
  menu.value = null;
  if (target !== null) renameTarget.value = { kind: target.kind, path: target.path };
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
  const selection: TreeViewSelection = { kind: target.kind, path: target.path };
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(deleteSelections(selections));
}

async function deleteSelections(selections: readonly TreeViewSelection[]): Promise<void> {
  for (const selection of selections) {
    if (!isWorkspaceRoot(selection)) continue;
    const folder = props.model.findLoadedFolderByPath(selection.path);
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
        const folder = props.model.findLoadedFolderByPath(selection.path);
        if (folder === null) continue;
        if (folder.path === rootFolder.value?.path) {
          await props.actions.deleteWorkspace(folder.path);
        } else {
          await props.actions.deleteFolder(selection.path);
        }
      } else {
        await props.actions.deleteItem(selection.path);
      }
    }
  });
  selectedNodes.value = selectionArray(props.selectedPath);
}

function cloneTarget(): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  const selection: TreeViewSelection = { kind: target.kind, path: target.path };
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(runWithOperationProgress(
    selections.length === 1 ? "Cloning..." : "Cloning items...",
    async () => {
      for (const current of selections) await cloneSelection(current);
    },
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
    renameTarget.value = { kind: selection.kind, path: clone.path };
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
  activate({ kind: target.kind, path: target.path }, openMode);
}

function openMenuTargetInExplorer(): void {
  const target = menu.value;
  menu.value = null;
  if (target === null) return;
  report(props.model.openInExplorer({ kind: target.kind, path: target.path }));
}

async function copyMenuPath(kind: "relative" | "full"): Promise<void> {
  const target = menu.value;
  const entity = target === null
    ? null
    : resolveSelection({ kind: target.kind, path: target.path });
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
  const folder = props.model.findLoadedFolderByPath(target.path);
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
      if (isExpanded) {
        await props.model.loadFolder(path);
        current = props.model.findLoadedFolderByPath(path);
        if (current === null) throw new Error("TreeView folder is missing");
      }
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
    path: targetEntity.path,
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
  return entity === null ? null : { kind: source.kind, path: entity.path };
}

function resolveSelection(selection: TreeViewSelection): TreeViewFolder | TreeViewItem | null {
  return selection.kind === "folder"
    ? props.model.findLoadedFolderByPath(selection.path)
    : props.model.findLoadedItemByPath(selection.path);
}

function toggleNodeSelection(selection: TreeViewSelection): void {
  const key = selectionKey(selection);
  selectedNodes.value = selectedNodeKeys.value.has(key)
    ? selectedNodes.value.filter((candidate) => selectionKey(candidate) !== key)
    : [...selectedNodes.value, selection];
}

function selectionKey(selection: TreeViewSelection): string {
  return `${selection.kind}:${selection.path}`;
}

function selectionArray(path: string | null): readonly TreeViewSelection[] {
  if (path === null) return [];
  const folder = props.model.findLoadedFolderByPath(path);
  if (folder !== null) return [{ kind: "folder", path: folder.path }];
  const item = props.model.findLoadedItemByPath(path);
  return item === null ? [] : [{ kind: "item", path: item.path }];
}

function isWorkspaceRoot(selection: TreeViewSelection): boolean {
  if (selection.kind !== "folder") return false;
  const folder = props.model.findLoadedFolderByPath(selection.path);
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

watch(() => props.selectedPath, (path) => {
  pendingRevealPath.value = path;
}, { immediate: true, flush: "sync" });
watch([pendingRevealPath, rows, scrollElement], () => {
  const path = pendingRevealPath.value;
  const element = scrollElement.value;
  if (path === null || element === null || element.clientHeight === 0) return;
  const index = rowIndexes.value.get(`folder:${path}`) ?? rowIndexes.value.get(`item:${path}`);
  if (index === undefined) return;
  virtualizer.value.getVirtualItems();
  const row = virtualizer.value.measurementsCache[index];
  if (row === undefined) return;
  const content = element.querySelector(".tree-view__root");
  if (content === null) return;
  const contentOffset = content.getBoundingClientRect().top - element.getBoundingClientRect().top
    + element.scrollTop - element.clientTop;
  const viewportTop = element.scrollTop;
  const viewportBottom = viewportTop + element.clientHeight;
  if (row.start + contentOffset < viewportTop || row.end + contentOffset > viewportBottom) {
    virtualizer.value.scrollToOffset(Math.max(0, row.start + contentOffset - element.clientHeight / 3));
  }
  pendingRevealPath.value = null;
}, { immediate: true, flush: "post" });

watch(renameTarget, (target) => {
  if (target === null) return;
  const index = rowIndexes.value.get(selectionKey(target));
  if (index !== undefined) virtualizer.value.scrollToIndex(index, { align: "auto" });
}, { flush: "post" });
watch(() => props.workspacePath, () => {
  draggedNodeKey.value = null;
  virtualizer.value.scrollToOffset(0);
}, { flush: "post" });

onMounted(() => window.addEventListener("pointerdown", closeMenu));
onUnmounted(() => {
  closeMenu();
  window.removeEventListener("pointerdown", closeMenu);
});
</script>

<template>
  <nav
    ref="scrollElement"
    class="tree-view__explorer"
    aria-label="Workspace files"
    @click="clearNodeSelectionOnExplorerBlank"
    @contextmenu.prevent
    @dragstart.capture="pinDraggedNode"
    @dragend="draggedNodeKey = null"
    @drop.capture="draggedNodeKey = null"
  >
    <ul v-if="rootFolder" class="tree-view__root" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <li
        v-for="row in visibleRows"
        :key="row.key"
        :ref="measureRow"
        class="tree-view__virtual-row"
        :data-index="row.index"
        :data-tree-row-key="row.key"
        :style="{ transform: `translateY(${row.start}px)` }"
      >
      <TreeViewNode
        :folder="row.folder"
        :item="row.item"
        :is-folder-loaded="isFolderLoaded"
        :selected-keys="selectedNodeKeys"
        :highlighted-keys="highlightedNodeKeys"
        :rename-target="renameTarget"
        :depth="row.depth"
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
      </li>
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
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tree-view__virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-width: 0;
}
</style>
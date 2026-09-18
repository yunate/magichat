<script setup lang="ts">
import { dirname, join, relative } from "pathe";
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import type {
  TreeViewFolder,
  TreeViewItem,
  TreeViewTab,
} from "../../../../common/treeView";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "../../../../common/treeView";
import { confirmActionDialog } from "../confirmDialog";
import ContextMenu from "../ContextMenu.vue";
import type { ContextMenuArea, ContextMenuPosition } from "../contextMenuTypes";
import PopupToast from "../PopupToast.vue";
import PopupSelect from "../PopupSelect.vue";
import SplitContainer from "../SplitContainer.vue";
import type { TreeView } from "./TreeView";
import type { TreeViewSelection } from "./treeViewTypes";
import PersistentStack from "../PersistentStack.vue";
import TreeViewNode from "./TreeViewNode.vue";
import TreeViewSaveDraftDialog from "./TreeViewSaveDraftDialog.vue";
import TreeViewTabs from "./TreeViewTabs.vue";

type MenuState = {
  kind: "folder" | "item" | "tab";
  id: string;
  position: ContextMenuPosition;
  area: ContextMenuArea;
} | null;

type WorkspaceDialogState = {
  name: string;
  error: string;
  isSubmitting: boolean;
};

type DraftDialogState = {
  item: TreeViewItem;
  error: string;
  isSubmitting: boolean;
};

type TreeViewDragSource = {
  kind: "folder" | "item";
  sourcePath: string;
};

const props = withDefaults(defineProps<{
  treeView: TreeView;
  folderLabel?: string;
  itemLabel?: string;
  isTabMultiline?: boolean;
  isFolderTabVisible?: boolean;
  isItemTabVisible?: boolean;
}>(), {
  folderLabel: "Folder",
  itemLabel: "Item",
  isTabMultiline: false,
  isFolderTabVisible: true,
  isItemTabVisible: true,
});

defineSlots<{
  folderOverlay(props: { folder: TreeViewFolder; isSelected: boolean }): unknown;
  itemIcon(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  itemOverlay(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  tabOverlay(props: { tab: TreeViewTab; entity: TreeViewFolder | TreeViewItem; isActive: boolean }): unknown;
  tabPage(props: {
    tab: TreeViewTab;
    entity: TreeViewFolder | TreeViewItem;
    isActive: boolean;
    notifyReady: () => void;
    requestDraftSave: () => Promise<boolean>;
  }): unknown;
}>();

const menu = ref<MenuState>(null);
const treeViewElement = useTemplateRef<HTMLElement>("treeViewElement");
const renameTarget = ref<TreeViewSelection | null>(null);
const popupToast = useTemplateRef<{ show: (text: string) => void }>("popupToast");
const isSidebarCollapsed = ref(false);
const sidebarWidth = ref(240);
const workspaceDialog = ref<WorkspaceDialogState | null>(null);
const draftDialog = ref<DraftDialogState | null>(null);
let resolveDraftDialog: ((isSaved: boolean) => void) | null = null;
const selectedNodes = ref<readonly TreeViewSelection[]>([]);

const workspace = computed(() => props.treeView.workspace.value);
const rootFolder = computed(() => props.treeView.rootFolder.value);
const hasWorkspace = computed(() => props.treeView.workspaceRefs.value.length > 0);
const workspaceOptions = computed(() => props.treeView.workspaceRefs.value.length === 0
  ? [{ value: "", label: "No workspace" }]
  : props.treeView.workspaceRefs.value.map((workspaceRef) => ({
      value: workspaceRef.workspacePath,
      label: props.treeView.storageRoots.length === 1
        ? workspaceRef.workspaceName
        : `${workspaceRef.rootKey} / ${workspaceRef.workspaceName}`,
    })));
const tabPageKeyPrefix = computed(() => props.treeView.selectedWorkspaceRef.value?.workspacePath ?? "");
const isTabContentVisible = computed(() => props.isFolderTabVisible || props.isItemTabVisible);
const tabs = computed(() => workspace.value?.tabs.flatMap((tab) => {
  if (tab.kind === "folder" && !props.isFolderTabVisible) return [];
  if (tab.kind === "item" && !props.isItemTabVisible) return [];
  const entity = tab.kind === "folder"
    ? props.treeView.getFolderById(tab.id)
    : props.treeView.getItemById(tab.id);
  return entity === null ? [] : [{ tab, entity }];
}) ?? []);
const activeEntry = computed(() => tabs.value.find((entry) => entry.tab.id === workspace.value?.activeTabId) ?? null);
const activeTabPageKey = computed(() => activeEntry.value === null ? null : getTabPageKey(activeEntry.value.tab));
const contextMenuTab = computed(() => {
  const target = menu.value;
  if (target?.kind !== "tab") return null;
  return tabs.value.find((entry) => entry.tab.id === target.id)?.tab ?? null;
});
const breadcrumbPath = computed(() => {
  const entry = activeEntry.value;
  const workspacePath = props.treeView.selectedWorkspaceRef.value?.workspacePath;
  if (entry === null || workspacePath === undefined) return "";
  return relative(dirname(workspacePath), entry.entity.path);
});
const breadcrumbSegments = computed<readonly string[]>(() => {
  return breadcrumbPath.value.length === 0 ? [] : breadcrumbPath.value.split("/");
});
const activeDraft = computed(() => {
  const entry = activeEntry.value;
  if (entry?.tab.kind !== "item" || !isTreeViewItem(entry.entity)) return null;
  return entry.entity.properties.isDraft ? entry.entity : null;
});
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
  const selection = menuTargetSelection(target);
  return selection !== null && selectedNodes.value.length > 1
    && selectedNodeKeys.value.has(selectionKey(selection));
});

function isTreeViewItem(entity: TreeViewFolder | TreeViewItem): entity is TreeViewItem {
  return "isDraft" in entity.properties;
}

function getTabPageKey(tab: TreeViewTab): string {
  return `${tabPageKeyPrefix.value}:${tab.kind}:${tab.id}`;
}

watch(workspace, (value) => {
  if (value !== null) sidebarWidth.value = value.ui.layout.sidebarWidth;
}, { immediate: true });
watch(() => props.treeView.selectedWorkspaceRef.value?.workspacePath, () => {
  selectedNodes.value = selectionArray(props.treeView.selection.value);
}, { immediate: true });
watch(() => props.treeView.selection.value, (selection) => {
  if (selection !== null && !selectedNodeKeys.value.has(selectionKey(selection))) {
    selectedNodes.value = [selection];
  }
});
watch(rootFolder, () => {
  selectedNodes.value = selectedNodes.value.filter(resolveSelection);
});

function report(operation: Promise<unknown>): void {
  void operation.catch((reason: unknown) => {
    popupToast.value?.show(reason instanceof Error ? reason.message : String(reason));
  });
}

function activate(
  selection: TreeViewSelection,
  openMode: "preview" | "normal" | "pinned",
  isAdditive = false,
): void {
  isSidebarCollapsed.value = false;
  if (isAdditive && !isWorkspaceRoot(selection)) {
    toggleNodeSelection(selection);
    return;
  }
  selectedNodes.value = [selection];
  report(props.treeView.controller.activate({ ...selection, openMode }));
}

function switchTab(tab: TreeViewTab): void {
  selectedNodes.value = [{ kind: tab.kind, id: tab.id }];
  report(props.treeView.controller.switchTab({ tabId: tab.id }));
}

function toggleFolder(folder: TreeViewFolder): void {
  report(props.treeView.controller.updateFolder(folder.path, {
    ...structuredClone(folder.properties),
    isExpanded: !folder.properties.isExpanded,
  }));
}

function openMenu(event: MouseEvent | KeyboardEvent, selection: TreeViewSelection): void {
  const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
  menu.value = {
    ...selection,
    position: {
      x: event instanceof MouseEvent ? event.clientX : bounds?.left ?? 0,
      y: event instanceof MouseEvent ? event.clientY : bounds?.bottom ?? 0,
    },
    area: getContextMenuArea(),
  };
}

function clearNodeSelectionOnExplorerBlank(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest(".tree-row") !== null) return;
  selectedNodes.value = selectionArray(props.treeView.selection.value);
}

function openTabMenu(event: MouseEvent, tab: TreeViewTab): void {
  menu.value = {
    kind: "tab",
    id: tab.id,
    position: { x: event.clientX, y: event.clientY },
    area: getContextMenuArea(),
  };
}

function getContextMenuArea(): ContextMenuArea {
  const bounds = treeViewElement.value?.getBoundingClientRect();
  return bounds === undefined
    ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    : { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
}

function closeMenuTab(): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind !== "tab") return;
  report(props.treeView.controller.closeTabs({ tabIds: [target.id] }));
}

function closeMenuTabs(mode: "others" | "left" | "right" | "othersExceptPinned"): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind !== "tab") return;
  const targetIndex = tabs.value.findIndex((entry) => entry.tab.id === target.id);
  if (targetIndex < 0) return;
  const tabIds = tabs.value.flatMap((entry, index) => {
    if (entry.tab.id === target.id) return [];
    if (mode === "left") return index < targetIndex ? [entry.tab.id] : [];
    if (mode === "right") return index > targetIndex ? [entry.tab.id] : [];
    if (mode === "othersExceptPinned" && entry.tab.isPinned) return [];
    return [entry.tab.id];
  });
  report(props.treeView.controller.closeTabs({
    tabIds,
    preferredActiveId: target.id,
  }));
}

function toggleMenuTabPinned(): void {
  const tab = contextMenuTab.value;
  menu.value = null;
  if (tab === null) return;
  report(props.treeView.controller.setTabPinned({
    tabId: tab.id,
    isPinned: !tab.isPinned,
  }));
}

function selectedFolder(): TreeViewFolder | null {
  const target = menu.value;
  if (target?.kind === "folder") return props.treeView.getFolderById(target.id);
  if (target?.kind === "item") {
    const item = props.treeView.getItemById(target.id);
    const parentPath = item === null ? null : dirname(item.path);
    return findFolderByPath(parentPath);
  }
  return rootFolder.value;
}

function findFolderByPath(path: string | null): TreeViewFolder | null {
  if (path === null || rootFolder.value === null) return null;
  const pending = [rootFolder.value];
  while (pending.length > 0) {
    const folder = pending.shift();
    if (folder?.path === path) return folder;
    if (folder !== undefined) pending.push(...folder.folders);
  }
  return null;
}

function availableName(folder: TreeViewFolder, base: string): string {
  const names = new Set([...folder.folders, ...folder.items].map((entry) => entry.name.toLocaleLowerCase("en-US")));
  let name = base;
  let sequence = 2;
  while (names.has(name.toLocaleLowerCase("en-US"))) name = `${base} ${sequence++}`;
  return name;
}

function createFolder(): void {
  const parent = selectedFolder();
  menu.value = null;
  if (parent === null) return;
  const name = availableName(parent, `Untitled ${props.folderLabel.toLowerCase()}`);
  report(props.treeView.controller.createFolder(join(parent.path, name)).then((folderId) => {
    renameTarget.value = { kind: "folder", id: folderId };
  }));
}

function createItem(isDraft = false): void {
  const parent = isDraft ? rootFolder.value : selectedFolder();
  menu.value = null;
  if (parent === null) return;
  const name = availableName(parent, isDraft ? "Untitled" : `Untitled ${props.itemLabel.toLowerCase()}`);
  report(props.treeView.controller.createItem(
    join(parent.path, `${name}${TREE_VIEW_ITEM_FILE_EXTENSION}`), {
    isDraft,
  }).then(async (item): Promise<void> => {
    await props.treeView.controller.activate({
      kind: "item",
      id: item.properties.id,
      openMode: isDraft ? "normal" : "preview",
    });
    if (!isDraft) renameTarget.value = { kind: "item", id: item.properties.id };
    },
  ));
}

function beginRename(): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind === "folder" || target?.kind === "item") {
    renameTarget.value = { kind: target.kind, id: target.id };
  }
}

function beginRenameSelection(selection: TreeViewSelection): void {
  renameTarget.value = selection;
}

function rename(selection: TreeViewSelection, name: string): void {
  renameTarget.value = null;
  const entity = selection.kind === "folder"
    ? props.treeView.getFolderById(selection.id)
    : props.treeView.getItemById(selection.id);
  if (entity === null || name.length === 0 || name === entity.name) return;
  const parent = dirname(entity.path);
  if (entity.path === rootFolder.value?.path) {
    if (selection.kind === "folder") {
      report(props.treeView.controller.renameWorkspace(entity.path, name));
    }
    return;
  }
  report(props.treeView.controller.move({
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
  const selection = menuTargetSelection(target);
  if (selection === null) return;
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(deleteSelections(selections));
}

async function deleteSelections(selections: readonly TreeViewSelection[]): Promise<void> {
  for (const selection of selections) {
    if (selection.kind === "folder") {
      const folder = props.treeView.getFolderById(selection.id);
      if (folder === null) continue;
      if (folder.path === rootFolder.value?.path) {
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
        await props.treeView.controller.deleteWorkspace(folder.path);
      } else {
        await props.treeView.controller.deleteFolder(selection.id);
      }
    } else {
      await props.treeView.controller.deleteItem(selection.id);
    }
  }
  selectedNodes.value = selectionArray(props.treeView.selection.value);
}

function cloneTarget(): void {
  const target = menu.value;
  menu.value = null;
  const selection = menuTargetSelection(target);
  if (selection === null) return;
  const selections = selectedNodeKeys.value.has(selectionKey(selection))
    ? normalizeSelections(selectedNodes.value)
    : [selection];
  report(cloneSelections(selections));
}

async function cloneSelections(selections: readonly TreeViewSelection[]): Promise<void> {
  for (const selection of selections) await cloneSelection(selection);
}

async function cloneSelection(target: TreeViewSelection): Promise<void> {
  if (target?.kind === "folder") {
    const folder = props.treeView.getFolderById(target.id);
    if (folder === null) return;
  }
  const entity = resolveSelection(target);
  if (entity === null) return;
  const parent = dirname(entity.path);
  if (entity.path === rootFolder.value?.path) {
    const rootKey = props.treeView.selectedWorkspaceRef.value?.rootKey;
    const cloneName = nextCloneName(
      entity.name,
      props.treeView.workspaceRefs.value
        .filter((workspaceRef) => workspaceRef.rootKey === rootKey)
        .map((workspaceRef) => workspaceRef.workspaceName),
    );
    await props.treeView.controller.clone({
      kind: "workspace",
      sourcePath: entity.path,
      targetPath: join(parent, cloneName),
    });
    return;
  }
  const cloneKind = target.kind;
  const parentFolder = findFolderByPath(parent);
  if (parentFolder === null) return;
  const cloneName = nextCloneName(
    entity.name,
    [...parentFolder.folders, ...parentFolder.items].map((entry) => entry.name),
  );
  const clone = await props.treeView.controller.clone({
    kind: cloneKind,
    sourcePath: entity.path,
    targetPath: join(
      parent,
      cloneKind === "item" ? `${cloneName}${TREE_VIEW_ITEM_FILE_EXTENSION}` : cloneName,
    ),
  });
  if (clone !== null && selectedNodes.value.length === 1) {
    renameTarget.value = { kind: cloneKind, id: clone.properties.id };
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

function openMenuTarget(openMode: "preview" | "normal" | "pinned" = "preview"): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind !== "folder" && target?.kind !== "item") return;
  activate({ kind: target.kind, id: target.id }, openMode);
}

function openMenuTargetInExplorer(): void {
  const target = menu.value;
  const tab = contextMenuTab.value;
  menu.value = null;
  if (target === null) return;
  if (target.kind === "tab") {
    if (tab === null) return;
    report(props.treeView.controller.openInExplorer({ kind: tab.kind, id: tab.id }));
    return;
  }
  report(props.treeView.controller.openInExplorer({ kind: target.kind, id: target.id }));
}

async function copyMenuPath(kind: "relative" | "full"): Promise<void> {
  const target = menu.value;
  const entity = resolveMenuEntity(target);
  const workspacePath = props.treeView.selectedWorkspaceRef.value?.workspacePath;
  menu.value = null;
  if (entity === null || workspacePath === undefined) return;
  const path = kind === "full" ? entity.path : relative(dirname(workspacePath), entity.path);
  try {
    await navigator.clipboard.writeText(path);
    popupToast.value?.show(kind === "full" ? "Full path copied." : "Path copied.");
  } catch (reason: unknown) {
    popupToast.value?.show("Failed to copy path.");
    console.error("Failed to copy TreeView path:", reason);
  }
}

function setMenuSubtreeExpanded(isExpanded: boolean): void {
  const target = menu.value;
  menu.value = null;
  if (target?.kind !== "folder") return;
  const folder = props.treeView.getFolderById(target.id);
  if (folder === null) return;
  report((async (): Promise<void> => {
    const pending = [folder];
    while (pending.length > 0) {
      const current = pending.shift();
      if (current === undefined) continue;
      if (current.properties.isExpanded !== isExpanded) {
        await props.treeView.controller.updateFolder(current.path, {
          ...structuredClone(current.properties),
          isExpanded,
        });
      }
      pending.push(...current.folders);
    }
  })());
}

function moveNode(
  dragSources: readonly TreeViewDragSource[],
  targetKind: "folder" | "item",
  targetPath: string,
  position: "before" | "inside" | "after",
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
  position: "before" | "inside" | "after",
): Promise<void> {
  const targetEntity = targetKind === "folder"
    ? findFolderByPath(targetPath)
    : findItemByPath(targetPath);
  if (targetEntity === null) return;
  if (selections.some((selection) => selectionKey(selection) === selectionKey({
    kind: targetKind,
    id: targetEntity.properties.id,
  }))) return;
  const targetFolder = targetKind === "folder" && position === "inside"
    ? targetEntity
    : findFolderByPath(dirname(targetPath));
  if (!isTreeViewFolder(targetFolder)) return;
  validateMoveSelections(selections, targetFolder);
  const moveOrder = position === "after"
    ? [
        ...selections.filter((selection) => selection.kind === targetKind).reverse(),
        ...selections.filter((selection) => selection.kind !== targetKind),
      ]
    : selections;
  for (const selection of moveOrder) {
    const entity = resolveSelection(selection);
    if (entity === null) continue;
    const currentTargetFolder = findFolderByPath(targetFolder.path);
    if (currentTargetFolder === null) throw new Error("TreeView move target folder is missing");
    const targetOrder = position === "inside" || selection.kind !== targetKind
      ? childCount(currentTargetFolder, selection.kind)
      : entityOrder(targetKind, targetPath) + (position === "after" ? 1 : 0);
    await props.treeView.controller.move({
      kind: selection.kind,
      sourcePath: entity.path,
      targetPath: join(currentTargetFolder.path, selection.kind === "item"
        ? `${entity.name}${TREE_VIEW_ITEM_FILE_EXTENSION}`
        : entity.name),
      targetOrder,
    });
  }
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
    ? findFolderByPath(source.sourcePath)
    : findItemByPath(source.sourcePath);
  return entity === null ? null : { kind: source.kind, id: entity.properties.id };
}

function resolveSelection(selection: TreeViewSelection): TreeViewFolder | TreeViewItem | null {
  return selection.kind === "folder"
    ? props.treeView.getFolderById(selection.id)
    : props.treeView.getItemById(selection.id);
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

function menuTargetSelection(target: MenuState): TreeViewSelection | null {
  if (target === null || target.kind === "tab") return null;
  return { kind: target.kind, id: target.id };
}

function resolveMenuEntity(target: MenuState): TreeViewFolder | TreeViewItem | null {
  if (target === null) return null;
  if (target.kind !== "tab") return resolveSelection({ kind: target.kind, id: target.id });
  return tabs.value.find((entry) => entry.tab.id === target.id)?.entity ?? null;
}

function selectionArray(selection: TreeViewSelection | null): readonly TreeViewSelection[] {
  return selection === null ? [] : [selection];
}

function isWorkspaceRoot(selection: TreeViewSelection): boolean {
  if (selection.kind !== "folder") return false;
  const folder = props.treeView.getFolderById(selection.id);
  return folder !== null && folder.path === rootFolder.value?.path;
}

function findItemByPath(path: string): TreeViewItem | null {
  if (rootFolder.value === null) return null;
  const pending = [rootFolder.value];
  while (pending.length > 0) {
    const folder = pending.shift();
    if (folder === undefined) continue;
    const item = folder.items.find((candidate) => candidate.path === path);
    if (item !== undefined) return item;
    pending.push(...folder.folders);
  }
  return null;
}

function isTreeViewFolder(entity: TreeViewFolder | TreeViewItem | null): entity is TreeViewFolder {
  return entity !== null && "folders" in entity;
}

function childCount(folder: TreeViewFolder, kind: "folder" | "item"): number {
  return kind === "folder" ? folder.folders.length : folder.items.filter((item) => !item.properties.isDraft).length;
}

function entityOrder(kind: "folder" | "item", path: string): number {
  const parent = findFolderByPath(dirname(path));
  if (parent === null) return 0;
  return kind === "folder"
    ? parent.folders.findIndex((folder) => folder.path === path)
    : parent.items.filter((item) => !item.properties.isDraft).findIndex((item) => item.path === path);
}

function createWorkspace(): void {
  workspaceDialog.value = {
    name: "",
    error: "",
    isSubmitting: false,
  };
}

function updateWorkspaceName(event: Event): void {
  const state = workspaceDialog.value;
  if (state === null || !(event.target instanceof HTMLInputElement)) return;
  state.name = event.target.value;
  state.error = "";
}

async function submitWorkspace(): Promise<void> {
  const state = workspaceDialog.value;
  if (state === null || state.isSubmitting) return;
  const name = state.name.trim();
  if (name.length === 0) {
    state.error = "Workspace name is required.";
    return;
  }
  state.isSubmitting = true;
  state.error = "";
  try {
    await props.treeView.controller.createWorkspace(name);
    workspaceDialog.value = null;
  } catch (reason: unknown) {
    state.error = reason instanceof Error ? reason.message : String(reason);
    state.isSubmitting = false;
  }
}

function closeWorkspaceDialog(): void {
  if (workspaceDialog.value?.isSubmitting === true) return;
  workspaceDialog.value = null;
}

function openDraftDialog(): Promise<boolean> {
  if (activeDraft.value === null || draftDialog.value !== null) return Promise.resolve(false);
  draftDialog.value = { item: activeDraft.value, error: "", isSubmitting: false };
  return new Promise<boolean>((resolve) => {
    resolveDraftDialog = resolve;
  });
}

async function saveDraft(name: string, folderId: string): Promise<void> {
  const state = draftDialog.value;
  if (state === null || state.isSubmitting) return;
  state.isSubmitting = true;
  state.error = "";
  try {
    await props.treeView.controller.saveDraft(state.item.properties.id, folderId, name);
    draftDialog.value = null;
    resolveDraftDialog?.(true);
    resolveDraftDialog = null;
  } catch (reason: unknown) {
    state.error = reason instanceof Error ? reason.message : String(reason);
    state.isSubmitting = false;
  }
}

function closeDraftDialog(): void {
  if (draftDialog.value?.isSubmitting === true) return;
  draftDialog.value = null;
  resolveDraftDialog?.(false);
  resolveDraftDialog = null;
}

function selectWorkspace(workspacePath: string): void {
  if (workspacePath !== props.treeView.selectedWorkspaceRef.value?.workspacePath) {
    report(props.treeView.controller.switchWorkspace(workspacePath));
  }
}

function onWindowPointerDown(): void {
  menu.value = null;
}

function resizeSidebar(_index: number, width: number): void {
  sidebarWidth.value = Math.max(200, Math.min(480, width));
}

function resetSidebarWidth(): void {
  sidebarWidth.value = 240;
  saveSidebarWidth();
}

function finishSidebarResize(): void {
  saveSidebarWidth();
}

function resetSidebarSeparator(): void {
  resetSidebarWidth();
}

function saveSidebarWidth(): void {
  if (workspace.value === null) return;
  report(props.treeView.controller.updateWorkspace({
    ...structuredClone(workspace.value),
    ui: { layout: { sidebarWidth: sidebarWidth.value } },
  }));
}

function setTabPinned(tab: TreeViewTab, isPinned: boolean): void {
  report(props.treeView.controller.setTabPinned({ tabId: tab.id, isPinned }));
}

function reorderTabs(
  draggedId: string,
  targetId: string,
  position: "before" | "after",
): void {
  report(props.treeView.controller.reorderTabs({ draggedId, targetId, position }));
}

onMounted(() => {
  window.addEventListener("pointerdown", onWindowPointerDown);
});
onUnmounted(() => {
  window.removeEventListener("pointerdown", onWindowPointerDown);
  resolveDraftDialog?.(false);
  resolveDraftDialog = null;
});
</script>

<template>
  <div ref="treeViewElement" class="tree-view">
    <SplitContainer
      class="tree-view__layout"
      orientation="vertical"
      :has-item-borders="false"
      :separator-labels="['Resize sidebar']"
      @resize="resizeSidebar"
      @resize-end="finishSidebarResize"
      @separator-double-click="resetSidebarSeparator"
    >
      <aside
        v-if="!isSidebarCollapsed"
        class="tree-view__sidebar"
        :class="{ 'is-tree-only': !isTabContentVisible }"
        :style="{ width: isTabContentVisible ? `${sidebarWidth}px` : '100%' }"
      >
        <header class="tree-view__sidebar-header" :class="{ 'is-multiline': isTabMultiline }">
        <div class="workspace-selector" @pointerdown.stop>
          <PopupSelect
            :value="treeView.selectedWorkspaceRef.value?.workspacePath ?? ''"
            :options="workspaceOptions"
            accessible-label="Workspace"
            :disabled="treeView.workspaceRefs.value.length === 0"
            @update-value="selectWorkspace"
          />
        </div>
        <button v-if="hasWorkspace" type="button" class="tree-view__create-workspace" aria-label="Create workspace" title="Create workspace" @click="createWorkspace">+</button>
        <button type="button" class="tree-view__collapse" aria-label="Collapse sidebar" title="Collapse sidebar" @click="isSidebarCollapsed = true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>
        </button>
        </header>
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
            @begin-rename="beginRenameSelection"
            @rename="rename"
            @move="moveNode"
          >
            <template #folderOverlay="slotProps"><slot name="folderOverlay" v-bind="slotProps"></slot></template>
            <template v-if="$slots.itemIcon" #itemIcon="slotProps"><slot name="itemIcon" v-bind="slotProps"></slot></template>
            <template #itemOverlay="slotProps"><slot name="itemOverlay" v-bind="slotProps"></slot></template>
          </TreeViewNode>
        </ul>
        </nav>
      </aside>

      <main v-if="isTabContentVisible" class="tree-view__workspace">
      <div class="tree-view__tab-header">
        <header class="tree-view__tabs" :class="{ 'is-multiline': isTabMultiline }">
          <button
            v-if="isSidebarCollapsed"
            type="button"
            class="tree-view__expand"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            @click="isSidebarCollapsed = false"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
          <TreeViewTabs
            :tabs="tabs"
            :active-tab-id="workspace?.activeTabId ?? null"
            :preview-tab-id="treeView.previewTabId.value"
            :is-multiline="isTabMultiline"
            :is-add-visible="isItemTabVisible && hasWorkspace"
            @activate="switchTab"
            @promote="report(treeView.controller.promoteTab({ tabId: $event.id }))"
            @pin="setTabPinned"
            @close="report(treeView.controller.closeTabs({ tabIds: [$event.id] }))"
            @context-menu="openTabMenu"
            @reorder="reorderTabs"
            @add="createItem(true)"
          >
            <template v-if="$slots.itemIcon" #itemIcon="slotProps"><slot name="itemIcon" v-bind="slotProps"></slot></template>
            <template #tabOverlay="slotProps"><slot name="tabOverlay" v-bind="slotProps"></slot></template>
          </TreeViewTabs>
        </header>
        <nav v-if="activeEntry" class="tree-view__breadcrumb" aria-label="Current path">
          <span class="tree-view__breadcrumb-segments" :title="breadcrumbPath">
            <template v-for="(segment, index) in breadcrumbSegments" :key="`${index}:${segment}`">
              <span v-if="index > 0" class="tree-view__breadcrumb-separator" aria-hidden="true"></span>
              <span class="tree-view__breadcrumb-segment">{{ segment }}</span>
            </template>
          </span>
        </nav>
      </div>
      <section class="tree-view__content">
        <PersistentStack
          v-if="activeEntry !== null"
          :entries="tabs"
          :active-key="activeTabPageKey"
          :get-entry-key="(entry) => getTabPageKey(entry.tab)"
          defer-display-until-ready
        >
          <template #default="{ entry, isActive, notifyReady }">
            <slot
              name="tabPage"
              :tab="entry.tab"
              :entity="entry.entity"
              :is-active="isActive"
              :notify-ready="notifyReady"
              :request-draft-save="openDraftDialog"
            ></slot>
          </template>
        </PersistentStack>
        <div v-if="!hasWorkspace" class="tree-view__empty">
          <div class="tree-view__empty-content">
            <h2>No workspace found</h2>
            <p>Create a workspace to continue.</p>
            <button type="button" class="tree-view__empty-action" @click="createWorkspace">
              Create workspace
            </button>
          </div>
        </div>
        <p v-else-if="activeEntry === null" class="tree-view__empty">Select or create an item.</p>
      </section>
      </main>
    </SplitContainer>

    <PopupToast ref="popupToast" />

    <ContextMenu v-if="menu" :position="menu.position" :area="menu.area">
      <template v-if="isMultiNodeMenu">
        <button type="button" role="menuitem" @click="cloneTarget">Clone</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" class="is-danger" @click="deleteTarget">Delete</button>
      </template>
      <template v-else-if="menu.kind === 'folder'">
        <button type="button" role="menuitem" @click="createItem(false)">New {{ itemLabel.toLowerCase() }}</button>
        <button type="button" role="menuitem" @click="createFolder">New {{ folderLabel.toLowerCase() }}</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="openMenuTarget('normal')">Open</button>
        <button type="button" role="menuitem" @click="openMenuTargetInExplorer">Open in Explorer</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="copyMenuPath('relative')">Copy Path</button>
        <button type="button" role="menuitem" @click="copyMenuPath('full')">Copy Full Path</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="setMenuSubtreeExpanded(true)">Expand All</button>
        <button type="button" role="menuitem" @click="setMenuSubtreeExpanded(false)">Collapse All</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="cloneTarget">Clone</button>
        <button type="button" role="menuitem" @click="beginRename">Rename</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" class="is-danger" @click="deleteTarget">Delete</button>
      </template>
      <template v-else-if="menu.kind === 'item'">
        <button type="button" role="menuitem" @click="openMenuTarget('normal')">Open</button>
        <button type="button" role="menuitem" @click="openMenuTargetInExplorer">Open in Explorer</button>
        <button type="button" role="menuitem" @click="openMenuTarget('pinned')">Pin</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="copyMenuPath('relative')">Copy Path</button>
        <button type="button" role="menuitem" @click="copyMenuPath('full')">Copy Full Path</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="cloneTarget">Clone</button>
        <button type="button" role="menuitem" @click="beginRename">Rename</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" class="is-danger" @click="deleteTarget">Delete</button>
      </template>
      <template v-if="menu.kind === 'tab'">
        <button type="button" role="menuitem" @click="closeMenuTab">Close</button>
        <button v-if="contextMenuTab !== null" type="button" role="menuitem" @click="toggleMenuTabPinned">
          {{ contextMenuTab.isPinned ? "Unpin" : "Pin" }}
        </button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="openMenuTargetInExplorer">Open in Folder</button>
        <button type="button" role="menuitem" @click="copyMenuPath('relative')">Copy Path</button>
        <button type="button" role="menuitem" @click="copyMenuPath('full')">Copy Full Path</button>
        <span role="separator"></span>
        <button type="button" role="menuitem" @click="closeMenuTabs('others')">Close Others</button>
        <button type="button" role="menuitem" @click="closeMenuTabs('left')">Close Left</button>
        <button type="button" role="menuitem" @click="closeMenuTabs('right')">Close Right</button>
        <button type="button" role="menuitem" @click="closeMenuTabs('othersExceptPinned')">Close Others Except Pinned</button>
      </template>
    </ContextMenu>

    <div
      v-if="workspaceDialog !== null"
      class="tree-view-dialog-backdrop"
      @pointerdown.self="closeWorkspaceDialog"
    >
      <form
        class="tree-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-view-create-workspace-title"
        @submit.prevent="submitWorkspace"
        @keydown.escape.prevent="closeWorkspaceDialog"
      >
        <header class="tree-view-dialog__header">
          <h2 id="tree-view-create-workspace-title">Create workspace</h2>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            :disabled="workspaceDialog.isSubmitting"
            @click="closeWorkspaceDialog"
          >×</button>
        </header>
        <label class="tree-view-dialog__body" for="tree-view-workspace-name">
          <span>Workspace name</span>
          <input
            id="tree-view-workspace-name"
            type="text"
            :value="workspaceDialog.name"
            :disabled="workspaceDialog.isSubmitting"
            :aria-invalid="workspaceDialog.error.length > 0"
            autofocus
            @input="updateWorkspaceName"
          />
          <span v-if="workspaceDialog.error.length > 0" class="tree-view-dialog__error" role="alert">
            {{ workspaceDialog.error }}
          </span>
        </label>
        <footer class="tree-view-dialog__actions">
          <button type="button" :disabled="workspaceDialog.isSubmitting" @click="closeWorkspaceDialog">Cancel</button>
          <button type="submit" class="is-primary" :disabled="workspaceDialog.isSubmitting">
            {{ workspaceDialog.isSubmitting ? "Creating..." : "Create" }}
          </button>
        </footer>
      </form>
    </div>

    <TreeViewSaveDraftDialog
      :item="draftDialog?.item ?? null"
      :root-folder="rootFolder"
      :item-label="itemLabel"
      :is-submitting="draftDialog?.isSubmitting ?? false"
      :error="draftDialog?.error ?? ''"
      @save="saveDraft"
      @cancel="closeDraftDialog"
    />
  </div>
</template>

<style scoped>
.tree-view { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; overflow: hidden; color: var(--color-text); background: transparent; font-size: 13px; line-height: 1.4; user-select: none; }
.tree-view :is(input, textarea) { user-select: text; }
.tree-view__layout { flex: 1; overflow: hidden; }
.tree-view__sidebar { min-width: 200px; max-width: 480px; flex: none; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--color-default-bg); border: 1px solid var(--color-border); border-radius: 0; }
.tree-view__sidebar.is-tree-only { max-width: none; flex: 1; }
.tree-view__sidebar-header { height: var(--tree-row-height); min-height: var(--tree-row-height); display: flex; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border-bottom: 1px solid var(--color-divider); }
.tree-view__sidebar-header.is-multiline { height: calc(var(--tree-row-height) + 2 * var(--space-1)); min-height: calc(var(--tree-row-height) + 2 * var(--space-1)); padding-block: var(--space-1); }
.tree-view__sidebar-header button { width: 28px; height: var(--tree-row-height); border: 1px solid transparent; border-radius: var(--radius-medium); color: var(--color-text-muted); background: transparent; cursor: pointer; }
.tree-view__sidebar-header button:hover, .tree-view__expand:hover { color: var(--color-text); background: var(--color-surface-raised); }
.tree-view__sidebar-header .tree-view__create-workspace { color: var(--color-text-muted); background: transparent; font-size: 16px; line-height: 1; }
.tree-view__sidebar-header .tree-view__collapse { width: 24px; height: var(--tree-row-height); display: grid; place-items: center; flex: 0 0 24px; padding: 0; border: 0; }
.tree-view__collapse svg, .tree-view__expand svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
.workspace-selector { position: relative; min-width: 0; flex: 1; }
.tree-view__explorer { flex: 1; min-height: 0; overflow: auto; padding: var(--space-1); scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--color-text-muted) 30%, transparent) transparent; }
.tree-view__root { margin: 0; padding: 0; list-style: none; }
.tree-view__workspace { min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; background: transparent; }
.tree-view__tab-header { flex: none; overflow: hidden; border: 1px solid var(--color-border); border-block-end: 0; border-radius: 0; }
.tree-view__tabs { min-height: var(--tree-row-height); height: var(--tree-row-height); display: flex; align-items: end; background: var(--color-default-bg); }
.tree-view__tabs.is-multiline { height: auto; max-height: 104px; align-items: flex-start; padding-block: var(--space-1); }
.tree-view__expand { width: 24px; height: 32px; display: grid; place-items: center; align-self: center; flex: 0 0 24px; padding: 0; margin-inline-end: var(--space-2); border: 0; border-radius: 0; color: var(--color-text-muted); background: transparent; cursor: pointer; }
.tree-view__breadcrumb { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 0 var(--space-3) var(--space-2); overflow: hidden; color: color-mix(in srgb, var(--color-text-muted) 82%, var(--color-content-bg)); background: var(--color-content-bg); font-size: 12px; line-height: 20px; white-space: nowrap; }
.tree-view__breadcrumb-segments { min-width: 0; display: flex; align-items: center; gap: var(--space-1); overflow-x: auto; scrollbar-width: none; }
.tree-view__breadcrumb-segments::-webkit-scrollbar { display: none; }
.tree-view__breadcrumb-segment { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.tree-view__breadcrumb-separator { width: 5px; height: 5px; flex: none; border-top: 1px solid currentColor; border-right: 1px solid currentColor; color: var(--color-text-muted); transform: rotate(45deg); }
.tree-view__breadcrumb button { flex: none; height: 24px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-small); color: var(--color-text); background: var(--color-surface-raised); cursor: pointer; }
.tree-view__content { flex: 1; min-height: 0; display: flex; overflow: auto; background: transparent; }
.tree-view__empty { flex: 1; display: grid; min-width: 0; height: 100%; place-items: center; margin: 0; color: var(--color-text-muted); border-inline: 1px solid var(--color-border); border-block-end: 1px solid var(--color-border); font-size: 13px; }
.tree-view__empty-content { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; }
.tree-view__empty-content h2 { margin: 0; color: var(--color-text); font-size: 16px; font-weight: 500; }
.tree-view__empty-content p { margin: 0 0 var(--space-2); }
.tree-view__empty-action { min-width: 128px; height: 36px; padding-inline: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: transparent; cursor: pointer; }
.tree-view__empty-action:hover { border-color: color-mix(in srgb, var(--color-text-muted) 60%, var(--color-border)); background: var(--color-surface-raised); }
.tree-view__empty-action:active { transform: translateY(1px); }
.tree-view-dialog-backdrop { position: fixed; z-index: 220; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--color-backdrop-strong); }
.tree-view-dialog { width: min(500px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-surface-raised); box-shadow: var(--shadow-dialog); }
.tree-view-dialog__header, .tree-view-dialog__actions { min-height: 48px; display: flex; align-items: center; padding-inline: var(--space-4); }
.tree-view-dialog__header { justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.tree-view-dialog__header h2 { margin: 0; font-size: 16px; }
.tree-view-dialog__header button { width: 28px; height: 28px; padding: 0; border: 0; color: var(--color-text-muted); background: transparent; font-size: 20px; cursor: pointer; }
.tree-view-dialog__body { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); color: var(--color-text-muted); font-size: 13px; }
.tree-view-dialog__body input { height: 36px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-bg); }
.tree-view-dialog__body input:focus-visible { border-color: var(--color-primary); outline: 0; box-shadow: inset 0 0 0 1px var(--color-primary); }
.tree-view-dialog__error { color: var(--color-danger); }
.tree-view-dialog__actions { justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); }
.tree-view-dialog__actions button { min-width: 72px; height: 32px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: transparent; cursor: pointer; }
.tree-view-dialog__actions button.is-primary { border-color: var(--color-primary); color: var(--color-bg); background: var(--color-primary); font-weight: 600; }
.tree-view-dialog button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
</style>
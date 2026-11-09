<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import type { TreeViewFolder, TreeViewItem } from "../../../../../common/treeView";
import type { TreeViewDropPosition, TreeViewSelection } from "../treeViewTypes";

type RenameTarget = { kind: "folder" | "item"; path: string } | null;
type DropIndicator = {
  kind: "folder" | "item";
  path: string;
  position: "before" | "inside" | "after";
  lineStart: number;
} | null;

type TreeViewDragSource = {
  kind: "folder" | "item";
  sourcePath: string;
};

const props = defineProps<{
  folder: TreeViewFolder;
  item: TreeViewItem | null;
  isFolderLoaded: (folderPath: string) => boolean;
  selectedKeys: ReadonlySet<string>;
  highlightedKeys: ReadonlySet<string>;
  renameTarget: RenameTarget;
  depth: number;
}>();

defineSlots<{
  folderOverlay(props: { folder: TreeViewFolder; isSelected: boolean }): unknown;
  itemIcon(props: { item: TreeViewItem; isSelected: boolean }): unknown;
  itemOverlay(props: { item: TreeViewItem; isSelected: boolean }): unknown;
}>();

const emit = defineEmits<{
  activate: [selection: TreeViewSelection, openMode: "preview" | "normal" | "pinned", isAdditive: boolean];
  toggle: [folder: TreeViewFolder];
  contextMenu: [event: MouseEvent | KeyboardEvent, selection: TreeViewSelection];
  beginRename: [selection: TreeViewSelection];
  rename: [selection: TreeViewSelection, name: string];
  move: [
    sources: readonly TreeViewDragSource[],
    targetKind: "folder" | "item",
    targetPath: string,
    position: TreeViewDropPosition,
  ];
}>();

const renameInput = ref<HTMLInputElement | null>(null);
const renameValue = ref("");
const lastFocusedRenameKey = ref("");
const dropIndicator = ref<DropIndicator>(null);
const folderPadding = computed(() => `${props.depth * 12 + 8}px`);
const itemPadding = computed(() => `${props.depth * 12 + 26}px`);
const guideDepths = computed(() => Array.from(
  { length: Math.max(0, props.item === null ? props.depth - 1 : props.depth) },
  (_, index) => index + 1,
));
const renameTargetKey = computed(() => props.renameTarget === null
  ? ""
  : `${props.renameTarget.kind}:${props.renameTarget.path}`);

watch(
  () => props.renameTarget,
  (target) => {
    if (target === null) {
      lastFocusedRenameKey.value = "";
      return;
    }
    if (target?.path === props.folder.path) {
      renameValue.value = props.folder.name;
      focusRenameInput();
      return;
    }
    if (props.item === null || props.item.path !== target.path) return;
    renameValue.value = props.item.name;
    focusRenameInput();
  },
  { immediate: true },
);

function setRenameInput(element: Element | ComponentPublicInstance | null): void {
  renameInput.value = element instanceof HTMLInputElement ? element : null;
  focusRenameInput();
}

function onNodeActivate(event: MouseEvent, selection: TreeViewSelection): void {
  const isAdditive = event.ctrlKey || event.metaKey;
  emit("activate", selection, "preview", isAdditive);
}

function onItemDoubleClick(item: TreeViewItem): void {
  emit("activate", { kind: "item", path: item.path }, "normal", false);
}

function onFolderDoubleClick(folder: TreeViewFolder): void {
  emit("activate", { kind: "folder", path: folder.path }, "normal", false);
}

function focusRenameInput(): void {
  const key = renameTargetKey.value;
  if (key.length === 0 || renameInput.value === null || lastFocusedRenameKey.value === key) return;
  lastFocusedRenameKey.value = key;
  void nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
}

function onRenameInput(event: Event): void {
  if (event.target instanceof HTMLInputElement) renameValue.value = event.target.value;
}

function onRenameKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.select();
}

function commitRename(selection: TreeViewSelection): void {
  emit("rename", selection, renameValue.value.trim());
}

function commitRenameOnEnter(event: KeyboardEvent): void {
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur();
}

function cancelRename(event: KeyboardEvent, originalName: string): void {
  renameValue.value = originalName;
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur();
}

function onContextKey(event: KeyboardEvent, selection: TreeViewSelection): void {
  if (event.key === "F2") {
    event.preventDefault();
    event.stopPropagation();
    emit("beginRename", selection);
    return;
  }
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  event.preventDefault();
  emit("contextMenu", event, selection);
}

function onDragStart(event: DragEvent, kind: "folder" | "item", sourcePath: string): void {
  event.dataTransfer?.setData("application/x-tree-view-node", JSON.stringify([{ kind, sourcePath }]));
  if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(
  event: DragEvent,
  kind: "folder" | "item",
  path: string,
  canDropInside: boolean,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const offset = event.clientY - bounds.top;
  const position = offset < bounds.height / 3
    ? "before"
    : canDropInside && offset < bounds.height * 2 / 3
      ? "inside"
      : "after";
  dropIndicator.value = {
    kind,
    path,
    position,
    lineStart: position === "inside" ? 0 : resolveDropLineStart(event.currentTarget, kind, position),
  };
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
}

function resolveDropLineStart(
  row: HTMLElement,
  kind: "folder" | "item",
  position: "before" | "inside" | "after",
): number {
  const isCurrentFolderTarget = kind === "item"
    || (position === "after" && props.folder.properties.isExpanded);
  const parentDepth = isCurrentFolderTarget ? props.depth : props.depth - 1;
  if (parentDepth < 0) return 0;
  const rowBounds = row.getBoundingClientRect();
  return Math.min(parentDepth * 12 + 26, rowBounds.width - 8);
}

function clearDropIndicator(event?: DragEvent): void {
  if (event?.currentTarget instanceof HTMLElement
    && event.relatedTarget instanceof Node
    && event.currentTarget.contains(event.relatedTarget)) return;
  dropIndicator.value = null;
}

function onDrop(
  event: DragEvent,
  targetKind: "folder" | "item",
  targetPath: string,
): void {
  event.preventDefault();
  event.stopPropagation();
  const indicator = dropIndicator.value;
  dropIndicator.value = null;
  if (indicator?.kind !== targetKind || indicator.path !== targetPath) return;
  const value = event.dataTransfer?.getData("application/x-tree-view-node");
  if (!value) return;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return;
    const sources: TreeViewDragSource[] = [];
    for (const candidate of parsed) {
      if (candidate === null || typeof candidate !== "object" || !("kind" in candidate)
        || !("sourcePath" in candidate)
        || (candidate.kind !== "folder" && candidate.kind !== "item")
        || typeof candidate.sourcePath !== "string") return;
      sources.push({ kind: candidate.kind, sourcePath: candidate.sourcePath });
    }
    const position = targetKind === "folder"
      && indicator.position === "after"
      && props.folder.properties.isExpanded
      ? "inside-before"
      : indicator.position;
    if (sources.length > 0) emit("move", sources, targetKind, targetPath, position);
  } catch {
    return;
  }
}

function selectionKey(selection: TreeViewSelection): string {
  return `${selection.kind}:${selection.path}`;
}

function isSelected(selection: TreeViewSelection): boolean {
  return props.selectedKeys.has(selectionKey(selection));
}

function isHighlighted(selection: TreeViewSelection): boolean {
  return props.highlightedKeys.has(selectionKey(selection));
}

function isFolderLoading(): boolean {
  return props.folder.properties.isExpanded && !props.isFolderLoaded(props.folder.path);
}
</script>

<template>
  <div class="tree-node">
    <span
      v-for="guideDepth in guideDepths"
      :key="guideDepth"
      class="tree-node__guide"
      :style="{ left: `${guideDepth * 12 + 20}px` }"
      aria-hidden="true"
    ></span>
    <div
      v-if="item === null"
      class="tree-row"
      :class="{
        'is-folder': true,
        'is-selected': isSelected({ kind: 'folder', path: folder.path }),
        'is-path-highlighted': isHighlighted({ kind: 'folder', path: folder.path })
          && !isSelected({ kind: 'folder', path: folder.path }),
        'is-drop-before': dropIndicator?.kind === 'folder' && dropIndicator.path === folder.path && dropIndicator.position === 'before',
        'is-drop-inside': dropIndicator?.kind === 'folder' && dropIndicator.path === folder.path && dropIndicator.position === 'inside',
        'is-drop-after': dropIndicator?.kind === 'folder' && dropIndicator.path === folder.path && dropIndicator.position === 'after',
      }"
      :style="{
        paddingInlineStart: folderPadding,
        '--tree-drop-line-left': `${dropIndicator?.lineStart ?? 0}px`,
      }"
      :aria-busy="isFolderLoading()"
      :draggable="renameTarget?.kind !== 'folder' || renameTarget.path !== folder.path"
      @mousedown.left="onNodeActivate($event, { kind: 'folder', path: folder.path })"
      @dblclick="onFolderDoubleClick(folder)"
      @contextmenu.prevent.stop="emit('contextMenu', $event, { kind: 'folder', path: folder.path })"
      @dragstart="onDragStart($event, 'folder', folder.path)"
      @dragover="onDragOver($event, 'folder', folder.path, true)"
      @dragleave="clearDropIndicator"
      @drop="onDrop($event, 'folder', folder.path)"
    >
      <button
        type="button"
        class="tree-row__caret"
        :aria-label="folder.properties.isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`"
        :aria-expanded="folder.properties.isExpanded"
        @mousedown.left.stop="emit('toggle', folder)"
        @click.stop="$event.detail === 0 && emit('toggle', folder)"
      >
        <span v-if="isFolderLoading()" class="tree-row__loading" aria-hidden="true"></span>
        <svg v-else :class="{ 'is-expanded': folder.properties.isExpanded }" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
      </button>
      <div class="tree-row__content">
        <input
          v-if="renameTarget?.kind === 'folder' && renameTarget.path === folder.path"
          :ref="setRenameInput"
          class="tree-row__rename"
          spellcheck="false"
          :value="renameValue"
          @input="onRenameInput"
          @keydown="onRenameKeydown"
          @keydown.enter.prevent="commitRenameOnEnter"
          @keydown.escape.prevent="cancelRename($event, folder.name)"
          @blur="commitRename({ kind: 'folder', path: folder.path })"
          @mousedown.stop
          @click.stop
          @dragstart.prevent.stop
        />
        <button
          v-else
          type="button"
          class="tree-row__name"
          :title="folder.name"
          @mousedown.left.stop="onNodeActivate($event, { kind: 'folder', path: folder.path })"
          @click.stop="$event.detail === 0 && onNodeActivate($event, { kind: 'folder', path: folder.path })"
          @keydown="onContextKey($event, { kind: 'folder', path: folder.path })"
        ><span class="tree-row__name-text">{{ folder.name }}</span></button>
        <div class="tree-row__overlay" @mousedown.stop>
          <slot
            name="folderOverlay"
            :folder="folder"
            :is-selected="isSelected({ kind: 'folder', path: folder.path })"
          ></slot>
        </div>
      </div>
      <button
        v-if="renameTarget?.kind !== 'folder' || renameTarget.path !== folder.path"
        type="button"
        class="tree-row__actions"
        :aria-label="`Actions for ${folder.name}`"
        @mousedown.stop
        @click.stop="emit('contextMenu', $event, { kind: 'folder', path: folder.path })"
      ><span class="tree-row__dots" aria-hidden="true"><span></span><span></span><span></span></span></button>
    </div>

        <div
          v-else
          class="tree-row"
          :class="{
            'is-item': true,
            'is-selected': isSelected({ kind: 'item', path: item.path }),
            'is-drop-before': dropIndicator?.kind === 'item' && dropIndicator.path === item.path && dropIndicator.position === 'before',
            'is-drop-after': dropIndicator?.kind === 'item' && dropIndicator.path === item.path && dropIndicator.position === 'after',
          }"
          :style="{
            paddingInlineStart: itemPadding,
            '--tree-drop-line-left': `${dropIndicator?.lineStart ?? 0}px`,
          }"
          :draggable="renameTarget?.kind !== 'item' || renameTarget.path !== item.path"
          @mousedown.left="onNodeActivate($event, { kind: 'item', path: item.path })"
          @dblclick="onItemDoubleClick(item)"
          @contextmenu.prevent.stop="emit('contextMenu', $event, { kind: 'item', path: item.path })"
          @dragstart="onDragStart($event, 'item', item.path)"
          @dragover="onDragOver($event, 'item', item.path, false)"
          @dragleave="clearDropIndicator"
          @drop="onDrop($event, 'item', item.path)"
        >
          <span class="tree-row__item-icon">
            <slot
              name="itemIcon"
              :item="item"
              :is-selected="isSelected({ kind: 'item', path: item.path })"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 1.75h6l4 4v8.5H3z" />
                <path d="M9 1.75v4h4" />
              </svg>
            </slot>
          </span>
          <div class="tree-row__content">
            <input
              v-if="renameTarget?.kind === 'item' && renameTarget.path === item.path"
              :ref="setRenameInput"
              class="tree-row__rename"
              spellcheck="false"
              :value="renameValue"
              @input="onRenameInput"
              @keydown="onRenameKeydown"
              @keydown.enter.prevent="commitRenameOnEnter"
              @keydown.escape.prevent="cancelRename($event, item.name)"
              @blur="commitRename({ kind: 'item', path: item.path })"
              @mousedown.stop
              @click.stop
              @dragstart.prevent.stop
            />
            <button
              v-else
              type="button"
              class="tree-row__name"
              :title="item.name"
              @mousedown.left.stop="onNodeActivate($event, { kind: 'item', path: item.path })"
              @click.stop="$event.detail === 0 && onNodeActivate($event, { kind: 'item', path: item.path })"
              @dblclick.stop="onItemDoubleClick(item)"
              @keydown="onContextKey($event, { kind: 'item', path: item.path })"
            ><span class="tree-row__name-text">{{ item.name }}</span></button>
            <div class="tree-row__overlay" @mousedown.stop>
              <slot
                name="itemOverlay"
                :item="item"
                :is-selected="isSelected({ kind: 'item', path: item.path })"
              ></slot>
            </div>
          </div>
          <button
            v-if="renameTarget?.kind !== 'item' || renameTarget.path !== item.path"
            type="button"
            class="tree-row__actions"
            :aria-label="`Actions for ${item.name}`"
            @mousedown.stop
            @click.stop="emit('contextMenu', $event, { kind: 'item', path: item.path })"
          ><span class="tree-row__dots" aria-hidden="true"><span></span><span></span><span></span></span></button>
        </div>
  </div>
</template>

<style scoped>
.tree-node { position: relative; min-width: 0; margin: 0; padding: 0; }
.tree-node__guide { position: absolute; z-index: 6; top: 0; bottom: 0; width: 1px; background: color-mix(in srgb, var(--color-border) 80%, var(--color-surface)); pointer-events: none; }
.tree-row { position: relative; width: 100%; min-width: 0; height: var(--tree-row-height); display: flex; align-items: center; gap: var(--space-1); padding-inline-end: var(--space-2); border-radius: var(--radius-small); color: var(--color-text-muted); font-size: 13px; line-height: 1.4; cursor: pointer; }
.tree-row.is-folder { gap: 0; font-weight: 600; }
.tree-row.is-item { font-weight: 400; }
.tree-row:hover, .tree-row:focus-within { color: var(--color-text); background: var(--color-surface-hover, color-mix(in srgb, var(--color-surface-raised) 62%, var(--color-surface))); }
.tree-row.is-selected { color: var(--color-text); background: var(--color-surface-selected); }
.tree-row.is-path-highlighted { color: var(--color-text); }
.tree-row.is-path-highlighted .tree-row__caret { color: var(--color-primary-emphasis); }
.tree-row.is-drop-before::before, .tree-row.is-drop-after::after { position: absolute; z-index: 4; right: 0; left: var(--tree-drop-line-left, 0); height: 2px; content: ""; background: var(--color-primary); pointer-events: none; }
.tree-row.is-drop-before::before { top: -1px; }
.tree-row.is-drop-after::after { bottom: -1px; }
.tree-row.is-drop-inside { background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 55%, transparent); }
.tree-row__caret, .tree-row__name, .tree-row__actions { border: 0; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.tree-row__caret { width: 24px; height: var(--tree-row-height); flex: 0 0 24px; display: grid; place-items: center; padding: 0; }
.tree-row__caret svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s ease; }
.tree-row__caret svg.is-expanded { transform: rotate(90deg); }
.tree-row__loading { width: 12px; height: 12px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: tree-folder-loading 0.8s linear infinite; }
@keyframes tree-folder-loading { to { transform: rotate(360deg); } }
.tree-row__content { position: relative; min-width: 0; flex: 1; display: flex; align-items: center; gap: var(--space-1); }
.tree-row__name { min-width: 0; flex: 1; align-self: stretch; display: flex; align-items: center; padding: 0; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tree-row__name-text { min-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-row__overlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.tree-row__actions { width: 24px; height: 24px; flex: 0 0 24px; display: grid; place-items: center; padding: 0; visibility: hidden; pointer-events: none; border-radius: var(--radius-small); }
.tree-row:hover .tree-row__actions, .tree-row:focus-within .tree-row__actions { visibility: visible; pointer-events: auto; }
.tree-row__actions:hover { background: color-mix(in srgb, var(--color-text) 8%, transparent); }
.tree-row__dots { display: flex; align-items: center; gap: 2px; }
.tree-row__dots span { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
.tree-row__item-icon { min-width: 0; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; margin: 0; color: var(--color-text-muted); }
.tree-row__item-icon :deep(svg) { width: auto; max-width: 24px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.25; }
.tree-row.is-selected .tree-row__item-icon { color: var(--color-primary); }
.tree-row__rename { min-width: 0; height: 24px; flex: 1; padding-inline: var(--space-1); border: 1px solid var(--color-border); border-radius: 0; color: var(--color-text); background: var(--color-bg); font: inherit; line-height: 1.4; }
.tree-row__rename { user-select: text; }
.tree-row__rename:focus { background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-raised)); outline: 0; }
:is(.tree-row__caret, .tree-row__name, .tree-row__actions):focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .tree-row__caret svg { transition: none; } .tree-row__loading { animation: none; } }
</style>
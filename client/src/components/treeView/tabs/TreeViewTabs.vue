<script setup lang="ts">
import { basename } from "pathe";
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { TREE_VIEW_ITEM_FILE_EXTENSION, type TreeViewTab } from "../../../../../common/treeView";
type TabDropIndicator = Readonly<{
  targetPath: string;
  position: "before" | "after";
}>;

const props = withDefaults(defineProps<{
  tabs: readonly TreeViewTab[];
  activeTabPath: string | null;
  previewTabPath: string | null;
  isMultiline?: boolean;
  isAddVisible?: boolean;
}>(), {
  isMultiline: false,
  isAddVisible: true,
});
defineSlots<{
  itemIcon(props: { tab: TreeViewTab; isSelected: boolean }): unknown;
  tabOverlay(props: { tab: TreeViewTab; isActive: boolean }): unknown;
}>();
const emit = defineEmits<{
  activate: [tab: TreeViewTab];
  promote: [tab: TreeViewTab];
  pin: [tab: TreeViewTab, isPinned: boolean];
  close: [tab: TreeViewTab];
  contextMenu: [event: MouseEvent, tab: TreeViewTab];
  reorder: [draggedPath: string, targetPath: string, position: "before" | "after"];
  add: [];
}>();
const tabsViewport = useTemplateRef<HTMLElement>("tabsViewport");
const scrollMetrics = ref({ isOverflowing: false, thumbWidth: 0, thumbOffset: 0 });
const scrollDrag = ref<{ startX: number; startScrollLeft: number } | null>(null);
const draggedTabId = ref<string | null>(null);
const dropIndicator = ref<TabDropIndicator | null>(null);
let resizeObserver: ResizeObserver | null = null;

const scrollbarThumbStyle = computed(() => ({
  width: `${scrollMetrics.value.thumbWidth}px`,
  transform: `translateX(${scrollMetrics.value.thumbOffset}px)`,
}));

watch(
  () => props.tabs.map((tab) => `${tab.path}:${tab.path}`).join("|"),
  () => void nextTick(updateScrollMetrics),
);
watch(() => props.isMultiline, () => void nextTick(updateScrollMetrics));

onMounted(() => {
  const viewport = tabsViewport.value;
  if (viewport !== null) {
    resizeObserver = new ResizeObserver(updateScrollMetrics);
    resizeObserver.observe(viewport);
  }
  window.addEventListener("resize", updateScrollMetrics);
  void nextTick(updateScrollMetrics);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", updateScrollMetrics);
  stopScrollbarDrag();
});

function updateScrollMetrics(): void {
  const viewport = tabsViewport.value;
  if (viewport === null || props.isMultiline) {
    scrollMetrics.value = { isOverflowing: false, thumbWidth: 0, thumbOffset: 0 };
    return;
  }
  const scrollableWidth = viewport.scrollWidth - viewport.clientWidth;
  if (scrollableWidth <= 0) {
    scrollMetrics.value = { isOverflowing: false, thumbWidth: 0, thumbOffset: 0 };
    return;
  }
  const trackWidth = Math.max(0, viewport.clientWidth - 8);
  const thumbWidth = Math.max(36, trackWidth * viewport.clientWidth / viewport.scrollWidth);
  const thumbTravel = Math.max(0, trackWidth - thumbWidth);
  scrollMetrics.value = {
    isOverflowing: true,
    thumbWidth,
    thumbOffset: 4 + viewport.scrollLeft / scrollableWidth * thumbTravel,
  };
}

function startScrollbarDrag(event: PointerEvent): void {
  const viewport = tabsViewport.value;
  if (viewport === null || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  scrollDrag.value = { startX: event.clientX, startScrollLeft: viewport.scrollLeft };
  window.addEventListener("pointermove", onScrollbarDrag);
  window.addEventListener("pointerup", stopScrollbarDrag);
  window.addEventListener("pointercancel", stopScrollbarDrag);
}

function onScrollbarDrag(event: PointerEvent): void {
  const viewport = tabsViewport.value;
  if (viewport === null || scrollDrag.value === null) return;
  const trackWidth = Math.max(0, viewport.clientWidth - 8);
  const thumbTravel = trackWidth - scrollMetrics.value.thumbWidth;
  if (thumbTravel <= 0) return;
  const scrollableWidth = viewport.scrollWidth - viewport.clientWidth;
  viewport.scrollLeft = scrollDrag.value.startScrollLeft
    + (event.clientX - scrollDrag.value.startX) * scrollableWidth / thumbTravel;
}

function stopScrollbarDrag(): void {
  scrollDrag.value = null;
  window.removeEventListener("pointermove", onScrollbarDrag);
  window.removeEventListener("pointerup", stopScrollbarDrag);
  window.removeEventListener("pointercancel", stopScrollbarDrag);
}

function onTabsWheel(event: WheelEvent): void {
  const viewport = tabsViewport.value;
  if (viewport === null || props.isMultiline || viewport.scrollWidth <= viewport.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (delta === 0) return;
  const previousScrollLeft = viewport.scrollLeft;
  viewport.scrollLeft += delta;
  if (viewport.scrollLeft !== previousScrollLeft) event.preventDefault();
}

function onDragStart(event: DragEvent, tabPath: string): void {
  event.dataTransfer?.setData("application/x-tree-view-tab", tabPath);
  if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
  draggedTabId.value = tabPath;
}

function onDragOver(event: DragEvent, targetPath: string): void {
  if (draggedTabId.value === null || draggedTabId.value === targetPath
    || !(event.currentTarget instanceof HTMLElement)) {
    dropIndicator.value = null;
    return;
  }
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  dropIndicator.value = {
    targetPath,
    position: event.clientX < bounds.left + bounds.width / 2 ? "before" : "after",
  };
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
}

function stopTabDrag(): void {
  draggedTabId.value = null;
  dropIndicator.value = null;
}

function tabTitle(tab: TreeViewTab): string {
  return tab.kind === "item"
    ? basename(tab.path, TREE_VIEW_ITEM_FILE_EXTENSION)
    : basename(tab.path);
}

function onDrop(event: DragEvent, targetPath: string): void {
  event.preventDefault();
  const draggedPath = event.dataTransfer?.getData("application/x-tree-view-tab");
  const indicator = dropIndicator.value;
  stopTabDrag();
  if (!draggedPath || draggedPath === targetPath || indicator?.targetPath !== targetPath) return;
  emit("reorder", draggedPath, targetPath, indicator.position);
}
</script>

<template>
  <div class="tree-tabs-shell" :class="{ 'is-dragging-scrollbar': scrollDrag !== null }">
    <nav ref="tabsViewport" class="tree-tabs" :class="{ 'is-multiline': isMultiline }" aria-label="Open items" @scroll="updateScrollMetrics" @wheel="onTabsWheel">
      <div
        v-for="tab in tabs"
        :key="tab.path"
        class="tree-tab"
        :class="{
          'is-active': activeTabPath === tab.path,
          'is-preview': previewTabPath === tab.path,
          'is-drop-before': dropIndicator?.targetPath === tab.path && dropIndicator?.position === 'before',
          'is-drop-after': dropIndicator?.targetPath === tab.path && dropIndicator?.position === 'after',
        }"
        draggable="true"
        @dragstart="onDragStart($event, tab.path)"
        @dragover="onDragOver($event, tab.path)"
        @dragend="stopTabDrag"
        @drop="onDrop($event, tab.path)"
        @contextmenu.prevent="emit('contextMenu', $event, tab)"
      >
        <button
          type="button"
          class="tree-tab__label"
          @mousedown.left="emit('activate', tab)"
          @click="$event.detail === 0 && emit('activate', tab)"
          @dblclick="emit('promote', tab)"
        >
          <svg v-if="tab.kind === 'folder'" class="tree-tab__folder-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.75 4.25h4l1.3 1.5h7.2v6.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8Z" />
            <path d="M1.75 5.75v-2h4l1.3 1.5" />
          </svg>
          <span v-else class="tree-tab__item-icon">
            <slot name="itemIcon" :tab="tab" :is-selected="activeTabPath === tab.path">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 1.75h6l4 4v8.5H3z" />
                <path d="M9 1.75v4h4" />
              </svg>
            </slot>
          </span>
          <span class="tree-tab__title">{{ tabTitle(tab) }}</span>
        </button>
        <div class="tree-tab__overlay">
          <slot name="tabOverlay" :tab="tab" :is-active="activeTabPath === tab.path"></slot>
        </div>
        <button v-if="tab.isPinned" type="button" class="tree-tab__icon tree-tab__pin" aria-label="Unpin tab" title="Unpin tab" @click="emit('pin', tab, false)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5 14.5 6.5 12 7l-2.5 2.5.5 3.5-1.5 1.5-3-3-3.5 3.5-.5-.5L5.5 11l-3-3L4 6.5l3.5.5L10 4.5z" /></svg>
        </button>
        <button v-else type="button" class="tree-tab__icon tree-tab__close" aria-label="Close tab" title="Close tab" @click="emit('close', tab)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
        </button>
      </div>
      <button v-if="isAddVisible" type="button" class="tree-tab-add" :class="{ 'is-multiline': isMultiline }" aria-label="New draft" title="New draft" @click="emit('add')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
      </button>
    </nav>
    <div v-if="scrollMetrics.isOverflowing" class="tree-tabs__scrollbar" aria-hidden="true">
      <div class="tree-tabs__scrollbar-thumb" :style="scrollbarThumbStyle" @pointerdown="startScrollbarDrag"></div>
    </div>
  </div>
</template>

<style scoped>
.tree-tabs-shell { position: relative; min-width: 0; height: 100%; flex: 1 1 auto; margin-inline: var(--space-1); overflow: hidden; }
.tree-tabs { width: 100%; min-width: 0; height: 100%; display: flex; align-items: end; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.tree-tabs::-webkit-scrollbar { display: none; }
.tree-tabs__scrollbar { position: absolute; z-index: 4; right: 0; bottom: 1px; left: 0; height: 6px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
.tree-tabs-shell:hover .tree-tabs__scrollbar, .tree-tabs-shell:focus-within .tree-tabs__scrollbar, .tree-tabs-shell.is-dragging-scrollbar .tree-tabs__scrollbar { opacity: 1; pointer-events: auto; }
.tree-tabs__scrollbar-thumb { position: absolute; top: 1px; left: 0; height: 4px; border-radius: var(--radius-large); background: color-mix(in srgb, var(--color-text-muted) 34%, transparent); cursor: ew-resize; touch-action: none; }
.tree-tabs__scrollbar-thumb:hover { background: color-mix(in srgb, var(--color-text-muted) 52%, transparent); }
.tree-tabs.is-multiline { max-height: 96px; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; }
.tree-tabs.is-multiline::-webkit-scrollbar { display: block; }
.tree-tab { isolation: isolate; position: relative; width: auto; min-width: 0; max-width: 280px; height: var(--tree-row-height); display: flex; align-items: center; flex: 0 0 auto; color: var(--color-text-muted); background: transparent; white-space: nowrap; cursor: grab; transition: color 0.15s ease, background 0.15s ease; }
.tree-tab:hover { color: var(--color-text); background: var(--color-surface-hover, color-mix(in srgb, var(--color-surface-raised) 62%, var(--color-surface))); }
.tree-tab.is-active { color: var(--color-text); background: var(--color-surface-selected); }
.tree-tab.is-drop-before::before, .tree-tab.is-drop-after::after { position: absolute; z-index: 5; top: 0; bottom: 0; width: 2px; content: ""; background: var(--color-primary); pointer-events: none; }
.tree-tab.is-drop-before::before { left: 0; }
.tree-tab.is-drop-after::after { right: 0; }
.tree-tab__label { min-width: 0; flex: 0 1 auto; align-self: stretch; display: flex; align-items: center; gap: var(--space-1); padding: 0 var(--space-1) 0 var(--space-2); border: 0; color: inherit; background: transparent; font-size: 12px; cursor: pointer; }
.tree-tab__folder-icon { width: 16px; height: 16px; flex: none; fill: none; color: currentColor; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
.tree-tab__item-icon { min-width: 0; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; margin: 0; color: var(--color-text-muted); }
.tree-tab__item-icon :deep(svg) { width: auto; max-width: 24px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.25; }
.tree-tab.is-active .tree-tab__item-icon { color: var(--color-primary); }
.tree-tab__title { min-width: 0; max-width: 172px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-tab.is-preview .tree-tab__title { font-style: italic; }
.tree-tab__overlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.tree-tab__icon, .tree-tab-add { z-index: 3; border: 0; color: var(--color-text-muted); background: transparent; cursor: pointer; }
.tree-tab__icon { position: relative; width: 20px; height: 24px; display: grid; place-items: center; flex: 0 0 20px; padding: 0; margin-inline-end: var(--space-1); border-radius: var(--radius-small); opacity: 1; }
.tree-tab__icon:hover { color: var(--color-text); }
.tree-tab__pin { color: var(--color-primary); }
.tree-tab__pin svg { fill: none; stroke: currentColor; stroke-linejoin: round; stroke-width: 1.4; }
.tree-tab__close:hover { color: var(--color-danger); }
.tree-tab__icon svg, .tree-tab-add svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.5; }
.tree-tab__pin svg { width: 12px; height: 12px; }
.tree-tab__pin svg { fill: currentColor; }
.tree-tab-add { position: relative; width: var(--tree-row-height); height: var(--tree-row-height); flex: 0 0 var(--tree-row-height); align-self: center; display: grid; place-items: center; padding: 0; margin-inline: var(--space-2) 0; border: 1px solid transparent; border-radius: var(--radius-small); }
.tree-tab-add:first-child { margin-inline-start: 0; }
.tree-tab-add.is-multiline { align-self: flex-start; margin-top: 0; }
.tree-tab-add:hover { color: var(--color-text); border-color: var(--color-border); background: color-mix(in srgb, var(--color-surface-raised) 72%, transparent); }
:is(.tree-tab__label, .tree-tab__icon, .tree-tab-add):focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .tree-tab { transition: none; } }
</style>
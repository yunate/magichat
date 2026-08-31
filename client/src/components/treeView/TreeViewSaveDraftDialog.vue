<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import type { TreeViewFolder, TreeViewItem } from "../../../../common/treeView";

type FolderOption = {
  folder: TreeViewFolder;
  depth: number;
};

const props = defineProps<{
  item: TreeViewItem | null;
  rootFolder: TreeViewFolder | null;
  itemLabel: string;
  isSubmitting: boolean;
  error: string;
}>();

const emit = defineEmits<{
  save: [name: string, folderId: string];
  cancel: [];
}>();

const dialog = useTemplateRef<HTMLElement>("dialog");
const nameInput = useTemplateRef<HTMLInputElement>("nameInput");
const name = ref("");
const folderId = ref("");
let returnFocus: HTMLElement | null = null;

const folderOptions = computed<readonly FolderOption[]>(() => {
  if (props.rootFolder === null) return [];
  const options: FolderOption[] = [];
  const append = (folder: TreeViewFolder, depth: number): void => {
    options.push({ folder, depth });
    for (const child of folder.folders) append(child, depth + 1);
  };
  append(props.rootFolder, 0);
  return options;
});

const selectedFolder = computed(() => folderOptions.value
  .find((option) => option.folder.properties.id === folderId.value)?.folder ?? null);

watch(() => props.item, (item, previous) => {
  if (item !== null) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    name.value = item.name;
    folderId.value = props.rootFolder?.properties.id ?? "";
    void nextTick(() => {
      nameInput.value?.focus();
      nameInput.value?.select();
    });
  } else if (previous !== null) {
    const target = returnFocus;
    returnFocus = null;
    void nextTick(() => target?.isConnected && target.focus());
  }
});

function submit(): void {
  if (props.isSubmitting || folderId.value.length === 0) return;
  emit("save", name.value, folderId.value);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && !props.isSubmitting) {
    event.preventDefault();
    emit("cancel");
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    submit();
    return;
  }
  if (event.key !== "Tab" || dialog.value === null) return;
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div v-if="item !== null" class="draft-dialog-backdrop" @pointerdown.self="emit('cancel')">
    <section
      ref="dialog"
      class="draft-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tree-view-draft-title"
      @keydown="onKeydown"
    >
      <header class="draft-dialog__header">
        <h2 id="tree-view-draft-title">Save {{ itemLabel.toLowerCase() }}</h2>
        <button type="button" aria-label="Close" title="Close" :disabled="isSubmitting" @click="emit('cancel')">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
        </button>
      </header>
      <div class="draft-dialog__body">
        <label for="tree-view-draft-name">{{ itemLabel }} name</label>
        <input
          id="tree-view-draft-name"
          ref="nameInput"
          v-model="name"
          type="text"
          :disabled="isSubmitting"
          :aria-invalid="error.length > 0"
        />
        <div class="draft-dialog__folder-heading">
          <span>Folder</span>
          <span class="draft-dialog__path" :title="selectedFolder?.path">{{ selectedFolder?.path }}</span>
        </div>
        <fieldset class="draft-dialog__folders">
          <legend class="sr-only">Folder</legend>
          <label
            v-for="option in folderOptions"
            :key="option.folder.properties.id"
            class="draft-dialog__folder"
            :class="{ 'is-selected': option.folder.properties.id === folderId }"
            :style="{ paddingInlineStart: `${option.depth * 16 + 8}px` }"
          >
            <input v-model="folderId" type="radio" name="draft-folder" :value="option.folder.properties.id" />
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25h4l1.3 1.5h7.2v6.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8Z" /></svg>
            <span>{{ option.folder.name }}</span>
          </label>
        </fieldset>
        <p v-if="error.length > 0" class="draft-dialog__error" role="alert">{{ error }}</p>
      </div>
      <footer class="draft-dialog__actions">
        <button type="button" :disabled="isSubmitting" @click="emit('cancel')">Cancel</button>
        <button type="button" class="is-primary" :disabled="isSubmitting" @click="submit">
          {{ isSubmitting ? "Saving..." : "Save" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.draft-dialog-backdrop { position: fixed; z-index: 230; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--color-backdrop-strong); }
.draft-dialog { width: min(520px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-surface-raised); box-shadow: var(--shadow-dialog); }
.draft-dialog__header, .draft-dialog__actions { display: flex; align-items: center; padding-inline: var(--space-4); }
.draft-dialog__header { min-height: 48px; justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.draft-dialog__header h2 { margin: 0; font-size: 16px; font-weight: 600; }
.draft-dialog__header button { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-medium); color: var(--color-text-muted); background: transparent; cursor: pointer; }
.draft-dialog__header svg { width: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.5; }
.draft-dialog__body { min-height: 0; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); overflow-y: auto; }
.draft-dialog__body > label, .draft-dialog__folder-heading { font-size: 12px; font-weight: 600; }
#tree-view-draft-name { width: 100%; height: 36px; padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: var(--color-bg); }
.draft-dialog__folder-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-2); }
.draft-dialog__path { min-width: 0; overflow: hidden; color: var(--color-text-muted); font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.draft-dialog__folders { max-height: 208px; margin: 0; padding: 0; overflow-y: auto; border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent); border-radius: var(--radius-medium); background: color-mix(in srgb, var(--color-bg) 76%, var(--color-surface)); }
.draft-dialog__folder { width: 100%; height: 32px; display: flex; align-items: center; gap: var(--space-2); padding-inline-end: var(--space-2); color: var(--color-text-muted); cursor: pointer; }
.draft-dialog__folder:hover { color: var(--color-text); background: color-mix(in srgb, var(--color-text) 6%, transparent); }
.draft-dialog__folder.is-selected { color: var(--color-text); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); box-shadow: inset 2px 0 var(--color-primary); }
.draft-dialog__folder input { appearance: none; width: 14px; height: 14px; flex: none; margin: 0; border: 1px solid color-mix(in srgb, var(--color-text-muted) 48%, transparent); border-radius: 50%; background: var(--color-bg); }
.draft-dialog__folder input:checked { border-color: var(--color-primary); background: var(--color-primary); box-shadow: inset 0 0 0 3px var(--color-bg); }
.draft-dialog__folder svg { width: 16px; flex: none; fill: none; stroke: var(--color-warning); stroke-width: 1.25; }
.draft-dialog__folder span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.draft-dialog__error { margin: 0; color: var(--color-danger); font-size: 12px; }
.draft-dialog__actions { min-height: 52px; justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); }
.draft-dialog__actions button { min-width: 72px; height: 32px; padding-inline: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-medium); color: var(--color-text); background: transparent; cursor: pointer; }
.draft-dialog__actions button.is-primary { border-color: var(--color-primary); color: var(--color-bg); background: var(--color-primary); font-weight: 600; }
:is(button, input):focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
button:disabled, input:disabled { opacity: 0.5; cursor: not-allowed; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
<script setup lang="ts">
import {
  Bold,
  Braces,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minus,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from "@lucide/vue";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import SplitContainer from "../../../../../../components/SplitContainer.vue";
import { gMessageStore } from "../../../../../../messages/messageStore";
import MonacoMarkdownEditor from "./MonacoMarkdownEditor.vue";

type SelectionTransform = Readonly<{
  before: string;
  after: string;
  placeholder: string;
}>;

type ScrollPoint = Readonly<{
  sourceLine: number;
  scrollTop: number;
}>;

const DEFAULT_MARKDOWN = [
  "# Markdown Preview",
  "",
  "Enter **Markdown** on the left to render a live preview on the right.",
  "",
  "## Supported Syntax",
  "",
  "- **Bold** and *italic*",
  "- `Inline code`",
  "- [Links](https://markdownviewer.org/)",
  "- Ordered and unordered lists",
  "",
  "1. First item",
  "2. Second item",
  "",
  "> Blockquotes work well in the split preview.",
  "",
  "~~~ts",
  "function greet(name: string): string {",
  "  return `Hello, ${name}!`;",
  "}",
  "~~~",
  "",
  "| Column A | Column B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
].join("\n");

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
const source = ref(DEFAULT_MARKDOWN);
const isEditorHidden = ref(false);
const isPreviewHidden = ref(false);
const isFullscreen = ref(false);
const isScrollSynced = ref(true);
const toolRoot = useTemplateRef<HTMLElement>("toolRoot");
const editor = useTemplateRef<InstanceType<typeof MonacoMarkdownEditor>>("editor");
const preview = useTemplateRef<HTMLElement>("preview");
const renderedHtml = ref(renderMarkdown(DEFAULT_MARKDOWN));
let previewRenderTimer: number | null = null;
let isSynchronizingScroll = false;

watch([source, isPreviewHidden], ([value, isHidden]) => {
  if (previewRenderTimer !== null) window.clearTimeout(previewRenderTimer);
  previewRenderTimer = null;
  if (isHidden) return;
  previewRenderTimer = window.setTimeout(() => {
    renderedHtml.value = renderMarkdown(value);
    previewRenderTimer = null;
  }, 80);
});

function renderMarkdown(value: string): string {
  const environment = {};
  const tokens = markdown.parse(value, environment);
  for (const token of tokens) {
    if (!token.block || token.nesting < 0 || token.map === null) continue;
    token.attrSet("data-source-line", String(token.map[0] + 1));
  }
  const html = markdown.renderer.render(tokens, markdown.options, environment).replace(
    /<li>\[([ xX])\]\s+/g,
    (_match, state: string) => `<li class="task-list-item"><input type="checkbox" disabled${state.toLowerCase() === "x" ? " checked" : ""}> `,
  );
  return DOMPurify.sanitize(html);
}

onMounted(() => document.addEventListener("fullscreenchange", onFullscreenChange));
onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  if (previewRenderTimer !== null) window.clearTimeout(previewRenderTimer);
});

function undo(): void {
  editor.value?.undo();
}

function redo(): void {
  editor.value?.redo();
}

function transformSelection(transform: SelectionTransform): void {
  editor.value?.transformSelection(transform);
}

function prefixSelectedLines(prefix: string, ordered = false): void {
  editor.value?.prefixSelectedLines(prefix, ordered);
}

function setHeading(level: 1 | 2 | 3): void {
  editor.value?.setHeading(level);
}

function insertBlock(value: string): void {
  editor.value?.insertBlock(value);
}

function clearFormatting(): void {
  editor.value?.clearFormatting();
}

function toggleEditor(): void {
  if (isEditorHidden.value) {
    isEditorHidden.value = false;
  } else {
    isPreviewHidden.value = false;
    isEditorHidden.value = true;
  }
}

function togglePreview(): void {
  if (isPreviewHidden.value) {
    isPreviewHidden.value = false;
  } else {
    isEditorHidden.value = false;
    isPreviewHidden.value = true;
  }
}

function onFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === toolRoot.value;
}

async function toggleFullscreen(): Promise<void> {
  const root = toolRoot.value;
  if (root === null) return;
  try {
    if (document.fullscreenElement === root) {
      await document.exitFullscreen();
    } else {
      await root.requestFullscreen();
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Markdown full screen change failed: ${detail}`);
    gMessageStore.pushMessage("error", "Markdown full screen mode could not be changed.");
  }
}

function onEditorScroll(sourceLine: number): void {
  if (!isScrollSynced.value || isSynchronizingScroll) return;
  const target = preview.value;
  if (target === null) return;
  isSynchronizingScroll = true;
  target.scrollTop = interpolateScrollTop(createPreviewScrollPoints(target), sourceLine);
  requestAnimationFrame(() => { isSynchronizingScroll = false; });
}

function onPreviewScroll(): void {
  if (!isScrollSynced.value || isSynchronizingScroll) return;
  const sourceElement = preview.value;
  if (sourceElement === null) return;
  isSynchronizingScroll = true;
  editor.value?.setTopSourceLine(interpolateSourceLine(
    createPreviewScrollPoints(sourceElement),
    sourceElement.scrollTop,
  ));
  requestAnimationFrame(() => { isSynchronizingScroll = false; });
}

function createPreviewScrollPoints(target: HTMLElement): readonly ScrollPoint[] {
  const targetBounds = target.getBoundingClientRect();
  const maximumScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
  const points: ScrollPoint[] = [{ sourceLine: 1, scrollTop: 0 }];
  let previousLine = 1;
  let previousTop = 0;
  for (const element of target.querySelectorAll<HTMLElement>("[data-source-line]")) {
    const sourceLine = Number(element.dataset.sourceLine);
    const elementTop = element.getBoundingClientRect().top - targetBounds.top + target.scrollTop;
    const scrollTop = Math.max(0, Math.min(maximumScrollTop, elementTop));
    if (!Number.isFinite(sourceLine) || sourceLine <= previousLine || scrollTop < previousTop) continue;
    points.push({ sourceLine, scrollTop });
    previousLine = sourceLine;
    previousTop = scrollTop;
  }
  const endLine = source.value.split("\n").length + 1;
  if (endLine > previousLine) points.push({ sourceLine: endLine, scrollTop: maximumScrollTop });
  return points;
}

function interpolateScrollTop(points: readonly ScrollPoint[], sourceLine: number): number {
  const [before, after] = surroundingPoints(points, sourceLine, (point) => point.sourceLine);
  return interpolate(sourceLine, before.sourceLine, after.sourceLine, before.scrollTop, after.scrollTop);
}

function interpolateSourceLine(points: readonly ScrollPoint[], scrollTop: number): number {
  const [before, after] = surroundingPoints(points, scrollTop, (point) => point.scrollTop);
  return interpolate(scrollTop, before.scrollTop, after.scrollTop, before.sourceLine, after.sourceLine);
}

function surroundingPoints(
  points: readonly ScrollPoint[],
  value: number,
  getValue: (point: ScrollPoint) => number,
): readonly [ScrollPoint, ScrollPoint] {
  const first = points[0] ?? { sourceLine: 1, scrollTop: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined && getValue(point) > value) return [points[index - 1] ?? first, point];
  }
  const last = points[points.length - 1] ?? first;
  return [last, last];
}

function interpolate(value: number, from: number, to: number, outputFrom: number, outputTo: number): number {
  if (to <= from) return outputFrom;
  const progress = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return outputFrom + progress * (outputTo - outputFrom);
}

async function copyText(value: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    gMessageStore.pushMessage("success", message);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Markdown copy failed: ${detail}`);
    gMessageStore.pushMessage("error", "Markdown could not be copied.");
  }
}

</script>

<template>
  <section ref="toolRoot" class="markdown-tool">
    <div class="markdown-tool__toolbar" role="toolbar" aria-label="Markdown workspace">
      <button
        type="button"
        class="markdown-tool__pane-toggle"
        :aria-label="isEditorHidden ? 'Show editor' : 'Hide editor'"
        :title="isEditorHidden ? 'Show editor' : 'Hide editor'"
        @click="toggleEditor"
      >
        <PanelLeftOpen v-if="isEditorHidden" aria-hidden="true" />
        <PanelLeftClose v-else aria-hidden="true" />
      </button>
      <div
        class="markdown-tool__formatbar"
        :class="{ 'is-disabled': isEditorHidden }"
        :inert="isEditorHidden"
        :aria-disabled="isEditorHidden"
        aria-label="Markdown formatting"
      >
        <div class="markdown-tool__tool-group">
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" @click="undo">
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl+Y or Ctrl+Shift+Z)" @click="redo">
            <Redo2 aria-hidden="true" />
          </button>
          <button type="button" aria-label="Clear formatting" title="Clear formatting" @click="clearFormatting">
            <Eraser aria-hidden="true" />
          </button>
        </div>
        <div class="markdown-tool__tool-group">
          <button type="button" aria-label="Bold" title="Bold" @click="transformSelection({ before: '**', after: '**', placeholder: 'bold text' })"><Bold aria-hidden="true" /></button>
          <button type="button" aria-label="Italic" title="Italic" @click="transformSelection({ before: '*', after: '*', placeholder: 'italic text' })"><Italic aria-hidden="true" /></button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough" @click="transformSelection({ before: '~~', after: '~~', placeholder: 'struck text' })"><Strikethrough aria-hidden="true" /></button>
          <button type="button" aria-label="Inline code" title="Inline code" @click="transformSelection({ before: '`', after: '`', placeholder: 'code' })"><Code2 aria-hidden="true" /></button>
        </div>
        <div class="markdown-tool__tool-group">
          <button type="button" aria-label="Heading 1" title="Heading 1" @click="setHeading(1)"><Heading1 aria-hidden="true" /></button>
          <button type="button" aria-label="Heading 2" title="Heading 2" @click="setHeading(2)"><Heading2 aria-hidden="true" /></button>
          <button type="button" aria-label="Heading 3" title="Heading 3" @click="setHeading(3)"><Heading3 aria-hidden="true" /></button>
        </div>
        <div class="markdown-tool__tool-group">
          <button type="button" aria-label="Bulleted list" title="Bulleted list" @click="prefixSelectedLines('- ')"><List aria-hidden="true" /></button>
          <button type="button" aria-label="Numbered list" title="Numbered list" @click="prefixSelectedLines('', true)"><ListOrdered aria-hidden="true" /></button>
          <button type="button" aria-label="Task item" title="Task item" @click="prefixSelectedLines('- [ ] ')"><ListChecks aria-hidden="true" /></button>
          <button type="button" aria-label="Blockquote" title="Blockquote" @click="prefixSelectedLines('> ')"><Quote aria-hidden="true" /></button>
        </div>
        <div class="markdown-tool__tool-group">
          <button type="button" aria-label="Link" title="Link" @click="transformSelection({ before: '[', after: '](https://)', placeholder: 'link text' })"><Link aria-hidden="true" /></button>
          <button type="button" aria-label="Image" title="Image" @click="transformSelection({ before: '![', after: '](https://)', placeholder: 'alt text' })"><ImageIcon aria-hidden="true" /></button>
          <button type="button" aria-label="Code block" title="Code block" @click="insertBlock('~~~\ncode\n~~~')"><Braces aria-hidden="true" /></button>
          <button type="button" aria-label="Horizontal rule" title="Horizontal rule" @click="insertBlock('---')"><Minus aria-hidden="true" /></button>
          <button type="button" aria-label="Table" title="Table" @click="insertBlock('| Column A | Column B |\n| --- | --- |\n| 1 | 2 |')"><Table2 aria-hidden="true" /></button>
        </div>
      </div>
      <div class="markdown-tool__preview-actions">
        <button
          type="button"
          class="markdown-tool__scroll-sync"
          :class="{ 'is-active': isScrollSynced }"
          :disabled="isPreviewHidden"
          :aria-pressed="isScrollSynced"
          title="Synchronize scrolling"
          @click="isScrollSynced = !isScrollSynced"
        >Sync scroll</button>
        <button
          type="button"
          :disabled="isPreviewHidden"
          title="Copy rendered HTML"
          @click="copyText(renderedHtml, 'Rendered HTML copied.')"
        >Copy HTML</button>
        <button
          type="button"
          class="markdown-tool__pane-toggle"
          :aria-label="isFullscreen ? 'Exit full screen' : 'Enter full screen'"
          :title="isFullscreen ? 'Exit full screen' : 'Full screen'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" aria-hidden="true" />
          <Maximize2 v-else aria-hidden="true" />
        </button>
        <button
          type="button"
          class="markdown-tool__pane-toggle"
          :aria-label="isPreviewHidden ? 'Show preview' : 'Hide preview'"
          :title="isPreviewHidden ? 'Show preview' : 'Hide preview'"
          @click="togglePreview"
        >
          <PanelRightOpen v-if="isPreviewHidden" aria-hidden="true" />
          <PanelRightClose v-else aria-hidden="true" />
        </button>
      </div>
    </div>

    <SplitContainer
      class="markdown-tool__workspace"
      orientation="vertical"
      :separator-labels="['Resize Markdown editor and preview']"
      :separator-visible="[!isEditorHidden && !isPreviewHidden]"
      :is-disabled="isEditorHidden || isPreviewHidden"
      :has-item-borders="false"
    >
      <section
        class="markdown-tool__pane"
        :class="{ 'is-hidden': isEditorHidden, 'is-expanded': isPreviewHidden }"
      >
        <MonacoMarkdownEditor
          ref="editor"
          :value="source"
          @update="source = $event"
          @scroll="onEditorScroll"
        />
      </section>

      <section
        class="markdown-tool__pane"
        :class="{ 'is-hidden': isPreviewHidden, 'is-expanded': isEditorHidden }"
      >
        <article
          ref="preview"
          class="markdown-tool__preview markdown-body"
          aria-label="Markdown preview"
          @scroll="onPreviewScroll"
          v-html="renderedHtml"
        ></article>
      </section>
    </SplitContainer>
  </section>
</template>

<style scoped>
.markdown-tool { width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-6); }
.markdown-tool:fullscreen { width: 100vw; height: 100vh; margin: 0; background: var(--color-default-bg); }
.markdown-tool::backdrop { background: var(--color-default-bg); }
.markdown-tool button { min-height: 28px; padding-inline: var(--space-2); border: 1px solid transparent; border-radius: var(--radius-small); color: var(--color-text-muted); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.markdown-tool button:hover:not(:disabled), .markdown-tool button.is-active { border-color: var(--color-border); color: var(--color-text); background: var(--color-surface-raised); }
.markdown-tool button:focus-visible { box-shadow: inset 0 0 0 1px var(--color-primary); }
.markdown-tool button:disabled { opacity: 0.4; cursor: not-allowed; }
.markdown-tool__toolbar { height: 34px; flex: 0 0 34px; display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.markdown-tool__formatbar { min-width: 0; display: flex; align-items: center; gap: var(--space-2); height: 100%; overflow: hidden; font-weight: 400; text-transform: none; }
.markdown-tool__formatbar.is-disabled { opacity: 0.4; pointer-events: none; }
.markdown-tool__tool-group { display: flex; align-items: center; gap: var(--space-1); padding-inline-end: var(--space-1); border-inline-end: 1px solid var(--color-divider); }
.markdown-tool__tool-group:last-child { border-inline-end: 0; }
.markdown-tool__toolbar .markdown-tool__tool-group button { width: 24px; min-width: 24px; height: 24px; min-height: 24px; display: grid; place-items: center; padding: 0; line-height: 1; }
.markdown-tool__toolbar .markdown-tool__tool-group svg { width: 14px; height: 14px; display: block; }
.markdown-tool__preview-actions { min-width: max-content; margin-inline-start: auto; display: flex; align-items: center; gap: var(--space-1); }
.markdown-tool__workspace { flex: 1; min-height: 0; overflow: hidden; }
.markdown-tool__pane { min-width: 240px; min-height: 0; flex: 1 1 0; display: flex; flex-direction: column; overflow: hidden; container-type: inline-size; border: 1px solid var(--color-border); border-radius: var(--radius-small); background: var(--color-surface); }
.markdown-tool__pane.is-hidden { display: none; }
.markdown-tool__pane.is-expanded { flex: 1 1 0 !important; }
.markdown-tool__scroll-sync { text-transform: none; }
.markdown-tool .markdown-tool__pane-toggle { width: 28px; min-width: 28px; height: 28px; min-height: 28px; flex: none; display: grid; place-items: center; padding: 0; border-color: transparent; background: transparent; }
.markdown-tool .markdown-tool__pane-toggle:hover:not(:disabled) { border-color: transparent; }
.markdown-tool__pane-toggle svg { width: 15px; height: 15px; }
.markdown-tool__preview { flex: 1; min-height: 0; width: 100%; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
.markdown-tool__preview:focus-visible { box-shadow: inset 0 0 0 1px var(--color-primary); }
.markdown-tool__preview { padding: var(--space-4) var(--space-6); line-height: 1.7; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) { margin: 1.2em 0 0.5em; line-height: 1.3; }
.markdown-body :deep(h1) { padding-bottom: 0.3em; border-bottom: 1px solid var(--color-border); font-size: 1.8em; }
.markdown-body :deep(h2) { padding-bottom: 0.3em; border-bottom: 1px solid var(--color-border); font-size: 1.4em; }
.markdown-body :deep(p) { margin: 0.6em 0; }
.markdown-body :deep(a) { color: var(--color-primary); text-decoration: none; }
.markdown-body :deep(a:hover) { text-decoration: underline; }
.markdown-body :deep(code) { padding: 0.15em 0.4em; border-radius: var(--radius-small); background: var(--color-surface-raised); font-family: var(--font-family); font-size: 0.9em; }
.markdown-body :deep(pre) { margin: 0.8em 0; padding: var(--space-3) var(--space-4); overflow: auto; border-radius: var(--radius-medium); background: var(--color-surface-raised); }
.markdown-body :deep(pre code) { padding: 0; background: transparent; }
.markdown-body :deep(blockquote) { margin: 0.8em 0; padding: 0.2em var(--space-4); border-left: 3px solid var(--color-primary); color: var(--color-text-muted); }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0.6em 0; padding-left: 1.5em; }
.markdown-body :deep(li) { margin: 0.2em 0; }
.markdown-body :deep(.task-list-item) { list-style: none; }
.markdown-body :deep(.task-list-item input) { margin: 0 var(--space-2) 0 -1.5em; accent-color: var(--color-primary); }
.markdown-body :deep(table) { margin: 0.8em 0; border-collapse: collapse; }
.markdown-body :deep(th), .markdown-body :deep(td) { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); }
.markdown-body :deep(th) { background: var(--color-surface-raised); }
.markdown-body :deep(hr) { margin: 1.2em 0; border: 0; border-top: 1px solid var(--color-border); }
.markdown-body :deep(img) { max-width: 100%; }
@media (max-width: 900px) { .markdown-tool { padding: var(--space-4); } }
</style>

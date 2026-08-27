<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";

const DEFAULT_MARKDOWN = `# Markdown 解析工具

在左侧输入 **Markdown**，右侧即时渲染预览。

## 支持的语法

- **加粗** 与 *斜体*
- \`行内代码\`
- [链接](https://www.markdownonline.net/zh/)
- 有序与无序列表

1. 第一项
2. 第二项

> 引用块：所见即所得的分栏编辑。

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

| 列 A | 列 B |
| ---- | ---- |
| 1    | 2    |
`;

// html:false keeps raw HTML out of the render path; DOMPurify still sanitizes the generated markup as defense in depth.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });

const source = ref(DEFAULT_MARKDOWN);

const renderedHtml = computed(() => DOMPurify.sanitize(md.render(source.value)));
</script>

<template>
  <ToolSplitLayout
    title="Markdown"
    hint="左侧输入 Markdown，右侧实时预览。"
    left-label="输入"
    right-label="预览"
  >
    <template #left>
      <textarea
        v-model="source"
        v-select-all
        class="markdown-tool__input"
        spellcheck="false"
        aria-label="Markdown 输入"
        placeholder="在此输入 Markdown…"
      ></textarea>
    </template>
    <template #right>
      <div
        v-select-all
        class="markdown-tool__preview markdown-body"
        aria-label="Markdown 预览"
        v-html="renderedHtml"
      ></div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.markdown-tool__input {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: var(--space-4);
  background: transparent;
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.markdown-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.markdown-tool__preview {
  flex: 1;
  min-height: 0;
  padding: var(--space-4) var(--space-6);
  overflow: auto;
  line-height: 1.7;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.markdown-tool__preview:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
</style>

<style scoped>
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 1.2em 0 0.5em;
  line-height: 1.3;
}

.markdown-body :deep(h1) {
  font-size: 1.8em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-border);
}

.markdown-body :deep(h2) {
  font-size: 1.4em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-border);
}

.markdown-body :deep(p) {
  margin: 0.6em 0;
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 0.15em 0.4em;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  font-family: "Cascadia Code", "Consolas", monospace;
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin: 0.8em 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: 0.8em 0;
  padding: 0.2em var(--space-4);
  border-left: 3px solid var(--color-primary);
  color: var(--color-text-muted);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.6em 0;
}

.markdown-body :deep(li) {
  margin: 0.2em 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.8em 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
}

.markdown-body :deep(th) {
  background: var(--color-surface-raised);
}

.markdown-body :deep(hr) {
  margin: 1.2em 0;
  border: none;
  border-top: 1px solid var(--color-border);
}

.markdown-body :deep(img) {
  max-width: 100%;
}
</style>

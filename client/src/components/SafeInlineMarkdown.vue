<script setup lang="ts">
import { computed } from "vue";
import { renderSafeInlineMarkdown } from "./safeInlineMarkdown";

const props = defineProps<{ source: string }>();
const emit = defineEmits<{ openLink: [url: string] }>();
const renderedHtml = computed(() => renderSafeInlineMarkdown(props.source));

function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const url = anchor.getAttribute("href");
  if (url === null) return;
  event.preventDefault();
  event.stopPropagation();
  emit("openLink", url);
}

function onDoubleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || target.closest("a") === null) return;
  event.preventDefault();
  event.stopPropagation();
}
</script>

<template>
  <span
    class="safe-inline-markdown"
    @click="onClick"
    @dblclick="onDoubleClick"
    v-html="renderedHtml"
  ></span>
</template>

<style scoped>
.safe-inline-markdown :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.safe-inline-markdown :deep(code) {
  padding-inline: 0.25em;
  border-radius: var(--radius-small);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-family);
}
</style>
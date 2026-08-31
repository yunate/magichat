<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";
import type { TextSearchOptions } from "./textSearch";

type Props = {
  resultIndex: number;
  resultCount: number;
  isPatternValid: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  search: [query: string, options: TextSearchOptions];
  next: [];
  previous: [];
  close: [];
}>();

const input = useTemplateRef<HTMLInputElement>("input");
const query = ref("");
const isCaseSensitive = ref(false);
const isWholeWord = ref(false);
const isRegularExpression = ref(false);

function focus(): void {
  emitSearch();
  void nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}

function onInput(event: Event): void {
  const element = event.currentTarget;
  if (!(element instanceof HTMLInputElement)) return;
  query.value = element.value;
  emitSearch();
}

function toggleCaseSensitive(): void {
  isCaseSensitive.value = !isCaseSensitive.value;
  emitSearch();
}

function toggleWholeWord(): void {
  isWholeWord.value = !isWholeWord.value;
  emitSearch();
}

function toggleRegularExpression(): void {
  isRegularExpression.value = !isRegularExpression.value;
  emitSearch();
}

function emitSearch(): void {
  emit("search", query.value, {
    isCaseSensitive: isCaseSensitive.value,
    isWholeWord: isWholeWord.value,
    isRegularExpression: isRegularExpression.value,
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    input.value?.select();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (event.shiftKey) emit("previous");
  else emit("next");
}

defineExpose({ focus });
</script>

<template>
  <form class="find-bar" role="search" @submit.prevent="emit('next')" @keydown="onKeydown">
    <input
      ref="input"
      :value="query"
      class="find-bar__input"
      type="search"
      aria-label="Find"
      :aria-invalid="!props.isPatternValid"
      placeholder="Find"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
    />
    <div class="find-bar__controls">
      <div class="find-bar__options" aria-label="Search options">
        <button
          type="button"
          class="find-bar__button find-bar__option"
          :class="{ 'is-active': isCaseSensitive }"
          :aria-pressed="isCaseSensitive"
          aria-label="Match case"
          title="Match case"
          @click="toggleCaseSensitive"
        >Aa</button>
        <button
          type="button"
          class="find-bar__button find-bar__option find-bar__option--whole-word"
          :class="{ 'is-active': isWholeWord }"
          :aria-pressed="isWholeWord"
          aria-label="Match whole word"
          title="Match whole word"
          @click="toggleWholeWord"
        >ab</button>
        <button
          type="button"
          class="find-bar__button find-bar__option"
          :class="{ 'is-active': isRegularExpression }"
          :aria-pressed="isRegularExpression"
          aria-label="Use regular expression"
          title="Use regular expression"
          @click="toggleRegularExpression"
        >.*</button>
      </div>
      <output class="find-bar__count" aria-live="polite">
        {{ props.resultIndex }}/{{ props.resultCount }}
      </output>
      <button
        type="button"
        class="find-bar__button find-bar__button--previous"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        :disabled="props.resultCount === 0"
        @click="emit('previous')"
      ></button>
      <button
        type="submit"
        class="find-bar__button find-bar__button--next"
        aria-label="Next match"
        title="Next match (Enter)"
        :disabled="props.resultCount === 0"
      ></button>
      <button
        type="button"
        class="find-bar__button find-bar__button--close"
        aria-label="Close search"
        title="Close search (Escape)"
        @click="emit('close')"
      ></button>
    </div>
  </form>
</template>

<style scoped>
.find-bar {
  height: 36px;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  box-shadow: var(--shadow-flyout);
}

.find-bar__input {
  min-width: 0;
  height: 28px;
  flex: 1;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  font: inherit;
}

.find-bar__input:focus-visible {
  border-color: var(--color-primary);
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}

.find-bar__input[aria-invalid="true"] {
  border-color: var(--color-danger);
  outline-color: var(--color-danger);
}

.find-bar__input::-webkit-search-cancel-button {
  display: none;
}

.find-bar__options {
  height: 26px;
  display: flex;
  align-items: center;
}

.find-bar__controls {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 0;
}

.find-bar__count {
  width: 36px;
  flex: 0 0 36px;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
}

.find-bar__button {
  position: relative;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-small);
  cursor: pointer;
}

.find-bar__button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-selected);
}

.find-bar__button:active:not(:disabled) {
  color: var(--color-primary);
}

.find-bar__button.is-active {
  color: var(--color-text);
  background: var(--color-surface-selected);
}

.find-bar__button:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}

.find-bar__button:disabled {
  opacity: 0.4;
  cursor: default;
}

.find-bar__option {
  font-size: 12px;
  line-height: 26px;
}

.find-bar__option--whole-word {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.find-bar__button--previous::before,
.find-bar__button--next::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  content: "";
  border-inline: 4px solid transparent;
  transform: translate(-50%, -50%);
}

.find-bar__button--previous::before {
  border-block-end: 5px solid currentColor;
}

.find-bar__button--next::before {
  border-block-start: 5px solid currentColor;
}

.find-bar__button--close::before,
.find-bar__button--close::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1.5px;
  height: 12px;
  content: "";
  background: currentColor;
}

.find-bar__button--close::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.find-bar__button--close::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}
</style>

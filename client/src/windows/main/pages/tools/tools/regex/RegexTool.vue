<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { runRegex } from "./regex";

const pattern = ref("(\\w+)@(\\w+\\.\\w+)");
const flags = ref("g");
const text = ref("Contact alice@example.com or bob@test.org for more information.");

const result = computed(() => runRegex(pattern.value, flags.value, text.value));
</script>

<template>
  <ToolSplitLayout
    title="Regex Tester"
    hint="Enter a regular expression, flags such as gimsuy, and test text to inspect matches and capture groups."
    left-label="Expression & Text"
    right-label="Matches"
  >
    <template #left>
      <div class="regex-tool__form">
        <div class="regex-tool__fields">
          <label class="regex-tool__field regex-tool__field--pattern">
            <span>Expression</span>
            <input
              v-model="pattern"
              v-select-all
              class="regex-tool__input"
              spellcheck="false"
              aria-label="Regular expression"
              placeholder="Regular expression..."
            />
          </label>
          <label class="regex-tool__field regex-tool__field--flags">
            <span>flags</span>
            <input
              v-model="flags"
              class="regex-tool__input"
              spellcheck="false"
              aria-label="flags"
              placeholder="gimsuy"
            />
          </label>
        </div>
        <textarea
          v-model="text"
          v-select-all
          class="regex-tool__text"
          spellcheck="false"
          aria-label="Test text"
          placeholder="Enter test text..."
        ></textarea>
      </div>
    </template>
    <template #right>
      <div class="regex-tool__result">
        <p v-if="!result.ok" class="regex-tool__error">{{ result.error }}</p>
        <template v-else>
          <p class="regex-tool__summary" :class="{ 'regex-tool__summary--hit': result.matched }">
            {{ result.matched ? `${result.matches.length} matches` : "No matches" }}
          </p>
          <ul v-if="result.matches.length > 0" class="regex-tool__matches">
            <li v-for="(item, matchIndex) in result.matches" :key="matchIndex" class="regex-tool__match">
              <div class="regex-tool__match-head">
                <span class="regex-tool__badge">#{{ matchIndex + 1 }}</span>
                <span class="regex-tool__pos">Position {{ item.index }}</span>
              </div>
              <span v-select-all tabindex="0" class="regex-tool__match-text">{{ item.match }}</span>
              <ul v-if="item.groups.length > 0" class="regex-tool__groups">
                <li v-for="(group, groupIndex) in item.groups" :key="groupIndex">
                  <span class="regex-tool__group-label">Group {{ groupIndex + 1 }}</span>
                  <span class="regex-tool__group-value">{{ group || "—" }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.regex-tool__form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
}

.regex-tool__fields {
  display: flex;
  gap: var(--space-2);
}

.regex-tool__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.regex-tool__field--pattern {
  flex: 1;
}

.regex-tool__field--flags {
  width: 100px;
}

.regex-tool__input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
}

.regex-tool__input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 0;
}

.regex-tool__text {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  outline: none;
  padding: var(--space-3);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.6;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.regex-tool__text:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.regex-tool__result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.regex-tool__summary {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
}

.regex-tool__summary--hit {
  color: var(--color-success);
}

.regex-tool__matches {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.regex-tool__match {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
}

.regex-tool__match-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.regex-tool__badge {
  padding: 0 var(--space-2);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
}

.regex-tool__pos {
  color: var(--color-text-muted);
  font-size: 11px;
}

.regex-tool__match-text {
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  word-break: break-all;
}

.regex-tool__match-text:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.regex-tool__groups {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.regex-tool__groups li {
  display: flex;
  gap: var(--space-2);
}

.regex-tool__group-label {
  flex: none;
  min-width: 48px;
  color: var(--color-text-muted);
}

.regex-tool__group-value {
  color: var(--color-text);
  font-family: var(--font-family);
  word-break: break-all;
}

.regex-tool__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { ref, watch } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { calculateShaDigest, HASH_ALGORITHMS, type HashAlgorithm } from "./hash";

const DEFAULT_TEXT = "Hello, MagicHat! 👋";

const input = ref(DEFAULT_TEXT);
const algorithm = ref<HashAlgorithm>("SHA-256");
const digest = ref("");
const error = ref("");
const copied = ref(false);

// crypto.subtle.digest is async, so a slower earlier call could overwrite a later result;
// a monotonic token drops any reply that is no longer the latest request.
let latestToken = 0;

watch(
  [input, algorithm],
  async ([text, algo]) => {
    const token = (latestToken += 1);
    if (text === "") {
      digest.value = "";
      error.value = "";
      return;
    }
    try {
      const result = await calculateShaDigest(text, algo);
      if (token !== latestToken) return;
      digest.value = result;
      error.value = "";
    } catch {
      if (token !== latestToken) return;
      digest.value = "";
      error.value = "Failed to calculate hash";
    }
  },
  { immediate: true },
);

function setAlgorithm(algo: HashAlgorithm): void {
  algorithm.value = algo;
  copied.value = false;
}

async function copyResult(): Promise<void> {
  if (digest.value === "") return;
  try {
    await navigator.clipboard.writeText(digest.value);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <ToolSplitLayout
    title="Hash"
    hint="Calculate SHA-1, SHA-256, or SHA-512 with Web Crypto. Text is encoded as UTF-8 before hashing."
    left-label="Input Text"
    :right-label="algorithm"
  >
    <template #toolbar>
      <div class="hash-tool__algos" role="group" aria-label="Algorithm">
        <button
          v-for="algo in HASH_ALGORITHMS"
          :key="algo"
          type="button"
          class="hash-tool__algo"
          :class="{ 'hash-tool__algo--active': algorithm === algo }"
          @click="setAlgorithm(algo)"
        >
          {{ algo }}
        </button>
      </div>
    </template>
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="hash-tool__area"
        spellcheck="false"
        aria-label="Input text"
        placeholder="Enter text to hash..."
      ></textarea>
    </template>
    <template #rightActions>
      <button type="button" class="hash-tool__copy" :disabled="digest === ''" @click="copyResult">
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </template>
    <template #right>
      <div class="hash-tool__result">
        <p v-if="error !== ''" class="hash-tool__error">{{ error }}</p>
        <p v-else-if="digest === ''" class="hash-tool__empty">Waiting for input...</p>
        <pre v-else v-select-all tabindex="0" class="hash-tool__digest" aria-label="Digest">{{ digest }}</pre>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.hash-tool__algos {
  display: inline-flex;
  gap: var(--space-1);
}

.hash-tool__algo {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-large);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.hash-tool__algo:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.hash-tool__algo--active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-surface);
}

.hash-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.hash-tool__copy:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.hash-tool__copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hash-tool__area {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: var(--space-4);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.6;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.hash-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.hash-tool__result {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.hash-tool__digest {
  margin: 0;
  padding: var(--space-4);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.hash-tool__digest:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.hash-tool__error {
  margin: 0;
  padding: var(--space-4);
  color: var(--color-danger);
  font-size: 14px;
}

.hash-tool__empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

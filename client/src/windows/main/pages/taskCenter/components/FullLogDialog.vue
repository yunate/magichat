<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { vSelectAll } from "../../../../../directives/vSelectAll";
import { gMainApplication } from "../../../main";

const props = defineProps<{
  taskId: string;
  taskTitle: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const tasksServerRpcObject = gMainApplication.window.getTasksServerRpcObject();

const lines = ref<string[]>([]);
const isLoading = ref(true);
const error = ref("");

// Dialog container is always rendered (unlike the v-else <pre>), so it can hold initial focus even
// while the log is still loading.
const dialogRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function onClose(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") onClose();
}

// Reads log.txt fresh every open, so a running task's dialog shows the latest full log.
async function loadLogs(): Promise<void> {
  isLoading.value = true;
  error.value = "";
  try {
    lines.value = await (await tasksServerRpcObject).getTaskFullLogs(props.taskId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load full logs";
    console.error("[taskCenter] failed to load full logs", err);
  } finally {
    isLoading.value = false;
  }
}

function removeKeydownListener(): void {
  window.removeEventListener("keydown", onKeydown);
}

onMounted(() => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.addEventListener("keydown", onKeydown);
  void loadLogs();
  void nextTick(() => dialogRef.value?.focus());
});

onUnmounted(() => {
  removeKeydownListener();
  // Return focus to the trigger (if it's still in the document) so keyboard users aren't stranded.
  if (previouslyFocused !== null && document.contains(previouslyFocused)) previouslyFocused.focus();
});
</script>

<template>
  <div class="full-log-overlay" @click.self="onClose">
    <section
      ref="dialogRef"
      class="full-log"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-log-title"
      tabindex="-1"
    >
      <header class="full-log__header">
        <h2 id="full-log-title" class="full-log__title">Full log — {{ props.taskTitle }}</h2>
        <button type="button" class="full-log__close" aria-label="Close" @click="onClose">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3 3 13 13M13 3 3 13" />
          </svg>
        </button>
      </header>

      <div class="full-log__body">
        <p v-if="isLoading" class="full-log__hint" role="status" aria-live="polite">
          Loading full log…
        </p>
        <p v-else-if="error.length > 0" class="full-log__error" role="alert">{{ error }}</p>
        <p v-else-if="lines.length === 0" class="full-log__hint">No logs yet.</p>
        <!-- Logs are untrusted task output: text interpolation only (never v-html). -->
        <pre v-else v-select-all class="full-log__output">{{ lines.join("\n") }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.full-log-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.5);
}

.full-log {
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: min(85vh, 820px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.full-log:focus {
  outline: none;
}

.full-log__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: none;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.full-log__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.full-log__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.full-log__close svg {
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  fill: none;
}

.full-log__close:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.full-log__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.full-log__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: var(--space-4);
}

.full-log__hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.full-log__error {
  margin: 0;
  font-size: 13px;
  color: var(--color-danger, #f87171);
}

.full-log__output {
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
</style>

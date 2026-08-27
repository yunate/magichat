<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import type { CSSProperties } from "vue";
import type { MacroDisplayDetail } from "./textEditTypes";

type Props = {
  detail: MacroDisplayDetail;
  anchor: DOMRect;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  pointerEnter: [];
  pointerLeave: [];
}>();

const COPY_FEEDBACK_DURATION_MS = 1200;
const copyState = ref<"idle" | "copied" | "failed">("idle");
let copyTimer: number | null = null;

const popupStyle = computed<CSSProperties>(() => {
  const viewportMargin = 8;
  const popupWidth = Math.min(320, window.innerWidth - viewportMargin * 2);
  const estimatedHeight = 152;
  const left = Math.min(
    Math.max(viewportMargin, props.anchor.left),
    window.innerWidth - popupWidth - viewportMargin,
  );
  const below = props.anchor.bottom + 8;
  const top = below + estimatedHeight <= window.innerHeight - viewportMargin
    ? below
    : Math.max(viewportMargin, props.anchor.top - estimatedHeight - 8);
  return { left: `${left}px`, top: `${top}px`, width: `${popupWidth}px` };
});

const copyLabel = computed(() => {
  if (copyState.value === "copied") return "Copied";
  if (copyState.value === "failed") return "Copy failed";
  return "Copy value";
});

async function copyValue(): Promise<void> {
  if (!props.detail.successful) return;
  clearCopyTimer();
  try {
    await navigator.clipboard.writeText(props.detail.value);
    copyState.value = "copied";
  } catch (reason: unknown) {
    copyState.value = "failed";
    console.error("Failed to copy Macro value:", reason);
  }
  copyTimer = window.setTimeout(() => {
    copyState.value = "idle";
    copyTimer = null;
  }, COPY_FEEDBACK_DURATION_MS);
}

function clearCopyTimer(): void {
  if (copyTimer === null) return;
  window.clearTimeout(copyTimer);
  copyTimer = null;
}

onUnmounted(clearCopyTimer);
</script>

<template>
  <aside
    class="macro-popup"
    :style="popupStyle"
    role="tooltip"
    @pointerenter="emit('pointerEnter')"
    @pointerleave="emit('pointerLeave')"
  >
    <header class="macro-popup__header">
      <code>{{ detail.key }}</code>
      <span :class="{ 'is-warning': !detail.successful }">{{ detail.sourceType }}</span>
    </header>
    <p class="macro-popup__path">{{ detail.sourcePath }}</p>
    <div class="macro-popup__value" :class="{ 'is-warning': !detail.successful }">
      <code>{{ detail.error ?? detail.value }}</code>
      <button
        type="button"
        :disabled="!detail.successful"
        :aria-label="copyLabel"
        :title="copyLabel"
        @click="copyValue"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 5.5h7v7h-7zM3.5 10.5h-1v-7h7v1" />
        </svg>
      </button>
    </div>
    <p class="macro-popup__feedback" aria-live="polite">
      {{ copyState === "idle" ? "" : copyLabel }}
    </p>
  </aside>
</template>

<style scoped>
.macro-popup {
  position: fixed;
  z-index: 1000;
  padding: var(--space-3);
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface-raised) 92%, black);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
}

.macro-popup__header,
.macro-popup__value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.macro-popup__header code {
  color: #9cdcfe;
  font-weight: 600;
}

.macro-popup__header span {
  padding: 2px 6px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
}

.macro-popup__header span.is-warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}

.macro-popup__path {
  margin: var(--space-2) 0;
  color: var(--color-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.macro-popup__value {
  min-height: 36px;
  padding: var(--space-2);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.macro-popup__value.is-warning {
  border-color: color-mix(in srgb, var(--color-warning) 52%, var(--color-border));
}

.macro-popup__value code {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.macro-popup__value button {
  width: 28px;
  height: 28px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.macro-popup__value button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-selected);
}

.macro-popup__value button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.macro-popup__value button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.macro-popup__value svg {
  width: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linejoin: round;
}

.macro-popup__feedback {
  min-height: 16px;
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
}
</style>

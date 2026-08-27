<script setup lang="ts">
import { ref } from "vue";
import { gMessageStore } from "../../../../messages/messageStore";
import { gCommandSettings, type TerminalPlacement } from "./commandSettings";

const isSaving = ref(false);

const terminalPlacementOptions: readonly Readonly<{
  value: TerminalPlacement;
  label: string;
}>[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

async function onTerminalPlacementChange(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const option = terminalPlacementOptions.find(({ value }) => value === input.value);
  if (option === undefined || isSaving.value) return;

  isSaving.value = true;
  try {
    await gCommandSettings.setTerminalPlacement(option.value);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    gMessageStore.pushMessage("error", message);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <fieldset class="command-settings">
    <legend>Terminal placement</legend>
    <div class="command-settings__options">
      <label
        v-for="option in terminalPlacementOptions"
        :key="option.value"
        class="command-settings__option"
      >
        <input
          type="radio"
          name="command-terminal-placement"
          :value="option.value"
          :checked="gCommandSettings.terminalPlacement.value === option.value"
          :disabled="isSaving || !gCommandSettings.isInitialized.value"
          @change="onTerminalPlacementChange"
        />
        <span>{{ option.label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.command-settings {
  padding: 0;
  border: 0;
}

.command-settings legend {
  margin-block-end: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.command-settings__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.command-settings__option {
  width: 120px;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.command-settings__option:has(input:disabled) {
  opacity: 0.6;
  cursor: wait;
}

.command-settings__option:hover {
  background: var(--color-surface-raised);
}

.command-settings__option:has(input:checked) {
  background: color-mix(in srgb, var(--color-primary) 18%, var(--color-content-bg));
  border-color: var(--color-primary);
}

.command-settings__option:has(input:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-settings__option input {
  margin: 0;
  accent-color: var(--color-primary);
}
</style>

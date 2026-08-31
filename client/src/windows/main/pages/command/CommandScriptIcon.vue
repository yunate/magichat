<script setup lang="ts">
import { computed } from "vue";
import type { ScriptType } from "../../../../../../common/tasks/scriptTaskDefinition";

type Props = {
  scriptType?: ScriptType;
  isRunning?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  isRunning: false,
});

const SCRIPT_TYPE_LABELS: Readonly<Record<ScriptType, string>> = {
  powershell: "PS",
  node: "JS",
  python: "PY",
  cmd: "CMD",
};

const label = computed(() => props.scriptType === undefined
  ? "RUN"
  : SCRIPT_TYPE_LABELS[props.scriptType]);
const title = computed(() => `${props.scriptType ?? "Command"}${props.isRunning ? " is running" : ""}`);
</script>

<template>
  <span
    class="command-script-icon"
    :class="{ 'is-running': isRunning }"
    :title="title"
    :role="isRunning ? 'status' : undefined"
    :aria-label="isRunning ? title : undefined"
    :aria-hidden="isRunning ? undefined : true"
  >{{ label }}</span>
</template>

<style scoped>
.command-script-icon {
  position: relative;
  width: 28px;
  min-width: 28px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--space-1);
  border: 1px solid color-mix(in srgb, currentColor 68%, transparent);
  border-radius: var(--radius-small);
  color: var(--color-command-icon);
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-family: var(--font-family);
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.2px;
}

.command-script-icon.is-running {
  border-color: transparent;
}

.command-script-icon.is-running::after {
  --command-icon-orbit-angle: 0deg;
  position: absolute;
  inset: -1px;
  content: "";
  padding: 1px;
  border-radius: var(--radius-small);
  background: conic-gradient(
    from var(--command-icon-orbit-angle),
    transparent 0deg,
    color-mix(in srgb, var(--color-command-running) 28%, transparent) 54deg,
    color-mix(in srgb, var(--color-command-running) 82%, transparent) 132deg,
    var(--color-command-running) 174deg,
    transparent 180deg,
    color-mix(in srgb, var(--color-command-running) 28%, transparent) 234deg,
    color-mix(in srgb, var(--color-command-running) 82%, transparent) 312deg,
    var(--color-command-running) 354deg,
    transparent 360deg
  );
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: command-script-icon-orbit 2.6s linear infinite;
  pointer-events: none;
}

@property --command-icon-orbit-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes command-script-icon-orbit {
  to { --command-icon-orbit-angle: 360deg; }
}
</style>

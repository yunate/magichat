<script setup lang="ts">
import { computed } from "vue";
import { commandItemDataSerializer } from "../../../../../../common/command";
import type { ScriptType } from "../../../../../../common/tasks/scriptTaskDefinition";
import type { TreeViewItem } from "../../../../../../common/treeView";

type Props = {
  item: TreeViewItem;
};

type ScriptIcon = Readonly<{
  label: string;
  title: string;
}>;

const props = defineProps<Props>();

const scriptIcon = computed(() => getScriptIcon(
  commandItemDataSerializer.fromValue(props.item.properties.data).scriptType,
));

function getScriptIcon(scriptType: ScriptType): ScriptIcon {
  switch (scriptType) {
    case "powershell": return { label: "PS1", title: "PowerShell" };
    case "bash": return { label: "SH", title: "Bash" };
    case "node": return { label: "JS", title: "Node.js" };
    case "python": return { label: "PY", title: "Python" };
    case "cmd": return { label: "CMD", title: "Command Prompt" };
  }
}
</script>

<template>
  <span
    class="command-script-icon"
    :class="`is-${scriptIcon.label.toLowerCase()}`"
    :title="scriptIcon.title"
    aria-hidden="true"
  >{{ scriptIcon.label }}</span>
</template>

<style scoped>
.command-script-icon {
  min-width: 20px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--space-1);
  border: 1px solid color-mix(in srgb, currentColor 68%, transparent);
  border-radius: 4px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.2px;
}

.command-script-icon.is-py {
  color: #e5c07b;
}

.command-script-icon.is-js {
  color: #e8d44d;
}

.command-script-icon.is-ps1 {
  color: #62b4f5;
}

.command-script-icon.is-cmd {
  color: #73c991;
}

.command-script-icon.is-sh {
  color: #c5e478;
}
</style>

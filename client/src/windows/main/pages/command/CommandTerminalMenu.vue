<script setup lang="ts">
import { EllipsisVertical, EyeOff, PanelBottom, PanelLeft, PanelRight, PanelTop } from "@lucide/vue";
import { nextTick, onMounted, onUnmounted, shallowRef, useId, useTemplateRef, watch } from "vue";
import type { Component } from "vue";
import type { CodeViewPlacement } from "../../../../../../common/command";
import ContextMenu from "../../../../components/ContextMenu.vue";
import type { ContextMenuArea, ContextMenuPosition } from "../../../../components/contextMenuTypes";

type TerminalMenu = Readonly<{
  position: ContextMenuPosition;
  area: ContextMenuArea;
}>;

const props = defineProps<{ isActive: boolean }>();
const codeViewPlacement = defineModel<CodeViewPlacement>("codeViewPlacement", { required: true });
const terminalMenu = shallowRef<TerminalMenu | null>(null);
const terminalMenuId = useId();
const terminalMenuButton = useTemplateRef<HTMLButtonElement>("terminalMenuButton");
const terminalMenuContent = useTemplateRef<HTMLElement>("terminalMenuContent");
const TERMINAL_MENU_WIDTH = 296;
const codeViewPlacementOptions: readonly Readonly<{
  value: CodeViewPlacement;
  label: string;
  icon: Component;
}>[] = [
  { value: "left", label: "Left", icon: PanelLeft },
  { value: "right", label: "Right", icon: PanelRight },
  { value: "top", label: "Top", icon: PanelTop },
  { value: "bottom", label: "Bottom", icon: PanelBottom },
  { value: "hide", label: "Hide", icon: EyeOff },
];

watch(() => props.isActive, (isActive) => {
  if (!isActive) closeTerminalMenu();
});
watch(codeViewPlacement, () => closeTerminalMenu());

onMounted(() => {
  window.addEventListener("pointerdown", onDismissTerminalMenu);
  window.addEventListener("keydown", onTerminalMenuKeydown);
  window.addEventListener("resize", onDismissTerminalMenu);
  window.addEventListener("blur", onDismissTerminalMenu);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", onDismissTerminalMenu);
  window.removeEventListener("keydown", onTerminalMenuKeydown);
  window.removeEventListener("resize", onDismissTerminalMenu);
  window.removeEventListener("blur", onDismissTerminalMenu);
});

async function onToggleTerminalMenu(): Promise<void> {
  if (terminalMenu.value !== null) {
    closeTerminalMenu(true);
    return;
  }
  const bounds = terminalMenuButton.value?.getBoundingClientRect();
  if (bounds === undefined) return;
  terminalMenu.value = {
    position: { x: bounds.right - TERMINAL_MENU_WIDTH, y: bounds.bottom + 4 },
    area: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
  };
  await nextTick();
  terminalMenuContent.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
}

function closeTerminalMenu(shouldRestoreFocus = false): void {
  if (terminalMenu.value === null) return;
  terminalMenu.value = null;
  if (shouldRestoreFocus) terminalMenuButton.value?.focus();
}

function onDismissTerminalMenu(): void {
  closeTerminalMenu();
}

function onTerminalMenuKeydown(event: KeyboardEvent): void {
  if (terminalMenu.value === null) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeTerminalMenu(true);
  } else if (event.key === "Tab") {
    closeTerminalMenu(true);
  }
}

function onCodeViewPlacementChange(placement: CodeViewPlacement): void {
  codeViewPlacement.value = placement;
  closeTerminalMenu(true);
}

function onCodeViewPlacementKeydown(event: KeyboardEvent): void {
  const buttons = Array.from(terminalMenuContent.value?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const currentIndex = buttons.findIndex((button) => button === event.target);
  if (currentIndex < 0) return;
  let nextIndex: number;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowUp": nextIndex = (currentIndex + buttons.length - 1) % buttons.length; break;
    case "ArrowRight":
    case "ArrowDown": nextIndex = (currentIndex + 1) % buttons.length; break;
    case "Home": nextIndex = 0; break;
    case "End": nextIndex = buttons.length - 1; break;
    default: return;
  }
  event.preventDefault();
  buttons[nextIndex]?.focus();
}
</script>

<template>
  <button
    ref="terminalMenuButton"
    type="button"
    class="command-terminal-menu-button"
    title="Terminal options"
    aria-label="Terminal options"
    aria-haspopup="menu"
    :aria-expanded="terminalMenu !== null"
    :aria-controls="terminalMenu === null ? undefined : terminalMenuId"
    @pointerdown.stop
    @click="onToggleTerminalMenu"
  ><EllipsisVertical :size="16" aria-hidden="true" /></button>

  <ContextMenu
    v-if="terminalMenu !== null"
    :position="terminalMenu.position"
    :area="terminalMenu.area"
    :width="TERMINAL_MENU_WIDTH"
  >
    <div
      :id="terminalMenuId"
      ref="terminalMenuContent"
      class="command-code-view-placement"
      role="group"
      aria-label="Code view position"
      @keydown="onCodeViewPlacementKeydown"
    >
      <span aria-hidden="true">Code view</span>
      <button
        v-for="option in codeViewPlacementOptions"
        :key="option.value"
        type="button"
        role="menuitemradio"
        :aria-label="option.label"
        :aria-checked="codeViewPlacement === option.value"
        :tabindex="codeViewPlacement === option.value ? 0 : -1"
        :title="option.label"
        @click="onCodeViewPlacementChange(option.value)"
      ><component :is="option.icon" :size="16" aria-hidden="true" /></button>
    </div>
  </ContextMenu>
</template>

<style scoped>
.command-terminal-menu-button {
  width: 30px;
  height: 30px;
  min-height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  margin-inline-start: auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-medium);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.command-terminal-menu-button[aria-expanded="true"] {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-raised));
}

.command-terminal-menu-button:hover {
  background: color-mix(in srgb, var(--color-text) 8%, var(--color-surface-raised));
  border-color: color-mix(in srgb, var(--color-border) 62%, var(--color-text-muted));
}

.command-terminal-menu-button:active {
  transform: translateY(1px);
}

.command-terminal-menu-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.command-code-view-placement {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  white-space: nowrap;
}

.command-code-view-placement > span {
  flex: 1;
  margin-inline-end: var(--space-2);
  color: var(--color-text);
  font-size: 13px;
}

.command-code-view-placement > button {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  padding: 0;
  text-align: center;
}

.command-code-view-placement > button[aria-checked="true"] {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface-raised));
}
</style>
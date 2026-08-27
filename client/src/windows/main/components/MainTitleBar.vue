<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { gMainApplication } from "../main";
import type { PageDefinition } from "../pages/types";
import PageSettingsPopover from "./PageSettingsPopover.vue";

type Props = {
  pages: readonly PageDefinition[];
  activePagePath: string | null;
};

const props = defineProps<Props>();
const emit = defineEmits<{ navigate: [path: string] }>();
const appIconUrl = new URL("../../../../../build/appIcon.ico", import.meta.url).href;
const isSettingsOpen = ref(false);
const activePage = computed(() => props.pages.find((page) => page.path === props.activePagePath) ?? null);

watch(() => props.activePagePath, () => {
  isSettingsOpen.value = false;
});

function toggleSettings(): void {
  isSettingsOpen.value = !isSettingsOpen.value;
}

async function minimizeWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.minimize();
}

async function toggleMaximizeWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.toggleMaximize();
}

async function closeWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.close();
}
</script>

<template>
  <header class="app-nav">
    <span class="app-nav__brand">
      <img class="app-nav__brand-icon" :src="appIconUrl" alt="" />
      <span>MagicHat</span>
    </span>
    <nav class="app-nav__links" aria-label="Primary">
      <button
        v-for="page in pages"
        :key="page.path"
        class="app-nav__link"
        :class="{ 'app-nav__link--active': page.path === activePagePath }"
        type="button"
        @click="emit('navigate', page.path)"
      >{{ page.title }}</button>
    </nav>
    <div class="app-nav__drag-region" @dblclick="toggleMaximizeWindow"></div>
    <button
      class="app-settings-button"
      :class="{ 'app-settings-button--active': isSettingsOpen }"
      type="button"
      aria-label="Current page settings"
      title="Current page settings"
      :aria-expanded="isSettingsOpen"
      aria-controls="page-settings-panel"
      @click="toggleSettings"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.14 12.94a7.7 7.7 0 0 0 .05-.94 7.7 7.7 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.28 7.28 0 0 0-1.62-.94L14.88 3h-3.84l-.36 3.18a7.28 7.28 0 0 0-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58a7.7 7.7 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.04.7 1.62.94l.36 3.18h3.84l.36-3.18a7.28 7.28 0 0 0 1.62-.94l2.39.96 1.92-3.32-2.03-1.58ZM12.96 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
      </svg>
    </button>
    <div class="window-controls" aria-label="Window controls">
      <button
        class="window-control"
        type="button"
        aria-label="Minimize window"
        title="Minimize"
        @click="minimizeWindow"
      >
        <span class="window-control__icon window-control__icon--minimize"></span>
      </button>
      <button
        class="window-control"
        type="button"
        aria-label="Maximize or restore window"
        title="Maximize or restore"
        @click="toggleMaximizeWindow"
      >
        <span class="window-control__icon window-control__icon--maximize"></span>
      </button>
      <button
        class="window-control window-control--close"
        type="button"
        aria-label="Close window"
        title="Close"
        @click="closeWindow"
      >
        <span class="window-control__icon window-control__icon--close"></span>
      </button>
    </div>
    <PageSettingsPopover
      v-if="isSettingsOpen"
      :page="activePage"
      @close="isSettingsOpen = false"
    />
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  gap: 0;
  height: 48px;
  padding-left: var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
  -webkit-app-region: drag;
  user-select: none;
}

.app-nav__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  align-self: stretch;
  margin-inline-end: var(--space-6);
  padding-right: var(--space-4);
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--color-text);
  -webkit-app-region: no-drag;
}

.app-nav__brand-icon {
  width: 20px;
  height: 20px;
  flex: none;
}

.app-nav__links {
  align-self: stretch;
  display: flex;
  gap: 0;
  -webkit-app-region: no-drag;
}

.app-nav__link {
  position: relative;
  min-width: 68px;
  height: 48px;
  padding: 0 var(--space-4);
  border: 0;
  border-radius: 0;
  color: var(--color-text-muted);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.app-nav__link:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.app-nav__link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.app-nav__link--active {
  color: var(--color-primary);
  background: var(--color-surface-selected);
}

.app-nav__drag-region {
  align-self: stretch;
  flex: 1;
}

.app-settings-button,
.window-control {
  align-self: stretch;
  width: 48px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--color-text-muted);
  background: transparent;
  transition: color 0.15s ease, background 0.15s ease;
  -webkit-app-region: no-drag;
}

.app-settings-button {
  cursor: pointer;
}

.app-settings-button svg {
  width: 17px;
  height: 17px;
  fill: currentColor;
}

.app-settings-button:hover,
.app-settings-button--active,
.window-control:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.app-settings-button:active,
.window-control:active {
  background: var(--color-border);
}

.app-settings-button:focus-visible,
.window-control:focus-visible {
  z-index: 1;
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.window-controls {
  align-self: stretch;
  display: flex;
  -webkit-app-region: no-drag;
}

.window-control {
  position: relative;
  cursor: default;
}

.window-control--close:hover,
.window-control--close:active {
  color: #ffffff;
  background: #c42b1c;
}

.window-control__icon {
  position: relative;
  width: 12px;
  height: 12px;
}

.window-control__icon--minimize::before {
  position: absolute;
  inset: auto 1px 2px;
  height: 1px;
  content: "";
  background: currentColor;
}

.window-control__icon--maximize {
  width: 10px;
  height: 10px;
  border: 1px solid currentColor;
}

.window-control__icon--close::before,
.window-control__icon--close::after {
  position: absolute;
  top: 5px;
  left: 0;
  width: 12px;
  height: 1px;
  content: "";
  background: currentColor;
}

.window-control__icon--close::before {
  transform: rotate(45deg);
}

.window-control__icon--close::after {
  transform: rotate(-45deg);
}
</style>

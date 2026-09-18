<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import {
  GLOBAL_CONFIG_KEY,
  globalConfigSerializer,
} from "../../../../../common/config/global";
import { DEFAULT_THEME_NAME } from "../../../../../common/theme";
import PopupSelect, { type PopupSelectOption } from "../../../components/PopupSelect.vue";
import type { PopupToastHandle } from "../../../components/popupToast";
import PopupToast from "../../../components/PopupToast.vue";
import { showAlertDialog } from "../../../components/confirmDialog";
import { IS_DEBUG } from "../../../environment";
import { gMainApplication } from "../main";
import type { PageDefinition } from "../pages/types";
import { applyTheme } from "../themes/theme";
import AboutPanel from "./AboutPanel.vue";
import PageHelpPanel from "./PageHelpPanel.vue";
import PageSettingsPopover from "./PageSettingsPopover.vue";

type Props = {
  pages: readonly PageDefinition[];
  activePagePath: string | null;
};

const props = defineProps<Props>();
const emit = defineEmits<{ navigate: [path: string] }>();
const appIconUrl = IS_DEBUG
  ? new URL("../../../../../build/debugAppIcon.ico", import.meta.url).href
  : new URL("../../../../../build/appIcon.ico", import.meta.url).href;
const isAboutOpen = ref(false);
const isHelpOpen = ref(false);
const isSettingsOpen = ref(false);
const isRefreshing = ref(false);
const isThemeLoading = ref(true);
const selectedThemeName = ref(DEFAULT_THEME_NAME);
const themeOptions = ref<readonly PopupSelectOption[]>([]);
const popupToast = useTemplateRef<PopupToastHandle>("popupToast");
const settingsPopover = useTemplateRef<{
  getCurrent: () => Promise<unknown>;
  save: () => Promise<void>;
}>("settingsPopover");
const activePage = computed(() => props.pages.find((page) => page.path === props.activePagePath) ?? null);
const isHelpAvailable = computed(() => activePage.value?.helpComponent !== undefined);
const isRefreshAvailable = computed(() => activePage.value?.refreshCallback !== undefined);
const isEnvAvailable = computed(() => activePage.value?.envCallback !== undefined);
const isEnvOpen = computed(() => activePage.value?.envPanelOpen?.value ?? false);

onMounted(() => void loadThemes());

watch(() => props.activePagePath, (_path, previousPath) => {
  isAboutOpen.value = false;
  isHelpOpen.value = false;
  if (!isSettingsOpen.value) return;
  const previousPage = props.pages.find((page) => page.path === previousPath) ?? null;
  void closeSettings(previousPage);
});

async function toggleSettings(): Promise<void> {
  if (isSettingsOpen.value) {
    await closeSettings(activePage.value);
    return;
  }
  isAboutOpen.value = false;
  isHelpOpen.value = false;
  isSettingsOpen.value = true;
}

async function toggleHelp(): Promise<void> {
  if (isHelpOpen.value) {
    isHelpOpen.value = false;
    return;
  }
  if (!isHelpAvailable.value) return;
  if (isSettingsOpen.value && !await closeSettings(activePage.value)) return;
  isAboutOpen.value = false;
  isHelpOpen.value = true;
}

async function toggleAbout(): Promise<void> {
  if (isAboutOpen.value) {
    isAboutOpen.value = false;
    return;
  }
  if (isSettingsOpen.value && !await closeSettings(activePage.value)) return;
  isHelpOpen.value = false;
  isAboutOpen.value = true;
}

async function closeSettings(page: PageDefinition | null): Promise<boolean> {
  try {
    const current = await settingsPopover.value?.getCurrent();
    if (page?.beforeSaveCallback !== undefined && !await page.beforeSaveCallback(current)) {
      popupToast.value?.show("Settings save was cancelled.");
      return false;
    }
    await settingsPopover.value?.save();
    isSettingsOpen.value = false;
    return true;
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await showAlertDialog({
      title: "Settings could not be saved",
      descriptions: [message],
    });
    return false;
  }
}

async function navigate(path: string): Promise<void> {
  if (path === props.activePagePath) {
    if (isSettingsOpen.value) await closeSettings(activePage.value);
    isAboutOpen.value = false;
    isHelpOpen.value = false;
    return;
  }
  if (isSettingsOpen.value && !await closeSettings(activePage.value)) return;
  emit("navigate", path);
}

async function refreshPage(): Promise<void> {
  const callback = activePage.value?.refreshCallback;
  if (callback === undefined || isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await callback();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await showAlertDialog({
      title: "Page could not be refreshed",
      descriptions: [message],
    });
  } finally {
    isRefreshing.value = false;
  }
}

async function toggleEnvPanel(): Promise<void> {
  const callback = activePage.value?.envCallback;
  if (callback === undefined) return;
  try {
    await callback();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await showAlertDialog({
      title: "Workspace Environment could not be opened",
      descriptions: [message],
    });
  }
}

async function loadThemes(): Promise<void> {
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const themeRpcObject = await gMainApplication.window.getThemeServerRpcObject();
    const [configJson, themeNames] = await Promise.all([
      configRpcObject.getJson(GLOBAL_CONFIG_KEY),
      themeRpcObject.listThemes(),
    ]);
    const config = globalConfigSerializer.fromJson(configJson);
    const theme = await themeRpcObject.resolveTheme(config.theme.name);
    selectedThemeName.value = theme.name;
    themeOptions.value = themeNames.map((name) => ({ value: name, label: name }));
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await showAlertDialog({
      title: "Themes could not be loaded",
      descriptions: [message],
    });
  } finally {
    isThemeLoading.value = false;
  }
}

async function selectTheme(name: string): Promise<void> {
  if (name === selectedThemeName.value || isThemeLoading.value) return;
  isThemeLoading.value = true;
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const themeRpcObject = await gMainApplication.window.getThemeServerRpcObject();
    const [configJson, theme] = await Promise.all([
      configRpcObject.getJson(GLOBAL_CONFIG_KEY),
      themeRpcObject.resolveTheme(name),
    ]);
    const config = globalConfigSerializer.fromJson(configJson);
    await configRpcObject.setJson(GLOBAL_CONFIG_KEY, globalConfigSerializer.toJson({
      ...config,
      theme: { name: theme.name },
    }));
    applyTheme(theme);
    selectedThemeName.value = theme.name;
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await showAlertDialog({
      title: "Theme could not be changed",
      descriptions: [message],
    });
  } finally {
    isThemeLoading.value = false;
  }
}

async function minimizeWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.minimize();
}

async function toggleMaximizeWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.toggleMaximize();
}

async function hideWindow(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.hide();
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
        @click="navigate(page.path)"
      >{{ page.title }}</button>
    </nav>
    <div class="app-nav__drag-region" @dblclick="toggleMaximizeWindow"></div>
    <button
      v-if="isHelpAvailable"
      class="app-help-button"
      :class="{ 'app-help-button--active': isHelpOpen }"
      type="button"
      aria-label="Current page help"
      title="Current page help"
      :aria-expanded="isHelpOpen"
      aria-controls="page-help-panel"
      @click="toggleHelp"
    >?</button>
    <button
      v-if="isEnvAvailable"
      class="app-env-button"
      :class="{ 'app-env-button--active': isEnvOpen }"
      type="button"
      aria-label="Command environment"
      title="Command environment"
      :aria-expanded="isEnvOpen"
      aria-controls="command-env-panel"
      @click="toggleEnvPanel"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16" />
      </svg>
    </button>
    <button
      v-if="isRefreshAvailable"
      class="app-refresh-button"
      type="button"
      aria-label="Refresh current page"
      title="Refresh current page"
      :disabled="isRefreshing"
      @click="refreshPage"
    >
      <svg :class="{ 'is-refreshing': isRefreshing }" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 8a7.5 7.5 0 1 0 .3 7.5M19 3v5h-5" />
      </svg>
    </button>
    <div class="app-theme-button" title="Application theme">
      <PopupSelect
        :value="selectedThemeName"
        :options="themeOptions"
        accessible-label="Application theme"
        :disabled="isThemeLoading"
        :is-indicator-visible="false"
        :menu-width="144"
        @update-value="selectTheme"
      >
        <template #trigger>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-1a1.7 1.7 0 0 1 0-3.4H15a6 6 0 0 0 0-12Z" />
            <circle cx="7.5" cy="10" r="1" />
            <circle cx="10" cy="6.5" r="1" />
            <circle cx="14.5" cy="6.5" r="1" />
          </svg>
        </template>
      </PopupSelect>
    </div>
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
      <svg viewBox="0.96 0 24 24" aria-hidden="true">
        <path d="M19.14 12.94a7.7 7.7 0 0 0 .05-.94 7.7 7.7 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.28 7.28 0 0 0-1.62-.94L14.88 3h-3.84l-.36 3.18a7.28 7.28 0 0 0-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58a7.7 7.7 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.04.7 1.62.94l.36 3.18h3.84l.36-3.18a7.28 7.28 0 0 0 1.62-.94l2.39.96 1.92-3.32-2.03-1.58ZM12.96 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
      </svg>
    </button>
    <button
      class="app-about-button"
      :class="{ 'app-about-button--active': isAboutOpen }"
      type="button"
      aria-label="About MagicHat"
      title="About MagicHat"
      :aria-expanded="isAboutOpen"
      aria-controls="about-panel"
      @click="toggleAbout"
    >
      <span class="app-about-button__icon" aria-hidden="true">i</span>
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
        aria-label="Hide window to tray"
        title="Hide to tray"
        @click="hideWindow"
      >
        <span class="window-control__icon window-control__icon--close"></span>
      </button>
    </div>
    <PageSettingsPopover
      v-if="isSettingsOpen"
      ref="settingsPopover"
      :page="activePage"
      @close="closeSettings(activePage)"
    />
    <PageHelpPanel
      v-if="isHelpOpen"
      :page="activePage"
      @close="isHelpOpen = false"
    />
    <AboutPanel v-if="isAboutOpen" @close="isAboutOpen = false" />
    <PopupToast ref="popupToast" />
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
  -webkit-app-region: drag;
  user-select: none;
}

.app-nav :deep(.popup-toast) {
  position: fixed;
  z-index: 40;
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

.app-nav__link--active,
.app-nav__link--active:hover {
  color: var(--color-primary);
  background: var(--color-surface-selected);
}

.app-nav__drag-region {
  align-self: stretch;
  flex: 1;
}

.app-theme-button {
  width: 48px;
  align-self: stretch;
  -webkit-app-region: no-drag;
}

.app-theme-button :deep(.popup-select__trigger) {
  height: 100%;
  width: 48px;
  min-width: 48px;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 0;
}

.app-theme-button :deep(.popup-select__trigger > svg) {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.app-env-button,
.app-refresh-button,
.app-help-button,
.app-settings-button,
.app-about-button,
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

.app-env-button,
.app-refresh-button,
.app-help-button,
.app-settings-button,
.app-about-button {
  cursor: pointer;
}

.app-refresh-button {
  margin-inline-start: var(--space-2);
}

.app-env-button {
  margin-inline-start: var(--space-2);
}

.app-help-button {
  margin-inline-start: var(--space-2);
}

.app-help-button + .app-env-button,
.app-help-button + .app-refresh-button,
.app-env-button + .app-refresh-button {
  margin-inline-start: 0;
}

.app-env-button svg,
.app-refresh-button svg,
.app-settings-button svg {
  width: 17px;
  height: 17px;
}

.app-help-button {
  font: inherit;
  font-size: 15px;
  font-weight: 600;
}

.app-about-button__icon {
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}

.app-env-button svg,
.app-refresh-button svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.app-refresh-button svg.is-refreshing {
  animation: app-refresh-spin 0.8s linear infinite;
}

.app-settings-button svg {
  fill: currentColor;
}

.app-env-button:hover,
.app-env-button--active,
.app-refresh-button:hover:not(:disabled),
.app-help-button:hover,
.app-help-button--active,
.app-settings-button:hover,
.app-settings-button--active,
.app-about-button:hover,
.app-about-button--active,
.window-control:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.app-env-button:active,
.app-refresh-button:active:not(:disabled),
.app-help-button:active,
.app-settings-button:active,
.app-about-button:active,
.window-control:active {
  background: var(--color-border);
}

.app-env-button:focus-visible,
.app-refresh-button:focus-visible,
.app-help-button:focus-visible,
.app-settings-button:focus-visible,
.app-about-button:focus-visible,
.window-control:focus-visible {
  z-index: 1;
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.app-refresh-button:disabled {
  opacity: 0.5;
  cursor: wait;
}

@keyframes app-refresh-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .app-refresh-button svg.is-refreshing { animation: none; }
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
  color: var(--color-text-on-danger);
  background: var(--color-window-close-hover);
}

.window-control__icon {
  position: relative;
  width: 12px;
  height: 12px;
}

.window-control__icon--minimize::before {
  position: absolute;
  top: 50%;
  right: 1px;
  left: 1px;
  height: 1px;
  content: "";
  background: currentColor;
  transform: translateY(-50%);
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

<script setup lang="ts">
import { ChevronRight, CircleHelp, Coffee, Copy, ExternalLink } from "@lucide/vue";
import { onMounted, onUnmounted, ref } from "vue";
import {
  MAX_UPDATE_CHECK_DELAY_SECONDS,
  MIN_UPDATE_CHECK_DELAY_SECONDS,
  RANDOM_UPDATE_CHECK_DELAY,
  UPDATE_CONFIG_KEY,
  parseUpdateCheckDelaySeconds,
  updateConfigSerializer,
  type UpdateCheckDelaySeconds,
} from "../../../../../common/config/update";
import kofiDonateQrUrl from "../../../assets/kofi-donate.png";
import wechatDonateQrUrl from "../../../assets/wechat-donate.png";
import { showAlertDialog } from "../../../components/confirmDialog";
import { APP_VERSION } from "../../../environment";
import { gMessageStore } from "../../../messages/messageStore";
import { gMainApplication } from "../main";

const emit = defineEmits<{ close: [] }>();
const isAutoUpdateEnabled = ref(true);
const isUpdateConfigLoading = ref(true);
const isUpdateConfigSaving = ref(false);
const checkDelaySeconds = ref<UpdateCheckDelaySeconds>(RANDOM_UPDATE_CHECK_DELAY);
const checkDelayInput = ref<string>(RANDOM_UPDATE_CHECK_DELAY);
const checkDelayError = ref("");
const applicationDirectoryPath = ref("");
const isApplicationDirectoryLoading = ref(true);
const isApplicationDirectoryOpening = ref(false);
const logDirectoryPath = ref("");
const isLogDirectoryLoading = ref(true);
const isLogDirectoryOpening = ref(false);
const isExternalPageOpening = ref(false);

onMounted(() => {
  window.addEventListener("keydown", onWindowKeydown);
  void loadUpdateConfig();
  void loadApplicationDirectoryPath();
  void loadLogDirectoryPath();
});
onUnmounted(() => window.removeEventListener("keydown", onWindowKeydown));

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

function shortenPath(value: string): string {
  const maximumLength = 34;
  if (value.length <= maximumLength) return value;
  const endLength = 15;
  return `${value.slice(0, maximumLength - endLength - 1)}…${value.slice(-endLength)}`;
}

async function copyPath(name: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    gMessageStore.pushMessage("info", `${name} copied.`);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`${name} copy failed: ${message}`);
    gMessageStore.pushMessage("error", `${name} could not be copied.`);
  }
}

async function loadUpdateConfig(): Promise<void> {
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const configJson = await configRpcObject.getJson(UPDATE_CONFIG_KEY);
    const config = updateConfigSerializer.fromJson(configJson);
    isAutoUpdateEnabled.value = config.isAutoUpdateEnabled;
    checkDelaySeconds.value = config.checkDelaySeconds;
    checkDelayInput.value = String(config.checkDelaySeconds);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Update config load failed: ${message}`);
    gMessageStore.pushMessage("error", "The auto update setting could not be loaded.");
  } finally {
    isUpdateConfigLoading.value = false;
  }
}

async function loadApplicationDirectoryPath(): Promise<void> {
  try {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    applicationDirectoryPath.value = await windowRpcObject.getApplicationDirectoryPath();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Application directory load failed: ${message}`);
    gMessageStore.pushMessage("error", "The application path could not be loaded.");
  } finally {
    isApplicationDirectoryLoading.value = false;
  }
}

async function openApplicationDirectory(): Promise<void> {
  if (applicationDirectoryPath.value.length === 0 || isApplicationDirectoryOpening.value) return;
  isApplicationDirectoryOpening.value = true;
  try {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openApplicationDirectory();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Application directory open failed: ${message}`);
    gMessageStore.pushMessage("error", "The application folder could not be opened.");
  } finally {
    isApplicationDirectoryOpening.value = false;
  }
}

async function loadLogDirectoryPath(): Promise<void> {
  try {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    logDirectoryPath.value = await windowRpcObject.getLogDirectoryPath();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Log directory load failed: ${message}`);
    gMessageStore.pushMessage("error", "The log path could not be loaded.");
  } finally {
    isLogDirectoryLoading.value = false;
  }
}

async function openLogDirectory(): Promise<void> {
  if (logDirectoryPath.value.length === 0 || isLogDirectoryOpening.value) return;
  isLogDirectoryOpening.value = true;
  try {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openLogDirectory();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Log directory open failed: ${message}`);
    gMessageStore.pushMessage("error", "The log folder could not be opened.");
  } finally {
    isLogDirectoryOpening.value = false;
  }
}

async function openLatestReleasePage(): Promise<void> {
  await openExternalPage("latest release", async () => {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openLatestReleasePage();
  });
}

async function openIssuesPage(): Promise<void> {
  await openExternalPage("issues", async () => {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openIssuesPage();
  });
}

async function openDiscussionsPage(): Promise<void> {
  await openExternalPage("discussions", async () => {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openDiscussionsPage();
  });
}

async function openKoFiPage(): Promise<void> {
  await openExternalPage("Ko-fi", async () => {
    const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
    await windowRpcObject.openKoFiPage();
  });
}

async function openExternalPage(name: string, openPage: () => Promise<void>): Promise<void> {
  if (isExternalPageOpening.value) return;
  isExternalPageOpening.value = true;
  try {
    await openPage();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`${name} page open failed: ${message}`);
    gMessageStore.pushMessage("error", `The ${name} page could not be opened.`);
  } finally {
    isExternalPageOpening.value = false;
  }
}

async function onAutoUpdateChange(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement) || isUpdateConfigSaving.value) return;
  const nextValue = event.target.checked;
  event.target.checked = isAutoUpdateEnabled.value;
  isUpdateConfigSaving.value = true;
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    await configRpcObject.setJson(UPDATE_CONFIG_KEY, updateConfigSerializer.toJson({
      isAutoUpdateEnabled: nextValue,
      checkDelaySeconds: checkDelaySeconds.value,
    }));
    isAutoUpdateEnabled.value = nextValue;
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Update config save failed: ${message}`);
    gMessageStore.pushMessage("error", "The auto update setting could not be saved.");
  } finally {
    isUpdateConfigSaving.value = false;
  }
}

async function showUpdateHelp(): Promise<void> {
  await showAlertDialog({
    title: "Automatic updates",
    descriptions: [
      "Automatic update checks run only when the packaged application starts.",
      "Check delay accepts random or an integer from 1 to 3600 seconds. Random selects a new delay in that range on each start.",
      "After the delay, MagicHat removes old versions, checks the latest GitHub release, downloads and verifies a newer package, then activates it for the next launch.",
      "Changes to these settings take effect on the next application start.",
    ],
  });
}

function onCheckDelayInput(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  checkDelayInput.value = event.target.value;
  checkDelayError.value = parseUpdateCheckDelaySeconds(event.target.value) === null
    ? `Enter random or ${MIN_UPDATE_CHECK_DELAY_SECONDS}-${MAX_UPDATE_CHECK_DELAY_SECONDS}`
    : "";
}

async function onCheckDelayChange(): Promise<void> {
  if (isUpdateConfigSaving.value) return;
  const nextValue = parseUpdateCheckDelaySeconds(checkDelayInput.value);
  if (nextValue === null) return;
  checkDelayInput.value = String(nextValue);
  if (nextValue === checkDelaySeconds.value) return;
  isUpdateConfigSaving.value = true;
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    await configRpcObject.setJson(UPDATE_CONFIG_KEY, updateConfigSerializer.toJson({
      isAutoUpdateEnabled: isAutoUpdateEnabled.value,
      checkDelaySeconds: nextValue,
    }));
    checkDelaySeconds.value = nextValue;
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Update check delay save failed: ${message}`);
    gMessageStore.pushMessage("error", "The update check delay could not be saved.");
  } finally {
    isUpdateConfigSaving.value = false;
  }
}
</script>

<template>
  <div class="about-layer">
    <aside id="about-panel" class="about-panel" aria-label="About MagicHat">
      <header class="about-panel__header">
        <strong>About MagicHat</strong>
        <button type="button" aria-label="Close About" title="Close" @click="emit('close')">×</button>
      </header>
      <div class="about-panel__content">
        <div class="about-card">
          <section class="about-section">
            <h2>Application</h2>
            <dl class="about-details">
              <div>
                <dt>Version</dt>
                <dd class="about-value--mono">{{ APP_VERSION }}</dd>
              </div>
              <div class="about-auto-update-row">
                <dt><label for="auto-update">Auto update</label></dt>
                <dd class="about-auto-update-actions">
                  <input
                    id="auto-update"
                    type="checkbox"
                    role="switch"
                    :checked="isAutoUpdateEnabled"
                    :disabled="isUpdateConfigLoading || isUpdateConfigSaving"
                    @change="onAutoUpdateChange"
                  >
                  <button
                    type="button"
                    class="about-help-button"
                    title="How automatic updates work"
                    aria-label="How automatic updates work"
                    @click="showUpdateHelp"
                  ><CircleHelp :size="15" aria-hidden="true" /></button>
                </dd>
              </div>
              <div v-if="isAutoUpdateEnabled" class="about-check-delay-row">
                <dt><label for="check-delay">Check delay</label></dt>
                <dd>
                  <input
                    id="check-delay"
                    type="text"
                    :value="checkDelayInput"
                    :disabled="isUpdateConfigLoading || isUpdateConfigSaving"
                    :aria-invalid="checkDelayError.length > 0"
                    :aria-describedby="checkDelayError.length > 0 ? 'check-delay-error' : undefined"
                    :title="checkDelayError || 'random or 1-3600 seconds'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="onCheckDelayInput"
                    @change="onCheckDelayChange"
                  >
                  <span
                    v-if="checkDelayError.length > 0"
                    id="check-delay-error"
                    class="about-check-delay-error"
                    role="alert"
                  >{{ checkDelayError }}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section class="about-section">
            <h2>Support</h2>
            <dl class="about-details">
              <div>
                <dt>Release</dt>
                <dd><button type="button" class="about-link" title="https://github.com/ddmagichat/magichat-release/releases/tag/latest" :disabled="isExternalPageOpening" @click="openLatestReleasePage">Latest release</button></dd>
              </div>
              <div>
                <dt>Issues</dt>
                <dd><button type="button" class="about-link" title="https://github.com/ddmagichat/magichat-release/issues" :disabled="isExternalPageOpening" @click="openIssuesPage">Feature requests &amp; issues</button></dd>
              </div>
              <div>
                <dt>Discussions</dt>
                <dd><button type="button" class="about-link" title="https://github.com/ddmagichat/magichat-release/discussions" :disabled="isExternalPageOpening" @click="openDiscussionsPage">Discussions</button></dd>
              </div>
            </dl>
          </section>

          <section class="about-section">
            <h2>Storage</h2>
            <dl class="about-details">
              <div>
                <dt>App path</dt>
                <dd class="about-path-value">
                  <button
                    v-if="applicationDirectoryPath.length > 0"
                    type="button"
                    class="about-link about-value--mono"
                    title="Open application folder"
                    :disabled="isApplicationDirectoryOpening"
                    @click="openApplicationDirectory"
                  >{{ shortenPath(applicationDirectoryPath) }}</button>
                  <span v-else class="about-placeholder">{{ isApplicationDirectoryLoading ? "Loading..." : "Unavailable" }}</span>
                  <button
                    type="button"
                    class="about-copy-button"
                    title="Copy application path"
                    aria-label="Copy application path"
                    :disabled="applicationDirectoryPath.length === 0"
                    @click="copyPath('Application path', applicationDirectoryPath)"
                  ><Copy :size="15" aria-hidden="true" /></button>
                </dd>
              </div>
              <div>
                <dt>Log path</dt>
                <dd class="about-path-value">
                  <button
                    v-if="logDirectoryPath.length > 0"
                    type="button"
                    class="about-link about-value--mono"
                    title="Open log folder"
                    :disabled="isLogDirectoryOpening"
                    @click="openLogDirectory"
                  >{{ shortenPath(logDirectoryPath) }}</button>
                  <span v-else class="about-placeholder">{{ isLogDirectoryLoading ? "Loading..." : "Unavailable" }}</span>
                  <button
                    type="button"
                    class="about-copy-button"
                    title="Copy log path"
                    aria-label="Copy log path"
                    :disabled="logDirectoryPath.length === 0"
                    @click="copyPath('Log path', logDirectoryPath)"
                  ><Copy :size="15" aria-hidden="true" /></button>
                </dd>
              </div>
            </dl>
          </section>

          <section class="about-section" aria-labelledby="donation-title">
            <details class="about-donation">
              <summary>
                <ChevronRight class="about-donation__chevron" :size="15" aria-hidden="true" />
                <span id="donation-title" class="about-donation__title">
                  What, you want to buy me a coffee?
                  <Coffee :size="15" aria-hidden="true" />
                </span>
              </summary>
              <ul class="about-donation__list">
                <li>
                  <button
                    type="button"
                    class="about-donation__item about-donation__item--link"
                    title="https://ko-fi.com/magichat"
                    :disabled="isExternalPageOpening"
                    @click="openKoFiPage"
                  >
                    <img
                      class="about-donation__image"
                      :src="kofiDonateQrUrl"
                      alt="Ko-fi donation QR code"
                    >
                    <span class="about-donation__description">
                      <strong>Ko-fi</strong>
                      <small class="about-donation__url">
                        ko-fi.com/magichat
                        <ExternalLink :size="12" aria-hidden="true" />
                      </small>
                    </span>
                  </button>
                </li>
                <li class="about-donation__item">
                  <img
                    class="about-donation__image"
                    :src="wechatDonateQrUrl"
                    alt="WeChat donation QR code"
                  >
                  <span class="about-donation__description">
                    <strong>WeChat</strong>
                    <small>Scan the QR code with WeChat to pay.</small>
                  </span>
                </li>
              </ul>
            </details>
          </section>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.about-layer {
  position: fixed;
  z-index: 30;
  inset: 48px 0 var(--message-bar-height);
}

.about-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-content-bg);
}

.about-panel__header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
}

.about-panel__header strong {
  font-size: 13px;
  font-weight: 600;
}

.about-panel__header button {
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-medium);
  font: inherit;
  font-size: 20px;
  cursor: pointer;
}

.about-panel__header button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.about-panel__header button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.about-panel__content {
  flex: 1;
  min-height: 0;
  padding: var(--space-6);
  overflow: auto;
}

.about-card {
  width: min(420px, 100%);
  padding: 24px 28px;
  color: var(--color-text);
  font-family: "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.about-section + .about-section {
  margin-block-start: var(--space-6);
}

.about-section h2 {
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.about-details {
  margin: 0;
}

.about-details > div {
  min-height: 36px;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
}

.about-details dt {
  min-height: 24px;
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 13px;
  white-space: nowrap;
}

.about-details dd {
  min-width: 0;
  min-height: 24px;
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 13px;
}

.about-auto-update-row label {
  line-height: 18px;
  cursor: pointer;
}

.about-auto-update-actions {
  gap: var(--space-2);
}

.about-help-button {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-small);
  cursor: pointer;
}

.about-help-button:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.about-details input[role="switch"] {
  appearance: none;
  box-sizing: border-box;
  width: 32px;
  height: 18px;
  margin: 0;
  padding: 2px;
  background: var(--color-content-bg);
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 72%, transparent);
  border-radius: 9px;
  cursor: pointer;
}

.about-details input[role="switch"]::before {
  display: block;
  width: 12px;
  height: 12px;
  content: "";
  background: var(--color-text-muted);
  border-radius: 50%;
  transform: translateX(0);
  transition: transform 120ms ease-out, background-color 120ms ease-out;
}

.about-details input[role="switch"]:checked {
  border-color: var(--color-primary);
}

.about-details input[role="switch"]:checked::before {
  background: var(--color-primary);
  transform: translateX(14px);
}

.about-details input[role="switch"]:hover:not(:disabled) {
  border-color: var(--color-primary-emphasis);
}

.about-details input[role="switch"]:focus-visible,
.about-link:focus-visible,
.about-copy-button:focus-visible,
.about-help-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.about-details input[role="switch"]:disabled,
.about-link:disabled,
.about-copy-button:disabled {
  cursor: default;
  opacity: 0.6;
}

.about-check-delay-row input {
  width: 96px;
  height: 26px;
  box-sizing: border-box;
  padding-inline: var(--space-2);
  color: var(--color-text);
  background: var(--color-content-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  font-family: var(--font-family);
  font-size: 12px;
}

.about-check-delay-row input:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.about-check-delay-row input:focus-visible {
  border-color: var(--color-primary);
  outline: 2px solid color-mix(in srgb, var(--color-primary) 32%, transparent);
  outline-offset: 1px;
}

.about-check-delay-row input[aria-invalid="true"] {
  border-color: var(--color-danger);
}

.about-check-delay-row dd {
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
}

.about-check-delay-error {
  flex-basis: 100%;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 16px;
}

.about-check-delay-row:has(.about-check-delay-error) {
  padding-block: var(--space-1);
}

.about-link {
  max-width: 100%;
  padding: 0;
  color: var(--color-primary);
  background: transparent;
  border: 0;
  font: inherit;
  text-align: start;
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.about-link:hover:not(:disabled) {
  text-decoration-thickness: 2px;
}

.about-value--mono {
  font-family: var(--font-family);
}

.about-path-value {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.about-path-value .about-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.about-copy-button {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-small);
  cursor: pointer;
}

.about-copy-button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.about-placeholder {
  color: var(--color-text-muted);
}

.about-donation summary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  list-style: none;
  cursor: pointer;
}

.about-donation summary::-webkit-details-marker {
  display: none;
}

.about-donation summary:hover {
  color: var(--color-primary);
}

.about-donation summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.about-donation[open] summary {
  margin-block-end: var(--space-2);
}

.about-donation__title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.about-donation__chevron {
  flex: 0 0 auto;
  margin-inline-start: calc(var(--space-1) * -1);
  color: var(--color-text-muted);
  transition: transform 150ms ease-out;
}

.about-donation[open] .about-donation__chevron {
  transform: rotate(90deg);
}

.about-donation__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  list-style: none;
}

.about-donation__item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-small);
  font: inherit;
  text-align: center;
  box-sizing: border-box;
}

.about-donation__item--link {
  cursor: pointer;
}

.about-donation__item--link:hover:not(:disabled) {
  color: var(--color-primary);
}

.about-donation__item--link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.about-donation__item--link:disabled {
  cursor: default;
  opacity: 0.6;
}

.about-donation__image {
  width: 136px;
  height: 136px;
  flex: 0 0 136px;
  padding: var(--space-1);
  background: var(--color-generated-light-bg);
  border-radius: var(--radius-medium);
  object-fit: contain;
  box-sizing: border-box;
}

.about-donation__description {
  min-width: 0;
  min-height: 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
}

.about-donation__description strong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-size: 13px;
  font-weight: 600;
}

.about-donation__description small {
  color: var(--color-text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.about-donation__url {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}
</style>

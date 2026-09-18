<script setup lang="ts">
import { ImagePlus, Save, X } from "@lucide/vue";
import { onUnmounted, ref, useTemplateRef, watch } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { generateQrDataUrl } from "./qr";

const DEFAULT_TEXT = "https://ko-fi.com/magichat";
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const imageInput = useTemplateRef<HTMLInputElement>("imageInput");
const input = ref(DEFAULT_TEXT);
const centerImageUrl = ref("");
const dataUrl = ref("");
const error = ref("");

let latestToken = 0;

watch(
  [input, centerImageUrl],
  async ([text, imageUrl]) => {
    const token = (latestToken += 1);
    if (text === "") {
      dataUrl.value = "";
      error.value = "";
      return;
    }
    try {
      const url = await generateQrDataUrl(text, imageUrl);
      if (token !== latestToken) return;
      dataUrl.value = url;
      error.value = "";
    } catch (e) {
      if (token !== latestToken) return;
      dataUrl.value = "";
      error.value = e instanceof Error ? e.message : "Failed to generate QR code";
    }
  },
  { immediate: true },
);

onUnmounted(() => revokeCenterImageUrl(centerImageUrl.value));

function openImagePicker(): void {
  imageInput.value?.click();
}

function onImageChange(): void {
  const element = imageInput.value;
  if (element === null || element.files === null) return;
  const file = element.files.item(0);
  element.value = "";
  if (file === null) return;
  if (!SUPPORTED_IMAGE_TYPES.some((imageType) => imageType === file.type)) {
    error.value = "Select a PNG, JPEG, or WebP image.";
    return;
  }

  const previousUrl = centerImageUrl.value;
  centerImageUrl.value = URL.createObjectURL(file);
  revokeCenterImageUrl(previousUrl);
}

function clearCenterImage(): void {
  const previousUrl = centerImageUrl.value;
  centerImageUrl.value = "";
  revokeCenterImageUrl(previousUrl);
}

function revokeCenterImageUrl(url: string): void {
  if (url !== "") URL.revokeObjectURL(url);
}

function saveQr(): void {
  if (dataUrl.value === "") return;
  const link = document.createElement("a");
  link.href = dataUrl.value;
  link.download = "qrcode.png";
  link.click();
}
</script>

<template>
  <ToolSplitLayout
    title="QR Code"
    hint="Enter text or a URL to generate a QR code in PNG format. An error appears if the content exceeds capacity."
    left-label="Text / URL"
    right-label="QR Code"
  >
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="qr-tool__area"
        spellcheck="false"
        aria-label="QR code content"
        placeholder="Enter text or a URL..."
      ></textarea>
    </template>
    <template #leftActions>
      <div class="qr-tool__actions">
        <button
          type="button"
          class="qr-tool__action"
          title="Select center image"
          aria-label="Select center image"
          @click="openImagePicker"
        ><ImagePlus :size="14" aria-hidden="true" /></button>
        <button
          v-if="centerImageUrl !== ''"
          type="button"
          class="qr-tool__action"
          title="Remove center image"
          aria-label="Remove center image"
          @click="clearCenterImage"
        ><X :size="14" aria-hidden="true" /></button>
        <input
          ref="imageInput"
          class="qr-tool__file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="onImageChange"
        />
      </div>
    </template>
    <template #rightActions>
      <button
        type="button"
        class="qr-tool__action qr-tool__action--save"
        title="Save transparent PNG"
        :disabled="dataUrl === ''"
        @click="saveQr"
      ><Save :size="14" aria-hidden="true" /> Save</button>
    </template>
    <template #right>
      <div class="qr-tool__result">
        <p v-if="error !== ''" class="qr-tool__error">{{ error }}</p>
        <p v-else-if="dataUrl === ''" class="qr-tool__empty">Waiting for input...</p>
        <img v-else :src="dataUrl" class="qr-tool__image" alt="Generated QR code" />
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.qr-tool__area {
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

.qr-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.qr-tool__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.qr-tool__action {
  min-width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding-inline: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.qr-tool__action--save {
  padding-inline: var(--space-2);
}

.qr-tool__action:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.qr-tool__action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.qr-tool__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qr-tool__file-input {
  display: none;
}

.qr-tool__result {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.qr-tool__image {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-large);
  background: var(--color-generated-light-bg);
  padding: var(--space-2);
}

.qr-tool__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 14px;
  text-align: center;
}

.qr-tool__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

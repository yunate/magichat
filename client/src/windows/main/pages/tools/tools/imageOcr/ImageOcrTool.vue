<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef } from "vue";
import type { LoggerMessage, PSM, Worker } from "tesseract.js";
import PopupSelect from "../../../../../../components/PopupSelect.vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";

type OcrLanguage = "chi_sim+eng" | "eng" | "chi_tra+eng" | "jpn+eng";
type OcrLayout = "screenshot" | "document" | "textBlock" | "singleLine";

type LanguageOption = {
  value: OcrLanguage;
  label: string;
};

type LayoutOption = {
  value: OcrLayout;
  label: string;
};

const TARGET_RECOGNITION_EDGE = 3200;
const MAX_RECOGNITION_SCALE = 3;

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: "chi_sim+eng", label: "Simplified Chinese + English" },
  { value: "eng", label: "English" },
  { value: "chi_tra+eng", label: "Traditional Chinese + English" },
  { value: "jpn+eng", label: "Japanese + English" },
];

const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { value: "screenshot", label: "Screenshot / Sparse Text" },
  { value: "document", label: "Document" },
  { value: "textBlock", label: "Single Text Block" },
  { value: "singleLine", label: "Single Line" },
];

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const previewImage = useTemplateRef<HTMLImageElement>("previewImage");
const selectedFile = ref<File | null>(null);
const previewUrl = ref("");
const imageDimensions = ref("");
const selectedLanguage = ref<OcrLanguage>("chi_sim+eng");
const selectedLayout = ref<OcrLayout>("screenshot");
const recognizedText = ref("");
const error = ref("");
const stageText = ref("Waiting for an image");
const progress = ref(0);
const isDragging = ref(false);
const isRunning = ref(false);
const isCleaningUp = ref(false);

let currentWorker: Worker | null = null;
let workerCreation: Promise<Worker> | null = null;
let workerCreationVersion: number | null = null;
let cleanupPromise: Promise<void> = Promise.resolve();
let recognitionVersion = 0;

const fileSizeText = computed(() => {
  const file = selectedFile.value;
  if (file === null) return "";
  if (file.size < 1024) return `${file.size} B`;
  if (file.size < 1024 * 1024) return `${(file.size / 1024).toFixed(1)} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
});

const canClear = computed(
  () => selectedFile.value !== null || recognizedText.value !== "" || isRunning.value,
);

function updateLanguage(value: string): void {
  const option = LANGUAGE_OPTIONS.find((candidate) => candidate.value === value);
  if (option !== undefined) selectedLanguage.value = option.value;
}

function updateLayout(value: string): void {
  const option = LAYOUT_OPTIONS.find((candidate) => candidate.value === value);
  if (option !== undefined) selectedLayout.value = option.value;
}

function openFilePicker(): void {
  fileInput.value?.click();
}

function revokePreviewUrl(): void {
  if (previewUrl.value === "") return;
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

async function terminateWorker(worker: Worker): Promise<void> {
  try {
    await worker.terminate();
  } catch (caughtError: unknown) {
    console.error("Failed to terminate OCR worker:", caughtError);
  }
}

function queueWorkerCleanup(
  worker: Worker | null,
  creation: Promise<Worker> | null,
): Promise<void> {
  if (worker === null && creation === null) return cleanupPromise;

  isCleaningUp.value = true;
  const previousCleanup = cleanupPromise;
  const queuedCleanup = previousCleanup.then(async () => {
    if (worker !== null) {
      await terminateWorker(worker);
    }
    if (creation === null) return;
    try {
      await terminateWorker(await creation);
    } catch {
      // Creation errors are reported by the recognition task while its token is valid.
    }
  });
  cleanupPromise = queuedCleanup;
  void (async () => {
    await queuedCleanup;
    if (cleanupPromise === queuedCleanup) {
      isCleaningUp.value = false;
    }
  })();
  return queuedCleanup;
}

function stopRecognition(): Promise<void> {
  recognitionVersion += 1;
  isRunning.value = false;
  const worker = currentWorker;
  const creation = workerCreation;
  currentWorker = null;
  workerCreation = null;
  workerCreationVersion = null;
  return queueWorkerCleanup(worker, creation);
}

function setImage(file: File): void {
  void stopRecognition();
  revokePreviewUrl();
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  imageDimensions.value = "";
  recognizedText.value = "";
  error.value = "";
  progress.value = 0;
  stageText.value = "Image ready";
}

function acceptImage(files: FileList): void {
  const imageFile = Array.from(files).find((file) => file.type.startsWith("image/"));
  if (imageFile === undefined) {
    error.value = "Select a valid image file.";
    return;
  }
  setImage(imageFile);
}

function onFileChange(): void {
  const input = fileInput.value;
  if (input === null || input.files === null) return;
  acceptImage(input.files);
  input.value = "";
}

function onDrop(event: DragEvent): void {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files === undefined || files.length === 0) {
    error.value = "The dropped content does not contain an image file.";
    return;
  }
  acceptImage(files);
}

function onPaste(event: ClipboardEvent): void {
  const files = event.clipboardData?.files;
  if (files === undefined || files.length === 0) {
    error.value = "The clipboard does not contain an image.";
    return;
  }
  acceptImage(files);
}

function onPreviewLoad(): void {
  const image = previewImage.value;
  if (image === null) return;
  imageDimensions.value = `${image.naturalWidth} x ${image.naturalHeight}`;
}

function getStageText(message: LoggerMessage): string {
  switch (message.status) {
    case "loading tesseract core":
      return "Loading OCR engine";
    case "initializing tesseract":
      return "Initializing OCR engine";
    case "loading language traineddata":
      return "Downloading language data";
    case "initializing api":
      return "Preparing recognition";
    case "recognizing text":
      return "Recognizing text";
    default:
      return "Processing image";
  }
}

async function createRecognitionImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.max(
      1,
      Math.min(MAX_RECOGNITION_SCALE, TARGET_RECOGNITION_EDGE / Math.max(bitmap.width, bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Unable to prepare the image for recognition.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function startRecognition(): Promise<void> {
  const file = selectedFile.value;
  if (file === null || isRunning.value) return;

  const previousWorkerTermination = stopRecognition();
  const version = recognitionVersion;
  isRunning.value = true;
  recognizedText.value = "";
  error.value = "";
  progress.value = 0;
  stageText.value = "Loading recognition component";

  let worker: Worker | null = null;
  let ownedCreation: Promise<Worker> | null = null;
  try {
    await previousWorkerTermination;
    if (version !== recognitionVersion) return;
    stageText.value = "Preparing image";
    const recognitionImage = await createRecognitionImage(file);
    if (version !== recognitionVersion) return;
    const { createWorker, PSM } = await import("tesseract.js");
    if (version !== recognitionVersion) return;
    ownedCreation = createWorker(selectedLanguage.value, undefined, {
      logger(message: LoggerMessage): void {
        if (version !== recognitionVersion) return;
        progress.value = Math.round(Math.min(1, Math.max(0, message.progress)) * 100);
        stageText.value = getStageText(message);
      },
    });
    workerCreation = ownedCreation;
    workerCreationVersion = version;
    worker = await ownedCreation;
    if (workerCreation !== ownedCreation || workerCreationVersion !== version) return;
    workerCreation = null;
    workerCreationVersion = null;
    if (version !== recognitionVersion) {
      await queueWorkerCleanup(worker, null);
      return;
    }
    currentWorker = worker;
    let pageSegMode: PSM;
    switch (selectedLayout.value) {
      case "screenshot": pageSegMode = PSM.SPARSE_TEXT; break;
      case "document": pageSegMode = PSM.AUTO; break;
      case "textBlock": pageSegMode = PSM.SINGLE_BLOCK; break;
      case "singleLine": pageSegMode = PSM.SINGLE_LINE; break;
    }
    await worker.setParameters({
      tessedit_pageseg_mode: pageSegMode,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    if (version !== recognitionVersion) return;
    const result = await worker.recognize(recognitionImage);
    if (version !== recognitionVersion) return;
    recognizedText.value = result.data.text;
    progress.value = 100;
    stageText.value = result.data.text.trim() === "" ? "Recognition complete. No text found." : "Recognition complete";
  } catch (caughtError: unknown) {
    if (version !== recognitionVersion) return;
    console.error("OCR recognition failed:", caughtError);
    error.value = "Recognition failed. Check the network connection or try another image.";
    stageText.value = "Recognition failed";
  } finally {
    if (ownedCreation !== null && workerCreation === ownedCreation) {
      workerCreation = null;
      workerCreationVersion = null;
    }
    if (worker !== null && currentWorker === worker) {
      currentWorker = null;
      await queueWorkerCleanup(worker, null);
    }
    if (version === recognitionVersion) {
      isRunning.value = false;
    }
  }
}

function cancelRecognition(): void {
  if (!isRunning.value) return;
  void stopRecognition();
  progress.value = 0;
  stageText.value = "Canceled. Ready to restart.";
  error.value = "";
}

async function copyResult(): Promise<void> {
  if (recognizedText.value === "") return;
  try {
    await navigator.clipboard.writeText(recognizedText.value);
    error.value = "";
  } catch (caughtError: unknown) {
    console.error("Failed to copy OCR result:", caughtError);
    error.value = "Copy failed. Check clipboard permissions.";
  }
}

function clearAll(): void {
  void stopRecognition();
  revokePreviewUrl();
  selectedFile.value = null;
  imageDimensions.value = "";
  recognizedText.value = "";
  error.value = "";
  progress.value = 0;
  stageText.value = "Waiting for an image";
}

onUnmounted(() => {
  void stopRecognition();
  revokePreviewUrl();
});
</script>

<template>
  <ToolSplitLayout
    title="Image OCR"
    hint="Select, drop, or paste an image to recognize text locally. Language data is downloaded on first use."
    left-label="Image"
    right-label="Recognized Text"
  >
    <template #toolbar>
      <div class="ocr-tool__language">
        <span id="ocr-language-label">Recognition Language</span>
        <div class="ocr-tool__language-select">
          <PopupSelect
            :value="selectedLanguage"
            :options="LANGUAGE_OPTIONS"
            accessible-label="Recognition language"
            labelled-by="ocr-language-label"
            :disabled="isRunning"
            @update-value="updateLanguage"
          />
        </div>
      </div>
      <div class="ocr-tool__language">
        <span id="ocr-layout-label">Image Layout</span>
        <div class="ocr-tool__language-select">
          <PopupSelect
            :value="selectedLayout"
            :options="LAYOUT_OPTIONS"
            accessible-label="Image layout"
            labelled-by="ocr-layout-label"
            :disabled="isRunning"
            @update-value="updateLayout"
          />
        </div>
      </div>
      <div class="ocr-tool__actions">
        <button
          type="button"
          class="ocr-tool__button ocr-tool__button--primary"
          :disabled="selectedFile === null || isRunning || isCleaningUp"
          @click="startRecognition"
        >
          Start Recognition
        </button>
        <button
          v-if="isRunning"
          type="button"
          class="ocr-tool__button"
          @click="cancelRecognition"
        >
          Cancel
        </button>
      </div>
    </template>

    <template #leftActions>
      <button type="button" class="ocr-tool__compact-button" @click="openFilePicker">
        Select Image
      </button>
      <input
        ref="fileInput"
        class="ocr-tool__file-input"
        type="file"
        accept="image/*"
        @change="onFileChange"
      />
    </template>

    <template #left>
      <div
        class="ocr-tool__drop-zone"
        :class="{
          'ocr-tool__drop-zone--dragging': isDragging,
          'ocr-tool__drop-zone--has-image': selectedFile !== null,
          'ocr-tool__drop-zone--running': isRunning,
        }"
        role="button"
        tabindex="0"
        aria-label="Image drop and paste area"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @paste="onPaste"
        @keydown.enter.prevent="openFilePicker"
        @keydown.space.prevent="openFilePicker"
      >
        <template v-if="selectedFile === null">
          <p class="ocr-tool__empty-title">Drop an image here</p>
          <p class="ocr-tool__empty-hint">You can also focus this area and paste an image from the clipboard</p>
        </template>
        <template v-else>
          <div class="ocr-tool__preview">
            <img
              ref="previewImage"
              :src="previewUrl"
              alt="Image preview for recognition"
              @load="onPreviewLoad"
            />
          </div>
          <dl class="ocr-tool__metadata">
            <div>
              <dt>File</dt>
              <dd>{{ selectedFile.name }}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{{ imageDimensions || "Reading" }}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{{ fileSizeText }}</dd>
            </div>
          </dl>
        </template>
      </div>
    </template>

    <template #rightActions>
      <div class="ocr-tool__result-actions">
        <button
          type="button"
          class="ocr-tool__compact-button"
          :disabled="recognizedText === ''"
          @click="copyResult"
        >
          Copy
        </button>
        <button
          type="button"
          class="ocr-tool__compact-button"
          :disabled="!canClear"
          @click="clearAll"
        >
          Clear
        </button>
      </div>
    </template>

    <template #right>
      <div class="ocr-tool__result">
        <div class="ocr-tool__status" aria-live="polite">
          <div
            class="ocr-tool__progress"
            role="progressbar"
            aria-label="Text recognition progress"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span :style="{ width: `${progress}%` }"></span>
          </div>
          <span>{{ stageText }}</span>
          <strong>{{ progress }}%</strong>
        </div>
        <p v-if="error !== ''" class="ocr-tool__error" role="alert">{{ error }}</p>
        <textarea
          v-model="recognizedText"
          v-select-all
          class="ocr-tool__text"
          spellcheck="false"
          aria-label="Recognized text"
          placeholder="Recognition results appear here and can be edited."
        ></textarea>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
:deep(.tool-split__toolbar) {
  min-width: 0;
  flex-wrap: wrap;
}

.ocr-tool__language {
  flex: 1 1 220px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 13px;
}

.ocr-tool__language-select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.ocr-tool__actions {
  flex: none;
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.ocr-tool__button:focus-visible,
.ocr-tool__compact-button:focus-visible,
.ocr-tool__drop-zone:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.ocr-tool__button,
.ocr-tool__compact-button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.ocr-tool__button {
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
}

.ocr-tool__compact-button {
  padding: 2px var(--space-2);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
}

.ocr-tool__button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-bg);
}

.ocr-tool__button:hover:not(:disabled),
.ocr-tool__compact-button:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.ocr-tool__button--primary:hover:not(:disabled) {
  background: var(--color-surface-raised);
}

.ocr-tool__button:disabled,
.ocr-tool__compact-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ocr-tool__file-input {
  display: none;
}

.ocr-tool__drop-zone {
  flex: 1;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
  overflow: hidden;
  background: transparent;
  border: 2px dashed transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.ocr-tool__drop-zone:hover,
.ocr-tool__drop-zone--dragging {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.ocr-tool__drop-zone--has-image {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: stretch;
}

.ocr-tool__drop-zone--running {
  border-color: var(--color-accent);
}

.ocr-tool__empty-title,
.ocr-tool__empty-hint {
  margin: 0;
  text-align: center;
}

.ocr-tool__empty-title {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
}

.ocr-tool__empty-hint {
  color: var(--color-text-muted);
  font-size: 13px;
}

.ocr-tool__preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.ocr-tool__preview img {
  display: block;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.ocr-tool__metadata {
  flex: none;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-3);
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.ocr-tool__metadata div {
  min-width: 0;
}

.ocr-tool__metadata dt {
  color: var(--color-text-muted);
  font-size: 11px;
}

.ocr-tool__metadata dd {
  margin: var(--space-1) 0 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocr-tool__result-actions {
  display: flex;
  gap: var(--space-1);
}

.ocr-tool__result {
  flex: 1;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ocr-tool__status {
  flex: none;
  display: grid;
  grid-template-columns: minmax(80px, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
}

.ocr-tool__status strong {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.ocr-tool__progress {
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-medium);
  background: var(--color-border);
}

.ocr-tool__progress span {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width 0.15s ease;
}

.ocr-tool__error {
  flex: none;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-danger);
  font-size: 13px;
}

.ocr-tool__text {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: var(--space-4);
  overflow: auto;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.6;
  scrollbar-color: var(--color-border) transparent;
  scrollbar-width: thin;
}

.ocr-tool__text:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

@media (max-width: 720px) {
  .ocr-tool__language {
    flex-basis: 100%;
    width: 100%;
  }

  .ocr-tool__status {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ocr-tool__progress {
    grid-column: 1 / -1;
  }

  .ocr-tool__drop-zone,
  .ocr-tool__result {
    min-height: 0;
  }

  .ocr-tool__metadata {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ocr-tool__metadata div:nth-child(2) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ocr-tool__button,
  .ocr-tool__compact-button,
  .ocr-tool__drop-zone,
  .ocr-tool__progress span {
    transition: none;
  }
}
</style>
<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef } from "vue";
import type { LoggerMessage, Worker } from "tesseract.js";
import PopupSelect from "../../../../../../components/PopupSelect.vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";

type OcrLanguage = "chi_sim+eng" | "eng" | "chi_tra+eng" | "jpn+eng";

type LanguageOption = {
  value: OcrLanguage;
  label: string;
};

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: "chi_sim+eng", label: "简体中文 + 英文" },
  { value: "eng", label: "英文" },
  { value: "chi_tra+eng", label: "繁体中文 + 英文" },
  { value: "jpn+eng", label: "日文 + 英文" },
];

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const previewImage = useTemplateRef<HTMLImageElement>("previewImage");
const selectedFile = ref<File | null>(null);
const previewUrl = ref("");
const imageDimensions = ref("");
const selectedLanguage = ref<OcrLanguage>("chi_sim+eng");
const recognizedText = ref("");
const error = ref("");
const stageText = ref("等待选择图片");
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
  stageText.value = "图片已就绪";
}

function acceptImage(files: FileList): void {
  const imageFile = Array.from(files).find((file) => file.type.startsWith("image/"));
  if (imageFile === undefined) {
    error.value = "请选择有效的图片文件.";
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
    error.value = "拖放内容中没有图片文件.";
    return;
  }
  acceptImage(files);
}

function onPaste(event: ClipboardEvent): void {
  const files = event.clipboardData?.files;
  if (files === undefined || files.length === 0) {
    error.value = "剪贴板中没有图片.";
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
      return "正在加载 OCR 引擎";
    case "initializing tesseract":
      return "正在初始化 OCR 引擎";
    case "loading language traineddata":
      return "正在下载语言数据";
    case "initializing api":
      return "正在准备识别";
    case "recognizing text":
      return "正在识别文字";
    default:
      return "正在处理图片";
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
  stageText.value = "正在加载识别组件";

  let worker: Worker | null = null;
  let ownedCreation: Promise<Worker> | null = null;
  try {
    await previousWorkerTermination;
    if (version !== recognitionVersion) return;
    const { createWorker } = await import("tesseract.js");
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
    const result = await worker.recognize(file);
    if (version !== recognitionVersion) return;
    recognizedText.value = result.data.text;
    progress.value = 100;
    stageText.value = result.data.text.trim() === "" ? "识别完成, 未发现文字" : "识别完成";
  } catch (caughtError: unknown) {
    if (version !== recognitionVersion) return;
    console.error("OCR recognition failed:", caughtError);
    error.value = "识别失败. 请检查网络连接或更换图片后重试.";
    stageText.value = "识别失败";
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
  stageText.value = "已取消, 可重新识别";
  error.value = "";
}

async function copyResult(): Promise<void> {
  if (recognizedText.value === "") return;
  try {
    await navigator.clipboard.writeText(recognizedText.value);
    error.value = "";
  } catch (caughtError: unknown) {
    console.error("Failed to copy OCR result:", caughtError);
    error.value = "复制失败. 请检查浏览器剪贴板权限.";
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
  stageText.value = "等待选择图片";
}

onUnmounted(() => {
  void stopRecognition();
  revokePreviewUrl();
});
</script>

<template>
  <ToolSplitLayout
    title="图片文字提取"
    hint="选择, 拖放或粘贴图片, 在浏览器本地识别文字. 首次使用需下载语言数据."
    left-label="图片"
    right-label="识别文本"
  >
    <template #toolbar>
      <div class="ocr-tool__language">
        <span id="ocr-language-label">识别语言</span>
        <div class="ocr-tool__language-select">
          <PopupSelect
            :value="selectedLanguage"
            :options="LANGUAGE_OPTIONS"
            accessible-label="识别语言"
            labelled-by="ocr-language-label"
            :disabled="isRunning"
            @update-value="updateLanguage"
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
          开始识别
        </button>
        <button
          v-if="isRunning"
          type="button"
          class="ocr-tool__button"
          @click="cancelRecognition"
        >
          取消
        </button>
      </div>
    </template>

    <template #leftActions>
      <button type="button" class="ocr-tool__compact-button" @click="openFilePicker">
        选择图片
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
        aria-label="图片拖放和粘贴区域"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @paste="onPaste"
        @keydown.enter.prevent="openFilePicker"
        @keydown.space.prevent="openFilePicker"
      >
        <template v-if="selectedFile === null">
          <p class="ocr-tool__empty-title">拖放图片到这里</p>
          <p class="ocr-tool__empty-hint">也可聚焦此区域后粘贴剪贴板图片</p>
        </template>
        <template v-else>
          <div class="ocr-tool__preview">
            <img
              ref="previewImage"
              :src="previewUrl"
              alt="待识别图片预览"
              @load="onPreviewLoad"
            />
          </div>
          <dl class="ocr-tool__metadata">
            <div>
              <dt>文件</dt>
              <dd>{{ selectedFile.name }}</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>{{ imageDimensions || "读取中" }}</dd>
            </div>
            <div>
              <dt>大小</dt>
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
          复制
        </button>
        <button
          type="button"
          class="ocr-tool__compact-button"
          :disabled="!canClear"
          @click="clearAll"
        >
          清空
        </button>
      </div>
    </template>

    <template #right>
      <div class="ocr-tool__result">
        <div class="ocr-tool__status" aria-live="polite">
          <div
            class="ocr-tool__progress"
            role="progressbar"
            aria-label="文字识别进度"
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
          aria-label="识别文本"
          placeholder="识别结果将显示在这里, 可直接编辑."
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
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
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  scrollbar-color: var(--color-border) transparent;
  scrollbar-width: thin;
}

.ocr-tool__text:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

@media (max-width: 720px) {
  :deep(.tool-split) {
    min-width: 0;
    overflow-y: auto;
  }

  :deep(.tool-split__split) {
    flex: none;
    grid-template-rows: minmax(220px, auto) minmax(220px, auto);
  }

  :deep(.tool-split__pane) {
    min-height: 220px;
  }

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
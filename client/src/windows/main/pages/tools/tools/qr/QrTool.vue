<script setup lang="ts">
import { ref, watch } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { generateQrDataUrl } from "./qr";

const DEFAULT_TEXT = "https://www.microsoft.com";

const input = ref(DEFAULT_TEXT);
const dataUrl = ref("");
const error = ref("");

let latestToken = 0;

watch(
  input,
  async (text) => {
    const token = (latestToken += 1);
    if (text === "") {
      dataUrl.value = "";
      error.value = "";
      return;
    }
    try {
      const url = await generateQrDataUrl(text);
      if (token !== latestToken) return;
      dataUrl.value = url;
      error.value = "";
    } catch (e) {
      if (token !== latestToken) return;
      dataUrl.value = "";
      error.value = e instanceof Error ? e.message : "生成二维码失败";
    }
  },
  { immediate: true },
);

function downloadQr(): void {
  if (dataUrl.value === "") return;
  const link = document.createElement("a");
  link.href = dataUrl.value;
  link.download = "qrcode.png";
  link.click();
}
</script>

<template>
  <ToolSplitLayout
    title="二维码"
    hint="输入文本或链接, 右侧即时生成二维码 (PNG); 内容过长超出容量会提示失败。"
    left-label="输入文本 / URL"
    right-label="二维码"
  >
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="qr-tool__area"
        spellcheck="false"
        aria-label="二维码内容"
        placeholder="在此输入要生成二维码的文本或链接…"
      ></textarea>
    </template>
    <template #rightActions>
      <button type="button" class="qr-tool__download" :disabled="dataUrl === ''" @click="downloadQr">
        下载
      </button>
    </template>
    <template #right>
      <div class="qr-tool__result">
        <p v-if="error !== ''" class="qr-tool__error">{{ error }}</p>
        <p v-else-if="dataUrl === ''" class="qr-tool__empty">等待输入…</p>
        <img v-else :src="dataUrl" class="qr-tool__image" alt="二维码" />
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
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.qr-tool__area:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.qr-tool__download {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.qr-tool__download:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.qr-tool__download:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  border-radius: var(--radius-md);
  background: #ffffff;
  padding: var(--space-2);
}

.qr-tool__error {
  margin: 0;
  color: var(--color-danger, #f87171);
  font-size: 14px;
  text-align: center;
}

.qr-tool__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>

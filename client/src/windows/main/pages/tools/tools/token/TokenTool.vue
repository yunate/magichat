<script setup lang="ts">
import { computed, ref } from "vue";
import { vSelectAll } from "../../../../../../directives/vSelectAll";
import ToolSplitLayout from "../../components/ToolSplitLayout.vue";
import { extractTimeClaims, parseJwt, type JwtResult } from "./jwt";

const DEFAULT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const input = ref(DEFAULT_TOKEN);
const copiedKey = ref<"header" | "payload" | "">("");

const result = computed<JwtResult>(() => parseJwt(input.value));

const timeClaims = computed(() =>
  result.value.ok ? extractTimeClaims(result.value.payload) : [],
);

async function copyText(key: "header" | "payload", text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    window.setTimeout(() => (copiedKey.value = ""), 1500);
  } catch {
    copiedKey.value = "";
  }
}
</script>

<template>
  <ToolSplitLayout
    title="Token"
    hint="左侧粘贴 JWT，右侧实时解析 Header 与 Payload；base64url 按 UTF-8 正确解码，签名仅原样展示。"
    left-label="JWT"
  >
    <template #left>
      <textarea
        v-model="input"
        v-select-all
        class="token-tool__input"
        spellcheck="false"
        aria-label="JWT"
        placeholder="在此粘贴 header.payload.signature 形式的 JWT…"
      ></textarea>
    </template>
    <template #right>
      <div class="token-tool__result">
        <template v-if="result.ok">
          <div class="token-tool__block">
            <div class="token-tool__pane-label">
              <span>Header</span>
              <button
                type="button"
                class="token-tool__copy"
                @click="copyText('header', result.header)"
              >
                {{ copiedKey === "header" ? "已复制" : "复制" }}
              </button>
            </div>
            <pre v-select-all tabindex="0" class="token-tool__output" aria-label="Header JSON">{{ result.header }}</pre>
          </div>
          <div class="token-tool__block">
            <div class="token-tool__pane-label">
              <span>Payload</span>
              <button
                type="button"
                class="token-tool__copy"
                @click="copyText('payload', result.payload)"
              >
                {{ copiedKey === "payload" ? "已复制" : "复制" }}
              </button>
            </div>
            <pre v-select-all tabindex="0" class="token-tool__output" aria-label="Payload JSON">{{ result.payload }}</pre>
            <ul v-if="timeClaims.length > 0" class="token-tool__claims">
              <li v-for="claim in timeClaims" :key="claim.label">
                <span class="token-tool__claim-label">{{ claim.label }}</span>
                <span>{{ claim.value }}</span>
              </li>
            </ul>
          </div>
          <div class="token-tool__block">
            <div class="token-tool__pane-label">Signature</div>
            <pre v-select-all tabindex="0" class="token-tool__output token-tool__output--muted" aria-label="签名">{{ result.signature }}</pre>
            <p class="token-tool__note">签名为二进制，需密钥验证，无法解码。</p>
          </div>
        </template>
        <p v-else class="token-tool__error">{{ result.error }}</p>
      </div>
    </template>
  </ToolSplitLayout>
</template>

<style scoped>
.token-tool__result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-3);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.token-tool__block {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-raised);
}

.token-tool__pane-label {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.token-tool__copy {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.token-tool__copy:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.token-tool__input {
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
  word-break: break-all;
}

.token-tool__input:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.token-tool__output {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.token-tool__output:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.token-tool__output--muted {
  color: var(--color-text-muted);
}

.token-tool__claims {
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-3);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-muted);
}

.token-tool__claim-label {
  display: inline-block;
  min-width: 128px;
  color: var(--color-text);
}

.token-tool__note {
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-3);
  color: var(--color-text-muted);
  font-size: 12px;
}

.token-tool__error {
  margin: 0;
  padding: var(--space-4);
  color: var(--color-danger, #f87171);
  font-size: 14px;
}
</style>

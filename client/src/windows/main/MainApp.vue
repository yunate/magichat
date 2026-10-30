<script setup lang="ts">
import { computed, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  GLOBAL_CONFIG_KEY,
  globalConfigSerializer,
} from "../../../../common/config/global";
import ConfirmDialog from "../../components/ConfirmDialog.vue";
import OperationProgressDialog from "../../components/OperationProgressDialog.vue";
import PersistentStack from "../../components/PersistentStack.vue";
import MessageBar from "../../messages/MessageBar.vue";
import { gMessageStore } from "../../messages/messageStore";
import MainTitleBar from "./components/MainTitleBar.vue";
import { gMainApplication } from "./main";
import "./themes/mainTheme.css";
import { gPageRegistry } from "./pages/registry";
import { WINDOW_CLOSE_REQUEST_EVENT } from "./windowClientRpcObject";

const pages = gPageRegistry.getPages();
const route = useRoute();
const router = useRouter();
const activePagePath = computed(() => pages.some((page) => page.path === route.path) ? route.path : null);

async function onWindowCloseRequest(): Promise<void> {
  const windowRpcObject = await gMainApplication.window.getWindowServerRpcObject();
  await windowRpcObject.show();
  await closeApp();
}

function handleWindowCloseRequest(): void {
  void onWindowCloseRequest().catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Window close request failed: ${message}`);
  });
}

window.addEventListener(WINDOW_CLOSE_REQUEST_EVENT, handleWindowCloseRequest);

onUnmounted(() => {
  window.removeEventListener(WINDOW_CLOSE_REQUEST_EVENT, handleWindowCloseRequest);
});

async function navigateTo(path: string): Promise<void> {
  if (!pages.some((page) => page.path === path)) return;
  try {
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const configJson = await configRpcObject.getJson(GLOBAL_CONFIG_KEY);
    const config = globalConfigSerializer.fromJson(configJson);
    await configRpcObject.setJson(GLOBAL_CONFIG_KEY, globalConfigSerializer.toJson({
      ...config,
      activePagePath: path,
    }));
    await router.push(path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Page navigation failed: ${message}`);
    gMessageStore.pushMessage("error", "The selected page could not be saved.");
  }
}

async function closeApp(): Promise<void> {
  try {
    await gMainApplication.quit();
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Application close failed: ${message}`);
  }
}
</script>

<template>
  <div class="app-shell">
    <MainTitleBar
      :pages="pages"
      :active-page-path="activePagePath"
      @navigate="navigateTo"
    />
    <main class="app-body">
      <PersistentStack :entries="pages" :active-key="activePagePath" :get-entry-key="(page) => page.path">
        <template #default="{ entry: page }">
          <component :is="page.component" />
        </template>
      </PersistentStack>
    </main>
    <ConfirmDialog />
    <OperationProgressDialog />
    <MessageBar />
  </div>
</template>

<style scoped>
.app-shell {
  /* Definite viewport height (not min-height) anchors the scroll-containment chain so children resolve
     flex:1 + min-height:0 into scrollable regions instead of growing the page. */
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: var(--message-bar-height);
}
          
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding-inline: var(--space-3);
}
</style>

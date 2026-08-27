<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import ConfirmDialog from "../../components/ConfirmDialog.vue";
import OperationProgressDialog from "../../components/OperationProgressDialog.vue";
import PersistentStack from "../../components/PersistentStack.vue";
import MessageBar from "../../messages/MessageBar.vue";
import MainTitleBar from "./components/MainTitleBar.vue";
import "./mainTheme.css";
import { gPageRegistry } from "./pages/registry";

const pages = gPageRegistry.getPages();
const route = useRoute();
const router = useRouter();
const activePagePath = computed(() => pages.some((page) => page.path === route.path) ? route.path : null);

function navigateTo(path: string): void {
  void router.push(path);
}
</script>

<template>
  <div class="app-shell">
    <MainTitleBar :pages="pages" :active-page-path="activePagePath" @navigate="navigateTo" />
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
}
</style>

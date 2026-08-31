import { createApp, type App } from "vue";
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import {
  GLOBAL_CONFIG_KEY,
  globalConfigSerializer,
} from "../../../../common/config/global";
import type { ConfigServerRpcApi } from "../../../../common/config/configRpcApi";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import { Window } from "../window";
import "./pages";
import { gPageRegistry } from "./pages/registry";
import MainApp from "./MainApp.vue";
import { applyConfiguredTheme } from "./themes/theme";

class MainApplication {
  public start(): void {
    void (async (): Promise<void> => {
      await this.window.init();
      const configRpcObject = await this.window.getConfigServerRpcObject();
      const themeRpcObject = await this.window.getThemeServerRpcObject();
      await applyConfiguredTheme(configRpcObject, themeRpcObject);

      const app = createApp(MainApp);
      await this._useRouter(app, configRpcObject);
      app.mount("#app");
    })().catch((error: unknown) => {
      console.error("Application bootstrap failed:", error);
      const appRoot = document.getElementById("app");
      const message = appRoot?.querySelector("[data-bootstrap-message]");
      if (message) message.textContent = "Unable to start MagicHat.";
      appRoot?.classList.add("bootstrap-failed");
    });
  }

  private async _useRouter(
    app: App,
    configRpcObject: RemoteObject<ConfigServerRpcApi>,
  ): Promise<void> {
    const pages = gPageRegistry.getPages();
    const defaultPagePath = pages[0]?.path;
    if (defaultPagePath === undefined) throw new Error("No page is registered");
    const configJson = await configRpcObject.getJson(GLOBAL_CONFIG_KEY);
    const loadedConfig = globalConfigSerializer.fromJson(configJson);
    const activePagePath = pages.some((page) => page.path === loadedConfig.activePagePath)
      ? loadedConfig.activePagePath
      : defaultPagePath;
    await configRpcObject.setJson(GLOBAL_CONFIG_KEY, globalConfigSerializer.toJson({
      ...loadedConfig,
      activePagePath,
    }));

    const routes: RouteRecordRaw[] = pages.map((page) => ({
      path: page.path,
      name: page.path,
      component: page.component,
      meta: { title: page.title },
    }));

    routes.push({ path: "/", redirect: activePagePath });
    routes.push({ path: "/:pathMatch(.*)*", redirect: activePagePath });

    const router = createRouter({
      history: createWebHashHistory(),
      routes,
    });
    app.use(router);
    try {
      await router.isReady();
    } catch (error) {
      console.error("Router failed to become ready:", error);
    }
  }

  public readonly window = new Window();
}

export const gMainApplication = new MainApplication();

gMainApplication.start();

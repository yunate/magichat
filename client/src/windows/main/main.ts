import { createApp, type App } from "vue";
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import { Window } from "../window";
import "./pages";
import { gPageRegistry } from "./pages/registry";
import MainApp from "./MainApp.vue";

class MainApplication {
  public start(): void {
    void (async (): Promise<void> => {
      await this.window.init();

      const app = createApp(MainApp);
      await this._useRouter(app);
      app.mount("#app");
    })().catch((error: unknown) => {
      console.error("Application bootstrap failed:", error);
      const appRoot = document.getElementById("app");
      const message = appRoot?.querySelector("[data-bootstrap-message]");
      if (message) message.textContent = "Unable to start MagicHat.";
      appRoot?.classList.add("bootstrap-failed");
    });
  }

  private async _useRouter(app: App): Promise<void> {
    const routes: RouteRecordRaw[] = gPageRegistry.getPages().map((page) => ({
      path: page.path,
      name: page.path,
      component: page.component,
      meta: { title: page.title },
    }));

    routes.push({ path: "/", redirect: "/command" });
    routes.push({ path: "/:pathMatch(.*)*", redirect: "/command" });

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

import type { ConfigServerRpcApi } from "../../../../../common/config/configRpcApi";
import {
  GLOBAL_CONFIG_KEY,
  globalConfigSerializer,
} from "../../../../../common/config/global";
import type { RemoteObject } from "../../../../../common/ipc_bridge/rpc";
import type { ThemeDefinition } from "../../../../../common/theme";
import type { ThemeServerRpcApi } from "../../../../../common/theme/themeRpcApi";

const gThemeChangeHandlers = new Set<() => void>();

export function applyTheme(theme: ThemeDefinition): void {
  document.documentElement.dataset.theme = theme.name;
  document.querySelector("style[data-theme-stylesheet]")?.remove();
  if (theme.stylesheet !== null) {
    const style = document.createElement("style");
    style.dataset.themeStylesheet = theme.name;
    style.textContent = theme.stylesheet;
    document.head.append(style);
  }
  requestAnimationFrame(notifyThemeChangeHandlers);
}

export function registerThemeChangeHandler(handler: () => void): () => void {
  const registeredHandler = () => handler();
  gThemeChangeHandlers.add(registeredHandler);
  return () => gThemeChangeHandlers.delete(registeredHandler);
}

function notifyThemeChangeHandlers(): void {
  for (const handler of [...gThemeChangeHandlers]) handler();
}

export async function applyConfiguredTheme(
  configRpcObject: RemoteObject<ConfigServerRpcApi>,
  themeRpcObject: RemoteObject<ThemeServerRpcApi>,
): Promise<void> {
  const configJson = await configRpcObject.getJson(GLOBAL_CONFIG_KEY);
  const config = globalConfigSerializer.fromJson(configJson);
  const theme = await themeRpcObject.resolveTheme(config.theme.name);
  applyTheme(theme);
}

import type { MainWindowConfig } from "./global";

export interface ConfigServerRpcApi {
  getJson(configKey: string): string;
  setJson(configKey: string, json: string): void;
  setMainWindowBounds(bounds: MainWindowConfig): void;
}
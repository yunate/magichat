export interface ConfigServerRpcApi {
  getJson(configKey: string): string;
  setJson(configKey: string, json: string): void;
}
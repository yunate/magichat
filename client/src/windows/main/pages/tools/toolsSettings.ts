import {
  TOOLS_CONFIG_KEY,
  toolsConfigSerializer,
  type ToolsConfig,
} from "../../../../../../common/config/tools";
import { gMainApplication } from "../../main";

class ToolsSettings {
  public async getConfig(): Promise<ToolsConfig> {
    const config = this._config ?? await this._initialize();
    return structuredClone(config);
  }

  public async saveConfig(config: ToolsConfig): Promise<void> {
    const configJson = toolsConfigSerializer.toJson(config);
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    await configRpcObject.setJson(TOOLS_CONFIG_KEY, configJson);
    this._config = toolsConfigSerializer.fromJson(configJson);
  }

  private async _initialize(): Promise<ToolsConfig> {
    if (this._config !== null) return this._config;
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const configJson = await configRpcObject.getJson(TOOLS_CONFIG_KEY);
    this._config = toolsConfigSerializer.fromJson(configJson);
    return this._config;
  }

  private _config: ToolsConfig | null = null;
}

export const gToolsSettings = new ToolsSettings();

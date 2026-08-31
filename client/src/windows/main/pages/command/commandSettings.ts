import {
  COMMAND_CONFIG_KEY,
  commandConfigSerializer,
  type CommandConfig,
  type CommandRootConfig,
  type TerminalPlacement,
} from "../../../../../../common/config/command";
import { gMainApplication } from "../../main";

export type { TerminalPlacement } from "../../../../../../common/config/command";
export type { CommandRootConfig } from "../../../../../../common/config/command";

class CommandSettings {
  public async getConfig(): Promise<CommandConfig> {
    const config = this._config ?? await this._initialize();
    return structuredClone(config);
  }

  public async saveConfig(config: CommandConfig): Promise<void> {
    const configJson = commandConfigSerializer.toJson(config);
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    await configRpcObject.setJson(COMMAND_CONFIG_KEY, configJson);
    this._config = commandConfigSerializer.fromJson(configJson);
  }

  private async _initialize(): Promise<CommandConfig> {
    if (this._config !== null) return this._config;
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const configJson = await configRpcObject.getJson(COMMAND_CONFIG_KEY);
    this._config = commandConfigSerializer.fromJson(configJson);
    return this._config;
  }

  private _config: CommandConfig | null = null;
}

export const gCommandSettings = new CommandSettings();

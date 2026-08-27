import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ConfigServerRpcApi } from "../../../common/config/configRpcApi";
import { COMMAND_CONFIG_KEY } from "../../../common/config/command";
import { TASK_CENTER_CONFIG_KEY } from "../../../common/config/taskCenter";
import {
  getConfigSerializer,
  isConfigKey,
  type ConfigKey,
  type ConfigValue,
} from "../../../common/config/configType";
import type { ISerializer } from "../../../common/serializer";
import { gApplicationPaths } from "./applicationPaths";

const CONFIG_DIRECTORY = path.join(gApplicationPaths.dataDir, "config");

const CONFIG_FILES: Readonly<Record<ConfigKey, string>> = {
  [COMMAND_CONFIG_KEY]: "command.json",
  [TASK_CENTER_CONFIG_KEY]: "taskCenter.json",
};

export class ConfigManager implements ConfigServerRpcApi {
  public static getInstance(): ConfigManager {
    ConfigManager._instance ??= new ConfigManager();
    return ConfigManager._instance;
  }

  public constructor(configDirectory: string = CONFIG_DIRECTORY) {
    this._configDirectory = configDirectory;
    fs.mkdirSync(this._configDirectory, { recursive: true });
  }

  public get<K extends ConfigKey>(configKey: K): ConfigValue<K>;
  public get(configKey: string): unknown;
  public get(configKey: string): unknown {
    const valueSerializer = getConfigSerializer(configKey);
    return this._readConfig(configKey, valueSerializer);
  }

  public getJson(configKey: string): string {
    const valueSerializer = getConfigSerializer(configKey);
    const value = this._readConfig(configKey, valueSerializer);
    return valueSerializer.toJson(value);
  }

  public set<K extends ConfigKey>(configKey: K, value: ConfigValue<K>): void;
  public set<Value>(configKey: string, value: Value): void;
  public set(configKey: string, value: unknown): void {
    const valueSerializer = getConfigSerializer(configKey);
    this._writeConfig(configKey, valueSerializer.toJson(value));
  }

  public setJson(configKey: string, jsonString: string): void {
    const valueSerializer = getConfigSerializer(configKey);
    valueSerializer.fromJson(jsonString);
    this._writeConfig(configKey, jsonString);
  }

  private _readConfig<Value>(configKey: string, valueSerializer: ISerializer<Value>): Value {
    const file = this._configFile(configKey);
    let json: string;
    try {
      json = fs.readFileSync(file, "utf8");
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return this._getDefaultValue(valueSerializer);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[config] failed to read ${configKey} config: ${message}`);
      return this._getDefaultValue(valueSerializer);
    }

    try {
      return valueSerializer.fromJson(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[config] using default for invalid ${configKey} config: ${message}`);
      return this._getDefaultValue(valueSerializer);
    }
  }

  private _writeConfig(configKey: string, json: string): void {
    const file = this._configFile(configKey);
    const temporaryFile = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(this._configDirectory, { recursive: true });
      fs.writeFileSync(temporaryFile, `${json.trimEnd()}\n`, "utf8");
      fs.renameSync(temporaryFile, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[config] failed to write ${configKey} config: ${message}`);
      try {
        fs.rmSync(temporaryFile, { force: true });
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
        console.error(`[config] failed to clean temporary ${configKey} config: ${cleanupMessage}`);
      }
      throw new Error(`Failed to write ${configKey} config`);
    }
  }

  private _getDefaultValue<Value>(valueSerializer: ISerializer<Value>): Value {
    return valueSerializer.fromValue(valueSerializer.getDefault());
  }

  private _configFile(configKey: string): string {
    if (!isConfigKey(configKey)) {
      throw new Error(`Unknown config key: ${configKey}`);
    }
    return path.join(this._configDirectory, CONFIG_FILES[configKey]);
  }

  private static _instance: ConfigManager | null = null;
  private readonly _configDirectory: string;
}

export const gConfigManager = ConfigManager.getInstance();

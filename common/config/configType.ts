import type { ISerializer, SerializerValue } from "../serializer";
import {
  COMMAND_CONFIG_KEY,
  commandConfigSerializer,
} from "./command";
import {
  GLOBAL_CONFIG_KEY,
  globalConfigSerializer,
} from "./global";
import {
  TASK_CENTER_CONFIG_KEY,
  taskCenterConfigSerializer,
} from "./taskCenter";
import {
  TOOLS_CONFIG_KEY,
  toolsConfigSerializer,
} from "./tools";
import {
  UPDATE_CONFIG_KEY,
  updateConfigSerializer,
} from "./update";

const _CONFIG_TYPE_REGISTRY = {
  [COMMAND_CONFIG_KEY]: commandConfigSerializer,
  [GLOBAL_CONFIG_KEY]: globalConfigSerializer,
  [TASK_CENTER_CONFIG_KEY]: taskCenterConfigSerializer,
  [TOOLS_CONFIG_KEY]: toolsConfigSerializer,
  [UPDATE_CONFIG_KEY]: updateConfigSerializer,
} as const;

export type ConfigKey = keyof typeof _CONFIG_TYPE_REGISTRY;
export type ConfigValue<K extends ConfigKey = ConfigKey> =
  SerializerValue<(typeof _CONFIG_TYPE_REGISTRY)[K]>;

export function getConfigSerializer<K extends ConfigKey>(
  configKey: K,
): (typeof _CONFIG_TYPE_REGISTRY)[K];
export function getConfigSerializer(configKey: string): ISerializer<unknown>;
export function getConfigSerializer(configKey: string): ISerializer<unknown> {
  if (!isConfigKey(configKey)) throw new Error(`Unknown config key: ${configKey}`);
  return _CONFIG_TYPE_REGISTRY[configKey];
}

export function isConfigKey(value: unknown): value is ConfigKey {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(_CONFIG_TYPE_REGISTRY, value);
}
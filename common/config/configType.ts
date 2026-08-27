import type { ISerializer, SerializerValue } from "../serializer";
import {
  COMMAND_CONFIG_KEY,
  commandConfigSerializer,
} from "./command";
import {
  TASK_CENTER_CONFIG_KEY,
  taskCenterConfigSerializer,
} from "./taskCenter";

const _CONFIG_TYPE_REGISTRY = {
  [COMMAND_CONFIG_KEY]: commandConfigSerializer,
  [TASK_CENTER_CONFIG_KEY]: taskCenterConfigSerializer,
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
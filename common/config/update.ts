import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";

export const UPDATE_CONFIG_KEY = "update";
export const RANDOM_UPDATE_CHECK_DELAY = "random";
export const MIN_UPDATE_CHECK_DELAY_SECONDS = 1;
export const MAX_UPDATE_CHECK_DELAY_SECONDS = 3600;

export type UpdateCheckDelaySeconds = number | typeof RANDOM_UPDATE_CHECK_DELAY;

export type UpdateConfig = {
  isAutoUpdateEnabled: boolean;
  checkDelaySeconds: UpdateCheckDelaySeconds;
};

export function parseUpdateCheckDelaySeconds(value: string): UpdateCheckDelaySeconds | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === RANDOM_UPDATE_CHECK_DELAY) return RANDOM_UPDATE_CHECK_DELAY;
  if (!/^\d+$/.test(normalized)) return null;
  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds)
    && seconds >= MIN_UPDATE_CHECK_DELAY_SECONDS
    && seconds <= MAX_UPDATE_CHECK_DELAY_SECONDS
    ? seconds
    : null;
}

export class UpdateConfigSerializer extends ISerializer<UpdateConfig> {
  public getDefault(): UpdateConfig {
    return structuredClone(UpdateConfigSerializer._DEFAULT);
  }

  public override validate(value: unknown): asserts value is UpdateConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Update config must be a record");
    const expectedKeys = Object.keys(UpdateConfigSerializer._DEFAULT);
    if (!expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Update config is missing required properties");
    }
    if (typeof value.isAutoUpdateEnabled !== "boolean") {
      throw new Error("Update isAutoUpdateEnabled must be a boolean");
    }
    if (value.checkDelaySeconds !== RANDOM_UPDATE_CHECK_DELAY
      && (typeof value.checkDelaySeconds !== "number"
        || !Number.isSafeInteger(value.checkDelaySeconds)
        || value.checkDelaySeconds < MIN_UPDATE_CHECK_DELAY_SECONDS
        || value.checkDelaySeconds > MAX_UPDATE_CHECK_DELAY_SECONDS)) {
      throw new Error("Update checkDelaySeconds must be random or an integer from 1 to 3600");
    }
  }

  private static readonly _DEFAULT: UpdateConfig = {
    isAutoUpdateEnabled: true,
    checkDelaySeconds: RANDOM_UPDATE_CHECK_DELAY,
  };
}

export const updateConfigSerializer = new UpdateConfigSerializer();
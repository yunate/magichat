import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";

export const TOOLS_CONFIG_KEY = "tools";
export const TOOL_CATEGORIES = ["system", "text-data", "developer", "image"] as const;
export const TOOLS_GROUP_IDS = ["favorites", ...TOOL_CATEGORIES] as const;

export type ToolCategory = typeof TOOL_CATEGORIES[number];
export type ToolsGroupId = typeof TOOLS_GROUP_IDS[number];

export type ToolsConfig = {
  activeToolId: string | null;
  favoriteToolIds: string[];
  collapsedGroupIds: ToolsGroupId[];
};

export class ToolsConfigSerializer extends ISerializer<ToolsConfig> {
  public getDefault(): ToolsConfig {
    return structuredClone(ToolsConfigSerializer._DEFAULT);
  }

  public override fromValue(value: unknown): ToolsConfig {
    const normalized = ToolsConfigSerializer._addLegacyDefault(value);
    this.validate(normalized);
    return normalized;
  }

  public override validate(value: unknown): asserts value is ToolsConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Tools config must be a record");

    const expectedKeys = Object.keys(ToolsConfigSerializer._DEFAULT);
    if (!expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Tools config is missing required properties");
    }

    if (value.activeToolId !== null
      && (typeof value.activeToolId !== "string" || value.activeToolId.trim().length === 0)) {
      throw new Error("Tools activeToolId is invalid");
    }

    ToolsConfigSerializer._validateUniqueStrings(
      value.favoriteToolIds,
      "Tools favoriteToolIds",
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    ToolsConfigSerializer._validateUniqueStrings(
      value.collapsedGroupIds,
      "Tools collapsedGroupIds",
      isToolsGroupId,
    );
  }

  private static _validateUniqueStrings<Value extends string>(
    value: unknown,
    label: string,
    validateItem: (item: unknown) => item is Value,
  ): asserts value is Value[] {
    ValidateUtils.ensureArray(value, `${label} must be an array`);
    if (!value.every(validateItem)) throw new Error(`${label} contains an invalid value`);
    if (new Set(value).size !== value.length) throw new Error(`${label} must contain unique values`);
  }

  private static _addLegacyDefault(value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    ValidateUtils.ensureRecord(value);
    const record = value;
    const expectedKeys = Object.keys(ToolsConfigSerializer._DEFAULT);
    const actualKeys = Object.keys(record);
    if (actualKeys.length !== expectedKeys.length - 1
      || Object.prototype.hasOwnProperty.call(record, "activeToolId")
      || !expectedKeys.every((key) => key === "activeToolId"
        || Object.prototype.hasOwnProperty.call(record, key))) return value;
    return { ...record, activeToolId: ToolsConfigSerializer._DEFAULT.activeToolId };
  }

  private static readonly _DEFAULT: ToolsConfig = {
    activeToolId: null,
    favoriteToolIds: [],
    collapsedGroupIds: [],
  };
}

export function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string"
    && TOOL_CATEGORIES.some((category) => category === value);
}

export function isToolsGroupId(value: unknown): value is ToolsGroupId {
  return typeof value === "string"
    && TOOLS_GROUP_IDS.some((groupId) => groupId === value);
}

export const toolsConfigSerializer = new ToolsConfigSerializer();

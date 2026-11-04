import { MacroParser } from "../macroParser";
import { ISerializer } from "../serializer";
import { isScriptType, type ScriptType } from "../tasks/scriptTaskDefinition";
import type { TreeViewEntityData } from "../treeView";
import { ValidateUtils } from "../validator";

export const COMMAND_SCRIPT_EXTENSION_KEY = "script";

export type CodeViewPlacement = "follow" | "left" | "right" | "top" | "bottom" | "hide";

export type CommandParam = Readonly<{
  key: string;
  value: string;
  enabled: boolean;
}>;

export type CommandParamGroup = Readonly<{
  id: string;
  name: string;
  params: readonly CommandParam[];
}>;

export type CommandFolderData = Readonly<{
  selectedParamGroupId: string;
  paramGroups: readonly CommandParamGroup[];
}>;

export type CommandItemData = Readonly<{
  scriptType: ScriptType;
  content: string;
  codeViewPlacement?: CodeViewPlacement;
  isUAC?: boolean;
  selectedParamGroupId: string;
  paramGroups: readonly CommandParamGroup[];
}>;

export type CommandWorkspaceData = Readonly<{
  selectedEnvGroupId: string;
  envGroups: readonly CommandParamGroup[];
}>;

export class CommandWorkspaceDataSerializer extends ISerializer<CommandWorkspaceData> {
  public getDefault(): CommandWorkspaceData {
    return structuredClone(CommandWorkspaceDataSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is CommandWorkspaceData {
    ensureExactRecord(
      value,
      Object.keys(CommandWorkspaceDataSerializer._DEFAULT),
      "Command workspace data",
    );
    validateCommandParamGroups(value.envGroups, value.selectedEnvGroupId);
  }

  private static readonly _DEFAULT: CommandWorkspaceData = {
    selectedEnvGroupId: "default",
    envGroups: [{ id: "default", name: "default", params: [] }],
  };
}

export class CommandFolderDataSerializer extends ISerializer<CommandFolderData> {
  public getDefault(): CommandFolderData {
    return structuredClone(CommandFolderDataSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is CommandFolderData {
    migrateCommandParamEnabled(value);
    ensureExactRecord(value, Object.keys(CommandFolderDataSerializer._DEFAULT), "Command folder data");
    validateCommandParamGroups(value.paramGroups, value.selectedParamGroupId);
  }

  private static readonly _DEFAULT: CommandFolderData = {
    selectedParamGroupId: "folder",
    paramGroups: [{ id: "folder", name: "default params", params: [] }],
  };
}

export class CommandItemDataSerializer extends ISerializer<CommandItemData> {
  public fromEntityData(entityData: TreeViewEntityData): CommandItemData {
    const script = new Map(entityData.extends).get(COMMAND_SCRIPT_EXTENSION_KEY);
    if (entityData.dataJson === null) {
      return { ...this.getDefault(), content: script ?? "" };
    }
    const meta = CommandItemDataSerializer._parseMetaJson(entityData.dataJson);
    if (script === undefined) throw new Error("Command script extension is missing");
    return { ...meta, content: script };
  }

  public toEntityData(
    value: CommandItemData,
    extensions: TreeViewEntityData["extends"],
  ): TreeViewEntityData {
    this.validate(value);
    const meta: CommandItemMeta = {
      scriptType: value.scriptType,
      codeViewPlacement: value.codeViewPlacement,
      isUAC: value.isUAC,
      selectedParamGroupId: value.selectedParamGroupId,
      paramGroups: value.paramGroups,
    };
    const extensionMap = new Map(extensions);
    extensionMap.set(COMMAND_SCRIPT_EXTENSION_KEY, value.content);
    return {
      dataJson: JSON.stringify(meta),
      extends: [...extensionMap],
    };
  }

  public getDefault(): CommandItemData {
    return structuredClone(CommandItemDataSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is CommandItemData {
    migrateCommandParamEnabled(value);
    ensureExactRecord(value, Object.keys(CommandItemDataSerializer._DEFAULT), "Command item data", ["codeViewPlacement", "isUAC"]);
    if (!isScriptType(value.scriptType)) throw new Error("Command script type is invalid");
    if (value.codeViewPlacement !== undefined && !CommandItemDataSerializer._isCodeViewPlacement(value.codeViewPlacement)) {
      throw new Error("Command code view placement is invalid");
    }
    if (value.isUAC !== undefined) ValidateUtils.ensureBoolean(value.isUAC, "Command isUAC must be a boolean");
    ValidateUtils.ensureString(value.content, "Command content must be a string");
    validateCommandParamGroups(value.paramGroups, value.selectedParamGroupId);
  }

  private static _parseMetaJson(json: string): CommandItemMeta {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error("Command item data must be valid JSON");
    }
    migrateCommandParamEnabled(value);
    ensureExactRecord(
      value,
      Object.keys(CommandItemDataSerializer._META_DEFAULT),
      "Command item data",
      ["codeViewPlacement", "isUAC"],
    );
    if (!isScriptType(value.scriptType)) throw new Error("Command script type is invalid");
    if (value.codeViewPlacement !== undefined && !CommandItemDataSerializer._isCodeViewPlacement(value.codeViewPlacement)) {
      throw new Error("Command code view placement is invalid");
    }
    if (value.isUAC !== undefined) ValidateUtils.ensureBoolean(value.isUAC, "Command isUAC must be a boolean");
    ValidateUtils.ensureString(
      value.selectedParamGroupId,
      "Selected Command param group ID must be a string",
    );
    validateCommandParamGroups(value.paramGroups, value.selectedParamGroupId);
    return {
      scriptType: value.scriptType,
      codeViewPlacement: value.codeViewPlacement,
      isUAC: value.isUAC,
      selectedParamGroupId: value.selectedParamGroupId,
      paramGroups: value.paramGroups,
    };
  }

  private static _isCodeViewPlacement(value: unknown): value is CodeViewPlacement {
    return value === "follow" || value === "left" || value === "right" || value === "top"
      || value === "bottom" || value === "hide";
  }

  private static readonly _DEFAULT: CommandItemData = {
    scriptType: "powershell",
    content: "",
    codeViewPlacement: "follow",
    isUAC: false,
    selectedParamGroupId: "command",
    paramGroups: [{ id: "command", name: "default params", params: [] }],
  };

  private static readonly _META_DEFAULT: CommandItemMeta = {
    scriptType: "powershell",
    codeViewPlacement: "follow",
    isUAC: false,
    selectedParamGroupId: "command",
    paramGroups: [{ id: "command", name: "default params", params: [] }],
  };
}

type CommandItemMeta = Omit<CommandItemData, "content">;

class CommandParamGroupSerializer extends ISerializer<CommandParamGroup> {
  public getDefault(): CommandParamGroup {
    return structuredClone(CommandParamGroupSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is CommandParamGroup {
    ensureExactRecord(value, Object.keys(CommandParamGroupSerializer._DEFAULT), "Command param group");
    ValidateUtils.ensureString(value.id, "Command param group ID must be a string");
    ValidateUtils.ensureString(value.name, "Command param group name must be a string");
    if (value.id.length === 0) throw new Error("Command param group ID must not be empty");
    if (value.name.trim().length === 0) throw new Error("Command param group name must not be empty");
    validateCommandParams(value.params);
  }

  private static readonly _DEFAULT: CommandParamGroup = { id: "group", name: "Group", params: [] };
}

export class CommandParamSerializer extends ISerializer<CommandParam> {
  public getDefault(): CommandParam {
    return structuredClone(CommandParamSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is CommandParam {
    ensureExactRecord(value, Object.keys(CommandParamSerializer._DEFAULT), "Command param");
    ValidateUtils.ensureString(value.key, "Command param key must be a string");
    ValidateUtils.ensureString(value.value, "Command param value must be a string");
    ValidateUtils.ensureBoolean(value.enabled, "Command param enabled must be a boolean");
    if (!MacroParser.validateParamPairs(new Map([[value.key, ""]])).isValid) {
      throw new Error("Command param key is invalid");
    }
    MacroParser.extractKeys(value.value, true);
  }

  private static readonly _DEFAULT: CommandParam = { key: "key", value: "", enabled: true };
}

const COMMAND_PARAM_GROUP_SERIALIZER: ISerializer<CommandParamGroup> =
  new CommandParamGroupSerializer();

function validateCommandParamGroups(value: unknown, selectedGroupId: unknown): asserts value is CommandParamGroup[] {
  ValidateUtils.ensureString(selectedGroupId, "Selected Command param group ID must be a string");
  ValidateUtils.ensureArray(value, "Command param groups must be an array");
  if (value.length === 0) throw new Error("Command must contain at least one param group");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const group of value) {
    COMMAND_PARAM_GROUP_SERIALIZER.validate(group);
    if (ids.has(group.id)) throw new Error("Command param group IDs must be unique");
    if (names.has(group.name)) throw new Error("Command param group names must be unique");
    ids.add(group.id);
    names.add(group.name);
  }
  if (!ids.has(selectedGroupId)) throw new Error("Selected Command param group does not exist");
}

function validateCommandParams(value: unknown): asserts value is CommandParam[] {
  ValidateUtils.ensureArray(value, "Command params must be an array");
  const keys = new Set<string>();
  for (const param of value) {
    commandParamSerializer.validate(param);
    if (keys.has(param.key)) throw new Error("Command param keys must be unique");
    keys.add(param.key);
  }
}

function migrateCommandParamEnabled(value: unknown): void {
  if (!isMutableRecord(value) || !Array.isArray(value.paramGroups)) return;
  for (const group of value.paramGroups) {
    if (!isMutableRecord(group) || !Array.isArray(group.params)) continue;
    for (const param of group.params) {
      if (isMutableRecord(param) && !("enabled" in param)) param.enabled = true;
    }
  }
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureExactRecord(
  value: unknown,
  keys: readonly string[],
  description: string,
  optionalKeys: readonly string[] = [],
): asserts value is Record<string, unknown> {
  ValidateUtils.ensureRecord(value);
  const actualKeys = Object.keys(value);
  if (actualKeys.some((key) => !keys.includes(key))
    || !keys.every((key) => actualKeys.includes(key) || optionalKeys.includes(key))) {
    throw new Error(`${description} has an invalid schema`);
  }
}

export const commandFolderDataSerializer: ISerializer<CommandFolderData> =
  new CommandFolderDataSerializer();
export const commandItemDataSerializer: CommandItemDataSerializer =
  new CommandItemDataSerializer();
export const commandParamSerializer: ISerializer<CommandParam> =
  new CommandParamSerializer();
export const commandWorkspaceDataSerializer: ISerializer<CommandWorkspaceData> =
  new CommandWorkspaceDataSerializer();

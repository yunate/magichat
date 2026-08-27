import { ISerializer } from "../serializer";
import { MacroParser } from "../macroParser";
import { ValidateUtils } from "../validator";

export const SCRIPT_TASK_KEY = "script";

export const SCRIPT_TYPES = ["powershell", "bash", "node", "python", "cmd"] as const;
export type ScriptType = (typeof SCRIPT_TYPES)[number];

export interface ScriptTaskInfo {
  scriptType: ScriptType;
  scriptContent: string;
  variables: Record<string, string>;
  exitCode: number | null;
}

export interface ScriptCreateParams {
  scriptType: ScriptType;
  scriptContent: string;
  variables: Record<string, string>;
}

export interface ScriptTemplate {
  scriptType: ScriptType;
  scriptContent: string;
  canResume: boolean;
  variables: Record<string, string>;
}

export class ScriptTaskInfoSerializer extends ISerializer<ScriptTaskInfo> {
  public getDefault(): ScriptTaskInfo {
    return {
      scriptType: "powershell",
      scriptContent: "",
      variables: {},
      exitCode: null,
    };
  }

  public validate(value: unknown): asserts value is ScriptTaskInfo {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Script task info must be a record");
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureString(value.scriptContent);
    validateScriptVariables(value.variables);
    if (value.exitCode !== null && !isFiniteInteger(value.exitCode)) {
      throw new Error("Script task exitCode must be a finite integer or null");
    }
  }
}

class ScriptCreateParamsSerializer extends ISerializer<ScriptCreateParams> {
  public getDefault(): ScriptCreateParams {
    return {
      scriptType: "powershell",
      scriptContent: "Write-Output \"\"",
      variables: {},
    };
  }

  public validate(value: unknown): asserts value is ScriptCreateParams {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Task create params must be a record");
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureNonBlankString(value.scriptContent);
    validateScriptVariables(value.variables);
  }
}

export class ScriptTemplateSerializer extends ISerializer<ScriptTemplate> {
  public getDefault(): ScriptTemplate {
    return {
      scriptType: "powershell",
      scriptContent: "",
      canResume: false,
      variables: {},
    };
  }

  public validate(value: unknown): asserts value is ScriptTemplate {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Script template must be a record");
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureString(value.scriptContent);
    ValidateUtils.ensureBoolean(value.canResume);
    validateScriptVariables(value.variables);
  }
}

function validateScriptVariables(
  value: unknown,
): asserts value is Record<string, string> {
  ValidateUtils.ensureRecord(value);
  if (Array.isArray(value)) throw new Error("Script variables must be a record");
  const paramPairs = new Map<string, string>();
  for (const [key, variableValue] of Object.entries(value)) {
    ValidateUtils.ensureString(variableValue, "Script variable value must be a string");
    paramPairs.set(key, variableValue);
  }
  MacroParser.replaceMacrosInText("", paramPairs);
}

export function isScriptType(value: unknown): value is ScriptType {
  return value === "powershell"
    || value === "bash"
    || value === "node"
    || value === "python"
    || value === "cmd";
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export const scriptTaskInfoSerializer: ISerializer<ScriptTaskInfo> =
  new ScriptTaskInfoSerializer();
export const tasksCreateParamsSerializer: ISerializer<ScriptCreateParams> =
  new ScriptCreateParamsSerializer();
export const scriptTemplateSerializer: ISerializer<ScriptTemplate> =
  new ScriptTemplateSerializer();
import { ISerializer } from "../serializer";
import { isScriptType, type ScriptType } from "../tasks/scriptTaskDefinition";
import { TreeViewPath } from "../treeView/treeViewPath";
import { ValidateUtils } from "../validator";

export type TerminalRunRequest = Readonly<{
  scriptId: string;
  commandPath: string;
  scriptType: ScriptType;
  scriptContent: string;
}>;

export class TerminalRunRequestSerializer extends ISerializer<TerminalRunRequest> {
  public getDefault(): TerminalRunRequest {
    return structuredClone(TerminalRunRequestSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is TerminalRunRequest {
    ValidateUtils.ensureRecord(value);
    const expectedKeys = Object.keys(TerminalRunRequestSerializer._DEFAULT);
    const actualKeys = Object.keys(value);
    if (Array.isArray(value)
      || !expectedKeys.every((key) => actualKeys.includes(key))) {
      throw new Error("Terminal run request has an invalid schema");
    }
    ValidateUtils.ensureNonBlankString(value.scriptId);
    if (!TerminalRunRequestSerializer._SCRIPT_ID_PATTERN.test(value.scriptId)) {
      throw new Error("Terminal script ID must be a UUID v4");
    }
    ValidateUtils.ensureNonBlankString(value.commandPath);
    TreeViewPath.normalize(value.commandPath, "Terminal Command path");
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureString(value.scriptContent);
    if (value.scriptContent.length > TerminalRunRequestSerializer._MAX_SCRIPT_CONTENT_LENGTH) {
      throw new Error("Script content is too large");
    }
  }

  private static readonly _DEFAULT: TerminalRunRequest = {
    scriptId: "00000000-0000-4000-8000-000000000000",
    commandPath: "/",
    scriptType: "powershell",
    scriptContent: "",
  };
  private static readonly _SCRIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly _MAX_SCRIPT_CONTENT_LENGTH = 1024 * 1024;
}

export const terminalRunRequestSerializer: ISerializer<TerminalRunRequest> = new TerminalRunRequestSerializer();
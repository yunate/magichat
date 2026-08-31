import type { ScriptType } from "../../../common/tasks/scriptTaskDefinition";

export type ScriptExecution = {
  readonly command: string;
  readonly args: readonly string[];
  readonly extension: string;
  readonly content: string;
};

export function createScriptExecution(
  scriptType: ScriptType,
  scriptContent: string,
  scriptFile: string,
): ScriptExecution {
  const content = encodeScript(scriptType, scriptContent);
  const isWindows = process.platform === "win32";
  switch (scriptType) {
    case "powershell":
      if (!isWindows) {
        return {
          command: "pwsh",
          args: ["-File", scriptFile],
          extension: ".ps1",
          content,
        };
      }
      return {
        command: "powershell",
        args: [
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }; & '${scriptFile.replace(/'/g, "''")}'; exit $LASTEXITCODE`,
        ],
        extension: ".ps1",
        content,
      };
    case "node":
      return { command: "node", args: [scriptFile], extension: ".js", content };
    case "python":
      return { command: "python", args: [scriptFile], extension: ".py", content };
    case "cmd":
      return { command: "cmd", args: ["/c", scriptFile], extension: ".bat", content };
    default:
      return assertNever(scriptType);
  }
}

export function getScriptExtension(scriptType: ScriptType): string {
  switch (scriptType) {
    case "powershell": return ".ps1";
    case "node": return ".js";
    case "python": return ".py";
    case "cmd": return ".bat";
    default: return assertNever(scriptType);
  }
}

function encodeScript(scriptType: ScriptType, scriptContent: string): string {
  if (scriptType !== "powershell" || !hasNonAscii(scriptContent)) return scriptContent;
  return `\uFEFF${scriptContent}`;
}

function hasNonAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return true;
  }
  return false;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled script type: ${String(value)}`);
}
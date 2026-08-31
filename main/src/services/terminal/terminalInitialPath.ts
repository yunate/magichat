import path from "node:path";
import { DEFAULT_COMMAND_TERMINAL_INITIAL_PATH } from "../../../../common/config/command";
import { ValidateUtils } from "../../../../common/validator";
import { gTerminalRuntimeManager } from "./terminalRuntimeManager";

export function resolveTerminalInitialPath(value: unknown): string {
  ValidateUtils.ensureNonBlankString(value, "Terminal initial path must not be blank");
  if (value === DEFAULT_COMMAND_TERMINAL_INITIAL_PATH) {
    return gTerminalRuntimeManager.temporaryDirectory;
  }
  if (!path.isAbsolute(value)) throw new Error("Terminal initial path must be absolute");
  return path.resolve(value);
}
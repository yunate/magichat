import { ValidateUtils } from "../validator";

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:\//;
const WINDOWS_ROOT_PATH_PATTERN = /^[a-zA-Z]:\/$/;
const INVALID_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export class TreeViewPath {
  public static ensureName(value: unknown, description: string): asserts value is string {
    ValidateUtils.ensureNonBlankString(value, `${description} must be a nonblank string`);
    if (value === "." || value === ".." || value.startsWith("__")) {
      throw new Error(`${description} is reserved`);
    }
    if (value.endsWith(".") || value.endsWith(" ") || INVALID_NAME_PATTERN.test(value)) {
      throw new Error(`${description} contains invalid characters`);
    }
    if (RESERVED_WINDOWS_NAMES.test(value)) throw new Error(`${description} is reserved`);
    if (value.length > 195) throw new Error(`${description} is too long`);
  }

  public static normalize(value: unknown, description: string): string {
    ValidateUtils.ensureNonBlankString(value, `${description} must be a nonblank string`);
    const normalized = value.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
    if (!WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized) && !normalized.startsWith("/")) {
      throw new Error(`${description} must be an absolute path`);
    }
    if (normalized.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new Error(`${description} must be normalized`);
    }
    return normalized.length > 1
      && !WINDOWS_ROOT_PATH_PATTERN.test(normalized)
      && normalized.endsWith("/")
      ? normalized.slice(0, -1)
      : normalized;
  }
}

import { ValidateUtils } from "../validator";

const INVALID_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function ensureTreeViewName(value: unknown, description: string): asserts value is string {
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

export function ensureTreeViewWorkspaceName(
  value: unknown,
  description: string,
): asserts value is string {
  ensureTreeViewName(value, description);
  if (value.includes("/") || value.includes("\\")) {
    throw new Error(`${description} must be one path segment`);
  }
}

export function ensureTreeViewPath(value: unknown, description: string): asserts value is string {
  ValidateUtils.ensureNonBlankString(value, `${description} must be a nonblank string`);
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) {
    throw new Error(`${description} must be a normalized relative path`);
  }
  const segments = value.split("/");
  for (const segment of segments) ensureTreeViewName(segment, `${description} segment`);
}

export function ensureTreeViewNestedPath(
  value: unknown,
  description: string,
): asserts value is string {
  ensureTreeViewPath(value, description);
  if (!value.includes("/")) throw new Error(`${description} must include a parent folder`);
}

export function getTreeViewParentPath(path: string): string | null {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex < 0 ? null : path.slice(0, separatorIndex);
}
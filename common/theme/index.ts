export const DEFAULT_THEME_NAME = "dark";

export type ThemeDefinition = {
  name: string;
  stylesheet: string | null;
};

export function isThemeName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

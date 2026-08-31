import type { ThemeDefinition } from ".";

export interface ThemeServerRpcApi {
  listThemes(): readonly string[];
  resolveTheme(name: string): ThemeDefinition;
}

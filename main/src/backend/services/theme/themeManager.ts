import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_THEME_NAME,
  isThemeName,
  type ThemeDefinition,
} from "../../../../../common/theme";
import type { ThemeServerRpcApi } from "../../../../../common/theme/themeRpcApi";
import { gApplicationPaths } from "../../../infra/applicationPaths";

const THEME_STYLESHEET_FILES = [
  "shared.css",
  "overlay.css",
  "window.css",
  "command.css",
  "editor.css",
  "tools.css",
  "terminal.css",
  "metrics.css",
] as const;

export class ThemeManager implements ThemeServerRpcApi {
  public listThemes(): readonly string[] {
    const themeNames = fs.readdirSync(gApplicationPaths.themesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isThemeName(entry.name))
      .map((entry) => entry.name)
      .filter((name) => name !== DEFAULT_THEME_NAME)
      .sort((left, right) => left.localeCompare(right));
    return [DEFAULT_THEME_NAME, ...themeNames];
  }

  public resolveTheme(name: string): ThemeDefinition {
    if (!isThemeName(name)) throw new Error("Theme name is invalid");
    if (name === DEFAULT_THEME_NAME) return ThemeManager._defaultTheme();

    const themeDirectory = path.join(gApplicationPaths.themesDir, name);
    if (!fs.existsSync(themeDirectory)) return ThemeManager._defaultTheme();
    if (!fs.statSync(themeDirectory).isDirectory()) return ThemeManager._defaultTheme();

    const stylesheet = THEME_STYLESHEET_FILES
      .map((fileName) => fs.readFileSync(path.join(themeDirectory, fileName), "utf8"))
      .join("\n");
    return { name, stylesheet };
  }

  private static _defaultTheme(): ThemeDefinition {
    return { name: DEFAULT_THEME_NAME, stylesheet: null };
  }
}

export const gThemeManager = new ThemeManager();

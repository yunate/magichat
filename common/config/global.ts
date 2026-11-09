import { ISerializer } from "../serializer";
import { isThemeName } from "../theme";
import { ValidateUtils } from "../validator";

export const GLOBAL_CONFIG_KEY = "global";
export const MAIN_WINDOW_MIN_WIDTH = 960;
export const MAIN_WINDOW_MIN_HEIGHT = 640;
export type MainWindowConfig = {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
};

export type ThemeConfig = {
  name: string;
};

export type GlobalConfig = {
  activePagePath: string;
  mainWindow: MainWindowConfig;
  theme: ThemeConfig;
};

export class GlobalConfigSerializer extends ISerializer<GlobalConfig> {
  public getDefault(): GlobalConfig {
    return structuredClone(GlobalConfigSerializer._DEFAULT);
  }

  public override fromValue(value: unknown): GlobalConfig {
    const normalized = GlobalConfigSerializer._addLegacyDefault(value);
    this.validate(normalized);
    return normalized;
  }

  public override validate(value: unknown): asserts value is GlobalConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Global config must be a record");
    GlobalConfigSerializer._validateKeys(
      value,
      GlobalConfigSerializer._DEFAULT,
      "Global config",
    );
    if (typeof value.activePagePath !== "string" || !value.activePagePath.startsWith("/")) {
      throw new Error("Global activePagePath is invalid");
    }
    GlobalConfigSerializer._validateMainWindow(value.mainWindow);
    GlobalConfigSerializer._validateTheme(value.theme);
  }

  private static _validateMainWindow(value: unknown): asserts value is MainWindowConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Global mainWindow config must be a record");
    GlobalConfigSerializer._validateKeys(
      value,
      GlobalConfigSerializer._DEFAULT_MAIN_WINDOW,
      "Global mainWindow config",
    );
    GlobalConfigSerializer._validateDimension(value.width, MAIN_WINDOW_MIN_WIDTH, "width");
    GlobalConfigSerializer._validateDimension(value.height, MAIN_WINDOW_MIN_HEIGHT, "height");
    if ((value.x === null) !== (value.y === null)) {
      throw new Error("Global mainWindow x and y must both be set or both be null");
    }
    if (value.x !== null) GlobalConfigSerializer._validatePosition(value.x, "x");
    if (value.y !== null) GlobalConfigSerializer._validatePosition(value.y, "y");
  }

  private static _validateTheme(value: unknown): asserts value is ThemeConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Global theme config must be a record");
    GlobalConfigSerializer._validateKeys(
      value,
      GlobalConfigSerializer._DEFAULT_THEME,
      "Global theme config",
    );
    if (!isThemeName(value.name)) throw new Error("Global theme name is invalid");
  }

  private static _validateKeys(
    value: Record<string, unknown>,
    defaultValue: object,
    label: string,
  ): void {
    const expectedKeys = Object.keys(defaultValue);
    if (!expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error(`${label} is missing required properties`);
    }
  }

  private static _validateDimension(value: unknown, minimum: number, name: string): void {
    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
      throw new Error(`Global mainWindow ${name} must be an integer of at least ${minimum}`);
    }
  }

  private static _validatePosition(value: unknown, name: string): void {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`Global mainWindow ${name} must be an integer`);
    }
  }

  private static _addLegacyDefault(value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    ValidateUtils.ensureRecord(value);
    const record = value;
    const expectedKeys = Object.keys(GlobalConfigSerializer._DEFAULT);
    const actualKeys = Object.keys(record);
    if (actualKeys.length !== expectedKeys.length - 1
      || Object.prototype.hasOwnProperty.call(record, "activePagePath")
      || !expectedKeys.every((key) => key === "activePagePath"
        || Object.prototype.hasOwnProperty.call(record, key))) return value;
    return { ...record, activePagePath: GlobalConfigSerializer._DEFAULT.activePagePath };
  }

  private static readonly _DEFAULT_MAIN_WINDOW: MainWindowConfig = {
    width: 1160,
    height: 720,
    x: null,
    y: null,
  };

  private static readonly _DEFAULT_THEME: ThemeConfig = {
    name: "dark",
  };

  private static readonly _DEFAULT: GlobalConfig = {
    activePagePath: "/command",
    mainWindow: GlobalConfigSerializer._DEFAULT_MAIN_WINDOW,
    theme: GlobalConfigSerializer._DEFAULT_THEME,
  };
}

export const globalConfigSerializer = new GlobalConfigSerializer();

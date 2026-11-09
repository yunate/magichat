import { ISerializer } from "./serializer";
import { ValidateUtils } from "./validator";

export type ApplicationPathsOptions = Readonly<{
  isPackaged: boolean;
  appPath: string;
  userDataDir: string;
  executablePath: string;
  resourcesPath: string;
  localAppDataDirectory: string;
}>;

class ApplicationPathsOptionsSerializer extends ISerializer<ApplicationPathsOptions> {
  public getDefault(): ApplicationPathsOptions {
    return structuredClone(ApplicationPathsOptionsSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is ApplicationPathsOptions {
    ValidateUtils.ensureRecord(value);
    const expectedKeys = Object.keys(ApplicationPathsOptionsSerializer._DEFAULT);
    const actualKeys = Object.keys(value);
    if (Array.isArray(value)
      || !expectedKeys.every((key) => actualKeys.includes(key))) {
      throw new Error("Application paths options have an invalid schema");
    }
    ValidateUtils.ensureBoolean(value.isPackaged, "Application packaged flag is invalid");
    for (const key of expectedKeys) {
      if (key !== "isPackaged") ValidateUtils.ensureString(value[key], `Application path ${key} is invalid`);
    }
  }

  private static readonly _DEFAULT: ApplicationPathsOptions = {
    isPackaged: false,
    appPath: "",
    userDataDir: "",
    executablePath: "",
    resourcesPath: "",
    localAppDataDirectory: "",
  };
}

export const applicationPathsOptionsSerializer: ISerializer<ApplicationPathsOptions> = new ApplicationPathsOptionsSerializer();
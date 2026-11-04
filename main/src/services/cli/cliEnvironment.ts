import path from "node:path";
import {
  CLI_BRIDGE_PIPE_PATH_ENVIRONMENT_KEY,
  CLI_NODE_HELPER_PATH_ENVIRONMENT_KEY,
  CLI_PAGE_COMMAND,
  CLI_PAGE_ENVIRONMENT_KEY,
  CLI_PAGE_TASK_CENTER,
  CLI_PATH_ENVIRONMENT_KEY,
  CLI_TASK_ID_ENVIRONMENT_KEY,
  getCliBridgePipePath,
} from "../../../../common/cli";
import { gApplicationPaths } from "../../infra/applicationPaths";

type CliExecutionContext = Readonly<{
  page: typeof CLI_PAGE_COMMAND;
}> | Readonly<{
  page: typeof CLI_PAGE_TASK_CENTER;
  taskId: string;
}>;

class CliEnvironment {
  public create(
    environment: Readonly<NodeJS.ProcessEnv>,
    context: CliExecutionContext,
  ): NodeJS.ProcessEnv {
    const paths = gApplicationPaths;
    const sanitizedEnvironment = this._removeCliExecutionContext(environment);
    return {
      ...sanitizedEnvironment,
      [CLI_BRIDGE_PIPE_PATH_ENVIRONMENT_KEY]: getCliBridgePipePath(paths.userDataDir),
      [CLI_PATH_ENVIRONMENT_KEY]: paths.cliExecutablePath,
      [CLI_PAGE_ENVIRONMENT_KEY]: context.page,
      ...(context.page === CLI_PAGE_TASK_CENTER
        ? { [CLI_TASK_ID_ENVIRONMENT_KEY]: context.taskId }
        : {}),
      ...this._createPathHelperEnvironment(sanitizedEnvironment, paths.cliCommandDirectoryPath),
      ...this._createNodeHelperEnvironment(sanitizedEnvironment, paths.cliNodeHelperPath),
      ...this._createPythonHelperEnvironment(sanitizedEnvironment, paths.cliPythonDirectoryPath),
    };
  }

  private _removeCliExecutionContext(environment: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(environment)) {
      const normalizedKey = key.toUpperCase();
      if (normalizedKey === CLI_PAGE_ENVIRONMENT_KEY
        || normalizedKey === CLI_TASK_ID_ENVIRONMENT_KEY) continue;
      result[key] = value;
    }
    return result;
  }

  private _createPathHelperEnvironment(
    environment: Readonly<NodeJS.ProcessEnv>,
    commandDirectoryPath: string,
  ): NodeJS.ProcessEnv {
    const pathKey = Object.keys(environment)
      .find((key) => key.toUpperCase() === "PATH") ?? "PATH";
    const existingPath = environment[pathKey];
    return {
      [pathKey]: existingPath === undefined || existingPath.length === 0
        ? commandDirectoryPath
        : `${commandDirectoryPath}${path.delimiter}${existingPath}`,
    };
  }

  private _createNodeHelperEnvironment(
    environment: Readonly<NodeJS.ProcessEnv>,
    nodeHelperPath: string,
  ): NodeJS.ProcessEnv {
    const nodeHelperRequirePath = nodeHelperPath.replaceAll("\\", "/");
    const nodeHelperOption = `--require="${nodeHelperRequirePath}"`;
    const existingNodeOptions = environment.NODE_OPTIONS;
    return {
      [CLI_NODE_HELPER_PATH_ENVIRONMENT_KEY]: nodeHelperPath,
      NODE_OPTIONS: existingNodeOptions === undefined || existingNodeOptions.trim().length === 0
        ? nodeHelperOption : `${existingNodeOptions} ${nodeHelperOption}`,
    };
  }

  private _createPythonHelperEnvironment(
    environment: Readonly<NodeJS.ProcessEnv>,
    pythonDirectoryPath: string,
  ): NodeJS.ProcessEnv {
    const existingPythonPath = environment.PYTHONPATH;
    return {
      PYTHONPATH: existingPythonPath === undefined || existingPythonPath.trim().length === 0
        ? pythonDirectoryPath
        : `${pythonDirectoryPath}${path.delimiter}${existingPythonPath}`,
    };
  }

}

export const gCliEnvironment = new CliEnvironment();
import { app } from "electron";
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

export function createCliEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
  context: CliExecutionContext,
): NodeJS.ProcessEnv {
  const sanitizedEnvironment = removeCliExecutionContext(environment);
  return {
    ...sanitizedEnvironment,
    [CLI_BRIDGE_PIPE_PATH_ENVIRONMENT_KEY]: getCliBridgePipePath(app.getPath("userData")),
    [CLI_PATH_ENVIRONMENT_KEY]: gApplicationPaths.cliExecutablePath,
    [CLI_PAGE_ENVIRONMENT_KEY]: context.page,
    ...(context.page === CLI_PAGE_TASK_CENTER
      ? { [CLI_TASK_ID_ENVIRONMENT_KEY]: context.taskId }
      : {}),
    ...createPathHelperEnvironment(sanitizedEnvironment),
    ...createNodeHelperEnvironment(sanitizedEnvironment),
    ...createPythonHelperEnvironment(sanitizedEnvironment),
  };
}

function removeCliExecutionContext(
  environment: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(environment)) {
    const normalizedKey = key.toUpperCase();
    if (normalizedKey === CLI_PAGE_ENVIRONMENT_KEY
      || normalizedKey === CLI_TASK_ID_ENVIRONMENT_KEY) continue;
    result[key] = value;
  }
  return result;
}

function createPathHelperEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(environment)
    .find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const existingPath = environment[pathKey];
  return {
    [pathKey]: existingPath === undefined || existingPath.length === 0
      ? gApplicationPaths.cliCommandDirectoryPath
      : `${gApplicationPaths.cliCommandDirectoryPath}${path.delimiter}${existingPath}`,
  };
}

function createNodeHelperEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const nodeHelperRequirePath = gApplicationPaths.cliNodeHelperPath.replaceAll("\\", "/");
  const nodeHelperOption = `--require="${nodeHelperRequirePath}"`;
  const existingNodeOptions = environment.NODE_OPTIONS;
  return {
    [CLI_NODE_HELPER_PATH_ENVIRONMENT_KEY]: gApplicationPaths.cliNodeHelperPath,
    NODE_OPTIONS: existingNodeOptions === undefined || existingNodeOptions.trim().length === 0
      ? nodeHelperOption : `${existingNodeOptions} ${nodeHelperOption}`,
  };
}

function createPythonHelperEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const existingPythonPath = environment.PYTHONPATH;
  return {
    PYTHONPATH: existingPythonPath === undefined || existingPythonPath.trim().length === 0
      ? gApplicationPaths.cliPythonDirectoryPath
      : `${gApplicationPaths.cliPythonDirectoryPath}${path.delimiter}${existingPythonPath}`,
  };
}
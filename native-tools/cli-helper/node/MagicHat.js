const { spawnSync } = require("node:child_process");
const path = require("node:path");

const SCRIPT_COMMANDS = Object.freeze({
  powershell: Object.freeze([
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "..", "powershell", "Invoke-MagicHatPowerShellScript.ps1"),
  ]),
  node: Object.freeze(["node"]),
  python: Object.freeze(["python"]),
  cmd: Object.freeze(["cmd.exe", "/c"]),
});

function mhcall(path) {
  ensureNonBlankString(path, "Command path");
  const description = runCli(["prepare", path], "MagicHat command preparation", "pipe").trim();
  const parts = description.split("|");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("MagicHat command preparation returned an invalid run description.");
  }

  const [scriptType, scriptPath, commandPath] = parts;
  const command = SCRIPT_COMMANDS[scriptType];
  if (command === undefined) throw new Error(`Unsupported script type: ${scriptType}`);
  run(
    command[0],
    [...command.slice(1), scriptPath],
    `MagicHat ${scriptType} command`,
    "inherit",
    { ...process.env, MAGICHAT_CLI_COMMAND_PATH: commandPath },
  );
}

function mhsetenv(updates, targetPath) {
  if (updates === null || typeof updates !== "object" || Array.isArray(updates)) {
    throw new TypeError("Environment updates must be an object.");
  }
  const entries = Object.entries(updates);
  if (entries.length === 0) throw new TypeError("Environment updates must not be empty.");
  const args = ["set-env"];
  if (targetPath !== undefined) {
    ensureNonBlankString(targetPath, "Macro path");
    args.push(`--path=${targetPath}`);
  }
  for (const [key, value] of entries) {
    ensureNonBlankString(key, "Environment variable name");
    if (typeof value !== "string") throw new TypeError(`Environment variable ${key} must be a string.`);
    args.push(key, value);
  }
  runCli(args, "MagicHat environment update");
}

function mhgetenv(key, targetPath) {
  ensureNonBlankString(key, "Environment variable name");
  const args = ["get-env"];
  if (targetPath !== undefined) {
    ensureNonBlankString(targetPath, "Macro path");
    args.push(`--path=${targetPath}`);
  }
  args.push(key, "--json");
  return JSON.parse(runCli(args, "MagicHat environment read", "pipe"));
}

function mhsettaskstate(text = "") {
  if (typeof text !== "string") throw new TypeError("Task state must be a string.");
  runCli(["set-task-state", text], "MagicHat task state update");
}

function mhsettasktitle(title = "") {
  if (typeof title !== "string") throw new TypeError("Task title must be a string.");
  runCli(["set-task-title", title], "MagicHat task title update");
}

function mhsettaskdetail(details) {
  if (!Array.isArray(details)) throw new TypeError("Task details must be an array.");
  for (const detail of details) ensureNonBlankString(detail, "Task detail");
  runCli(["set-task-detail", ...details], "MagicHat task detail update");
}

function runCli(args, description, stdio = "inherit") {
  const cliPath = process.env.MAGICHAT_CLI;
  ensureNonBlankString(cliPath, "MAGICHAT_CLI");
  return run(cliPath, args, description, stdio);
}

function run(command, args, description, stdio = "inherit", environment = process.env) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: environment,
    stdio,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const failureDetail = typeof result.stderr === "string" ? result.stderr.trim() : "";
    if (failureDetail.length > 0) throw new Error(`${description} failed: ${failureDetail}`);
    throw new Error(`${description} failed with exit code ${result.status ?? "unknown"}.`);
  }
  return result.stdout ?? "";
}

function ensureNonBlankString(value, description) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${description} must be a non-blank string.`);
  }
}

globalThis.mhcall = mhcall;
globalThis.mhsetenv = mhsetenv;
globalThis.mhgetenv = mhgetenv;
globalThis.mhsettaskstate = mhsettaskstate;
globalThis.mhsettasktitle = mhsettasktitle;
globalThis.mhsettaskdetail = mhsettaskdetail;
module.exports = { mhcall, mhsetenv, mhgetenv, mhsettaskstate, mhsettasktitle, mhsettaskdetail };
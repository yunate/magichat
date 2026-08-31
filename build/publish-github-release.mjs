import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = "ddmagichat/magichat-release";
const releaseTag = "latest";
const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appVersion = fs.readFileSync(path.join(rootDirectory, "VERSION"), "utf8").trim();

if (!/^\d+\.\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error("VERSION must contain four numeric components, for example 1.0.0.0.");
}

const installerName = `MagicHat Setup ${appVersion}.exe`;
const installerPath = path.join(rootDirectory, "dist-release", installerName);

if (!fs.existsSync(installerPath) || !fs.statSync(installerPath).isFile()) {
  throw new Error(`Packaged installer does not exist: ${installerPath}`);
}

function runGitHubCli(args) {
  const result = spawnSync("gh", args, {
    cwd: rootDirectory,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error !== undefined) {
    throw new Error(`Unable to run GitHub CLI: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`GitHub CLI exited with code ${result.status ?? "unknown"}.`);
  }
}

runGitHubCli(["auth", "status"]);
runGitHubCli(["release", "view", releaseTag, "--repo", repository]);

console.log(`Publishing ${installerName} to ${repository} release ${releaseTag}.`);
runGitHubCli([
  "release",
  "upload",
  releaseTag,
  installerPath,
  "--repo",
  repository,
  "--clobber",
]);
console.log(`Published ${installerName}.`);
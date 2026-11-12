import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = "ddmagichat/magichat-release";
const releaseTag = "latest";
const releaseTitlePrefix = "MagicHat Setup ";
const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appVersion = fs.readFileSync(path.join(rootDirectory, "VERSION"), "utf8").trim();
const versionPattern = /^\d+\.\d+\.\d+\.\d+$/;

if (!versionPattern.test(appVersion)) {
  throw new Error("VERSION must contain four numeric components, for example 1.0.0.0.");
}

const installerName = `MagicHat Setup ${appVersion}.exe`;
const installerPath = path.join(rootDirectory, "dist-release", installerName);
const updateZipName = `MagicHat-${appVersion}-win-x64.zip`;
const updateZipPath = path.join(rootDirectory, "dist-release", updateZipName);

for (const artifactPath of [installerPath, updateZipPath]) {
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error(`Packaged artifact does not exist: ${artifactPath}`);
  }
}

function runGitHubCli(args, captureOutput = false) {
  const result = spawnSync("gh", args, {
    cwd: rootDirectory,
    encoding: captureOutput ? "utf8" : undefined,
    stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
    windowsHide: true,
  });

  if (result.error !== undefined) {
    throw new Error(`Unable to run GitHub CLI: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`GitHub CLI exited with code ${result.status ?? "unknown"}.`);
  }
  return captureOutput ? result.stdout : undefined;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function getAssetVersion(assetName) {
  const zipMatch = /^MagicHat-(\d+\.\d+\.\d+\.\d+)-win-x64\.zip$/.exec(assetName);
  if (zipMatch !== null) return zipMatch[1];
  const installerMatch = /^MagicHat(?: Setup |\.Setup\.)(\d+\.\d+\.\d+\.\d+)\.exe$/.exec(assetName);
  return installerMatch?.[1] ?? null;
}

function getReleaseVersion(release) {
  if (typeof release.name !== "string" || !release.name.startsWith(releaseTitlePrefix)) {
    throw new Error(`Release ${releaseTag} must have a title starting with ${releaseTitlePrefix}.`);
  }
  const version = release.name.slice(releaseTitlePrefix.length);
  if (!versionPattern.test(version)) {
    throw new Error(`Release ${releaseTag} title must end with one four-component version.`);
  }
  return version;
}

function ensureRepositoryWriteAccess() {
  const repositoryOutput = runGitHubCli(["api", `repos/${repository}`], true);
  const repositoryData = JSON.parse(repositoryOutput);
  if (repositoryData?.permissions?.push !== true) {
    const account = runGitHubCli(["api", "user", "--jq", ".login"], true)?.trim();
    throw new Error(`GitHub account ${account || "unknown"} does not have write access to ${repository}.`);
  }
}

function listRepositoryItems(resource) {
  const output = runGitHubCli([
    "api",
    `repos/${repository}/${resource}?per_page=100`,
    "--paginate",
    "--slurp",
  ], true);
  const pages = JSON.parse(output);
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new Error(`GitHub ${resource} API returned an invalid response.`);
  }
  return pages.flat();
}

function deleteForeignAssets(tag, assets, retainedVersion) {
  for (const asset of assets) {
    if (getAssetVersion(asset.name) === retainedVersion) continue;
    console.log(`Deleting stale asset ${asset.name} from release ${tag}.`);
    runGitHubCli(["release", "delete-asset", tag, asset.name, "--repo", repository, "--yes"]);
  }
}

function deleteOldReleasesAndTags(releases) {
  for (const release of releases) {
    if (release.tag_name === releaseTag) continue;
    if (!Number.isSafeInteger(release.id) || release.id <= 0) {
      throw new Error("GitHub Releases API returned an invalid release ID.");
    }
    console.log(`Deleting old release ${release.tag_name}.`);
    runGitHubCli(["api", "--method", "DELETE", `repos/${repository}/releases/${release.id}`]);
  }
  const tags = listRepositoryItems("tags");
  for (const tag of tags) {
    if (typeof tag.name !== "string" || tag.name.length === 0) {
      throw new Error("GitHub Tags API returned an invalid tag name.");
    }
    if (tag.name === releaseTag) continue;
    console.log(`Deleting old tag ${tag.name}.`);
    runGitHubCli([
      "api",
      "--method",
      "DELETE",
      `repos/${repository}/git/refs/tags/${encodeURIComponent(tag.name)}`,
    ]);
  }
}

function createLatestRelease(targetCommitish) {
  console.log(`Creating release ${releaseTag} for MagicHat ${appVersion}.`);
  runGitHubCli([
    "release",
    "create",
    releaseTag,
    installerPath,
    updateZipPath,
    "--repo",
    repository,
    "--target",
    targetCommitish,
    "--title",
    `${releaseTitlePrefix}${appVersion}`,
    "--notes",
    `MagicHat ${appVersion}`,
    "--latest",
  ]);
}

runGitHubCli(["auth", "status"]);
ensureRepositoryWriteAccess();
const releases = listRepositoryItems("releases");

const latestRelease = releases.find((release) => release.tag_name === releaseTag);
if (latestRelease === undefined) {
  createLatestRelease("main");
  deleteOldReleasesAndTags(releases);
  console.log(`Published ${installerName} and ${updateZipName}.`);
  process.exit(0);
}

if (!Array.isArray(latestRelease.assets)) {
  throw new Error(`Release ${releaseTag} metadata is invalid.`);
}

const previousVersion = getReleaseVersion(latestRelease);
if (compareVersions(appVersion, previousVersion) < 0) {
  throw new Error(`VERSION ${appVersion} is older than published version ${previousVersion}.`);
}

console.log(`Publishing ${installerName} and ${updateZipName} to ${repository} release ${releaseTag}.`);
runGitHubCli([
  "release",
  "upload",
  releaseTag,
  installerPath,
  updateZipPath,
  "--repo",
  repository,
  "--clobber",
]);
runGitHubCli([
  "release",
  "edit",
  releaseTag,
  "--repo",
  repository,
  "--title",
  `${releaseTitlePrefix}${appVersion}`,
  "--notes",
  `MagicHat ${appVersion}`,
  "--latest",
]);
deleteForeignAssets(releaseTag, latestRelease.assets, appVersion);
deleteOldReleasesAndTags(releases);
console.log(`Published ${installerName} and ${updateZipName}.`);
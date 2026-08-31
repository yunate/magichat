import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererOutputPath = path.join(projectRoot, "client", "dist", "index.html");
const rendererHashPath = path.join(projectRoot, "client", "dist", ".start-build-hash");
const rebuildRenderer = process.env.MAGICHAT_START_REBUILD === "true";
const rendererInputFiles = [
  "client/index.html",
  "client/package.json",
  "client/tsconfig.json",
  "client/vite.config.ts",
  "package-lock.json",
  "tsconfig.base.json",
];

async function collectFiles(relativeDirectory, includeFile) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(relativePath, includeFile));
    } else if (entry.isFile() && includeFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

async function calculateRendererHash() {
  const sourceFiles = await collectFiles("client/src", () => true);
  const commonFiles = await collectFiles("common", (relativePath) => {
    const extension = path.extname(relativePath);
    return extension === ".ts" || extension === ".json";
  });
  const inputFiles = [...new Set([
    ...rendererInputFiles,
    ...sourceFiles,
    ...commonFiles,
  ])].sort();
  const hash = createHash("sha256");

  for (const relativePath of inputFiles) {
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(path.join(projectRoot, relativePath)));
    hash.update("\0");
  }

  return hash.digest("hex");
}

async function readCurrentRendererHash() {
  try {
    await access(rendererOutputPath);
    return (await readFile(rendererHashPath, "utf8")).trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

const rendererHash = await calculateRendererHash();
if (!rebuildRenderer && rendererHash === await readCurrentRendererHash()) {
  console.log("[start] Renderer inputs are current; skipping build.");
} else {
  if (rebuildRenderer) {
    console.log("[start] Rebuilding renderer as requested.");
  }
  const result = spawnSync("npm run build:renderer", {
    cwd: projectRoot,
    shell: true,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  await writeFile(rendererHashPath, `${rendererHash}\n`, "utf8");
}
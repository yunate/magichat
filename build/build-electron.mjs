import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "dist-electron");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const sharedOptions = {
  bundle: true,
  external: ["electron", "node-pty"],
  format: "cjs",
  logLevel: "info",
  minify: false,
  platform: "node",
  sourcemap: true,
  target: "node20",
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [path.join(projectRoot, "main", "src", "index.ts")],
    outfile: path.join(outputRoot, "main", "index.js"),
  }),
  build({
    ...sharedOptions,
    entryPoints: [path.join(projectRoot, "main", "src", "preload", "index.ts")],
    outfile: path.join(outputRoot, "preload", "index.js"),
  }),
]);
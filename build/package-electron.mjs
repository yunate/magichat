import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "electron-builder";

const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appVersion = fs.readFileSync(path.join(rootDirectory, "VERSION"), "utf8").trim();
const versionMatch = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(appVersion);
if (versionMatch === null) {
  throw new Error("VERSION must contain four numeric components, for example 1.0.0.0.");
}
const packageVersion = versionMatch.slice(1, 4).join(".");
const buildNumber = versionMatch[4];
const generatedVersionIncludePath = path.join(rootDirectory, "build", "generated-version.nsh");
const generatedZipName = `MagicHat Setup ${appVersion}.zip`;
const generatedZipPath = path.join(rootDirectory, "dist-release", generatedZipName);
const updateZipName = `MagicHat-${appVersion}-win-x64.zip`;
const updateZipPath = path.join(rootDirectory, "dist-release", updateZipName);
const certificateArgument = process.env.MAGICHAT_PACKAGE_CERTIFICATE_PATH;
const certificatePassword = process.env.MAGICHAT_PACKAGE_CERTIFICATE_PASSWORD;

delete process.env.MAGICHAT_PACKAGE_CERTIFICATE_PATH;
delete process.env.MAGICHAT_PACKAGE_CERTIFICATE_PASSWORD;
delete process.env.WIN_CSC_LINK;
delete process.env.CSC_LINK;
delete process.env.WIN_CSC_KEY_PASSWORD;
delete process.env.CSC_KEY_PASSWORD;

if (certificateArgument !== undefined) {
  const certificatePath = path.resolve(certificateArgument);
  const extension = path.extname(certificatePath).toLowerCase();
  if (!fs.existsSync(certificatePath) || !fs.statSync(certificatePath).isFile()) {
    throw new Error(`Signing certificate does not exist: ${certificatePath}`);
  }
  if (extension !== ".pfx" && extension !== ".p12") {
    throw new Error(`Signing certificate must be a .pfx or .p12 file: ${certificatePath}`);
  }
  process.env.WIN_CSC_LINK = certificatePath;
  if (certificatePassword !== undefined) {
    process.env.WIN_CSC_KEY_PASSWORD = certificatePassword;
  }
}

fs.writeFileSync(
  generatedVersionIncludePath,
  `!define MAGICHAT_VERSION "${appVersion}"\n`,
  "utf8",
);

try {
  fs.rmSync(updateZipPath, { force: true });
  await build({
    config: {
      extends: path.join(rootDirectory, "electron-builder.yml"),
      buildNumber,
      buildVersion: appVersion,
      extraMetadata: { version: packageVersion },
      win: {
        artifactName: `MagicHat Setup ${appVersion}.\${ext}`,
        target: [
          { target: "nsis", arch: ["x64"] },
          { target: "zip", arch: ["x64"] },
        ],
      },
    },
  });
  if (!fs.existsSync(generatedZipPath)) {
    throw new Error(`Packaged update ZIP does not exist: ${generatedZipPath}`);
  }
  fs.renameSync(generatedZipPath, updateZipPath);
} finally {
  fs.rmSync(generatedVersionIncludePath, { force: true });
}

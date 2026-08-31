const path = require("node:path");

module.exports = async function afterPack(context) {
  const certificatePath = process.env.WIN_CSC_LINK || process.env.CSC_LINK;
  if (!certificatePath) return;
  const executables = [
    path.join(context.appOutDir, "native-tools", "cli-helper", "bin", "magichat-cli.exe"),
    path.join(context.appOutDir, "native-tools", "js-launcher", "bin", "js-launcher.exe"),
  ];
  for (const executable of executables) await context.packager.signIf(executable);
};
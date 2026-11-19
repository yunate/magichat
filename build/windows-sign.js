const { performance } = require("node:perf_hooks");

module.exports = async function signWindowsExecutable(configuration, packager) {
  const certificatePath = process.env.WIN_CSC_LINK || process.env.CSC_LINK;
  if (!certificatePath) return;

  const normalizedPath = configuration.path.replaceAll("\\", "/").toLowerCase();
  if (normalizedPath.includes("/node_modules/node-pty/")) return;

  const file = `"${configuration.path}"`;
  const startedAt = performance.now();
  console.log(`signing with signtool.exe path=${file}, certificateFile="${certificatePath}"`);
  try {
    const signingManager = await packager.signingManager.value;
    await signingManager.doSign(configuration, packager);
  } catch (error) {
    console.error(`signing failed path=${file}, durationMs=${(performance.now() - startedAt).toFixed(1)}`);
    throw error;
  }
  console.log(`signing succeeded path=${file}, durationMs=${(performance.now() - startedAt).toFixed(1)}`);
};
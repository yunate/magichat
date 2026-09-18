module.exports = async function signWindowsExecutable(configuration, packager) {
  const normalizedPath = configuration.path.replaceAll("\\", "/").toLowerCase();
  if (normalizedPath.includes("/node_modules/node-pty/")) return;

  const signingManager = await packager.signingManager.value;
  await signingManager.doSign(configuration, packager);
};
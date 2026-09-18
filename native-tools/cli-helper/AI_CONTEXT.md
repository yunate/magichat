# CLI Helper

Native Windows named-pipe client and language-specific runtime integrations used by MagicHat-created terminals and scripts.

## Structure

- `src/` owns the C++20 named-pipe client and its MSVC build script.
- `bin/magichat-cli.exe` is the generated, Git-ignored native executable used through `MAGICHAT_CLI`.
- `cmd/` contains the batch entry points injected into `PATH`.
- `node/MagicHat.js` is preloaded through `NODE_OPTIONS` and exposed through `MAGICHAT_CLI_NODE_HELPER`.
- `python/` contains `MagicHat.py` and the `sitecustomize.py` startup hook injected through `PYTHONPATH`.
- `powershell/` contains the imported module and the fixed `-File` runner used by Node.js and Python when invoking PowerShell Commands.

## Boundaries

- The native executable forwards CLI environment values and arguments to Main without interpreting domain commands.
- Language integrations invoke only the fixed native executable from `MAGICHAT_CLI` and fixed interpreters for prepared scripts.
- PowerShell, Node.js, Python, and CMD expose Task helpers. `mhsettaskstate` and `mhsettasktitle` accept optional text; no text clears state or restores the original title. `mhsettaskdetail` accepts ordered non-blank lines as separate CLI arguments, replaces the complete expanded detail list, and clears it when called with an empty array or argument list. There are no separate clear commands.
- Prepared Command descriptions contain `scriptType|temporaryPath|commandPath`. Every language runner scopes `MAGICHAT_CLI_COMMAND_PATH` to `commandPath` while the target executes, preserving the parent value across nested calls. Node.js and Python expose the optional Macro target as the second `mhsetenv` argument; CMD and PowerShell forward `--path=<path>` directly.
- Node.js and Python resolve the PowerShell runner from the sibling `powershell/` directory; packaged files must preserve this layout.
- The native-tools manifest tracks source and target hashes for incremental root builds. `npm run build:cli-native` remains the explicit force-build command. Electron packaging copies the existing `bin/` executable and runtime integration files without rebuilding them.

# Main Infrastructure

Local filesystem, configuration, JSON, and log primitives. This module contains no business-domain decisions.

## Components

- `applicationPaths.ts` derives immutable application-wide roots and renderer, preload, native-tool, external UAC Broker bundle, and log paths. `appPath` is Electron's source path, which is the repository during development and `resources/app.asar` when packaged; `appRoot` is `%LOCALAPPDATA%\MagicHat`. Logs use `appPath/log` during development and `appRoot/log` when packaged.
- `configManager.ts` directly implements `ConfigServerRpcApi`, derives and creates its config directory, maps Command, Task Center, and global config keys to filenames, and keeps shared serializers authoritative for domain conversion.
- `jsonFile.ts` provides guarded JSON reads and atomic writes.
- `mhFile.ts` owns TreeView's `.mh` container format. It stores one strict JSON document followed by standalone `---MH:<key>---` extension sections, applies last-value-wins semantics to duplicate keys, and writes through a unique sibling temporary file before rename.
- `logFile.ts` provides failure-tolerant task log append and read operations.
- `logger.ts` owns the process-wide `gLogger`, mirrors `console` output, serializes file writes, and creates one `mh-YYYY-MM-DD-HH-mm-ss.log` file per process start. It removes matching log files older than seven days in the background. Error objects are normalized to their name and message before file output, without the stack. `ScopeLogger` implements `Disposable` for paired start/end logging through `using`; `TimerLogger` uses the same pattern to emit elapsed milliseconds when its scope ends.
- `utils/pathUtil.ts` checks physical files and directories through Electron's unpatched `node:original-fs`, so paths containing an `app.asar` filename are not interpreted as virtual archive paths.

## Boundaries

- Business domains derive their own paths from `ApplicationPaths.dataDir`; global paths do not create business directories or write inside packaged `app.asar` resources.
- Application file logging is best effort. File setup or append failure disables file output for the process, reports through the original stderr, and leaves console output active without retrying or choosing another directory.
- JSON read from disk remains untrusted until the owning serializer or service validates it.
- Config RPC strings are validated through `common/config/configType.ts` before filename lookup or I/O. Unknown and inherited keys are rejected.
- Missing config files use fresh defaults. Invalid config files are logged and fall back to defaults.
- Task recovery uses structured silent reads so the service can report sanitized task locations instead of full filesystem paths.
- Atomic write failures preserve the previous file and remove temporary output.
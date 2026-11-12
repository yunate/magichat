# Main Infrastructure

Shared Node/Electron infrastructure used by Main, Backend and Broker. Stateful business owners such as ConfigManager remain under `../backend/infra/`; file location does not select the process where a helper executes.

## Components

- `applicationPaths.ts` exports the global `gApplicationPaths` instance. It requires explicit `init(ApplicationPathsOptions)` and copies its configuration once; `getOptions()` returns an isolated copy for Broker initialization. The shared type and serializer live in `common/applicationPaths.ts`. Readonly getters derive application, renderer, preload, native-tool, external UAC Broker, and log paths without importing Electron or reading process-global paths. CLI environments use those same getters without maintaining separate path configuration. Reads before initialization and duplicate initialization throw. `appPath` is the repository during development and `resources/app.asar` when packaged; `appRoot` is `%LOCALAPPDATA%\MagicHat`. Logs use `appPath/log` during development and `appRoot/log` when packaged.
- `initializeApplicationPaths.ts` is Main's first imported module. It selects the development Electron profile when applicable, reads the authoritative Electron/process path values, and calls `gApplicationPaths.init()` before eager business-module path consumers run. Other Node entry points can import the owner directly and supply their own explicit configuration without loading this Electron initializer.
- `logger.ts` owns a process-local `gLogger`, mirrors `console` output, serializes file writes, and creates one `mh-YYYY-MM-DD-HH-mm-ss.log` file for Main or `mh-backend-YYYY-MM-DD-HH-mm-ss.log` for Backend. Each process removes only its own matching log family older than seven days. Error objects are normalized to their name and message before file output, without the stack. `ScopeLogger` implements `Disposable` for paired start/end logging through `using`; `TimerLogger` uses the same pattern to emit elapsed milliseconds when its scope ends.
- `ApplicationPathsOptions` includes authoritative Desktop/AppData and application executable paths. UtilityProcess and Broker callers initialize this same pure owner explicitly; they do not import the Electron initializer.
- `jsonFile.ts` provides guarded JSON reads and atomic writes. Existing read defaults, error reporting and write behavior remain unchanged; callers own validation and business decisions.
- `mhFile.ts` owns the reusable MH JSON/extension container serializer, including its existing atomic write and rename retry policy. It contains no process-level business state.
- `logFile.ts` provides reusable file-backed log append/read operations.
- `../utils/pathUtil.ts` provides physical path checks through `node:original-fs`; `../utils/error.ts` provides stateless error formatting. These helpers are shared by Backend and Broker and may be used by Main where appropriate.

## Boundaries

- Main imports its path initializer before host modules. Backend initializes paths before dynamically importing its business application, because Config and Task modules derive paths during module evaluation.
- Business domains derive their own paths from `ApplicationPaths.dataDir`; global paths do not create business directories or write inside packaged `app.asar` resources.
- Application file logging is best effort. File setup or append failure disables file output for the process, reports through the original stderr, and leaves console output active without retrying or choosing another directory.
- Sharing a synchronous file helper does not move its execution to another process. Bulk business I/O remains called from Backend/Broker; browser-only shared code such as TaskQueue belongs in `common/` instead of importing Node file helpers into Renderer.

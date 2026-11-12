# Repository

MagicHat is a local Electron toolbox organized as one npm workspace.

## Structure

- [`client/`](client/AI_CONTEXT.md) owns the Vue renderer.
- [`native-tools/`](native-tools/AI_CONTEXT.md) owns native projects, their incremental build manifest, and the unified build entry.
- [`common/`](common/AI_CONTEXT.md) owns shared models, protocols, serializers, and the MessagePort RPC bridge.
- [`main/`](main/AI_CONTEXT.md) owns the lightweight Electron host, preload, windows, platform capabilities, and child-process management.
- [`main/src/backend/`](main/src/backend/AI_CONTEXT.md) owns the independent UtilityProcess, all application backend services, storage, task/terminal execution, CLI, updates, and direct Renderer business connections.
- `build/` owns the Electron main and preload bundle script plus NSIS customization.
- The NSIS installer moves electron-builder's extracted application directory on the same volume into `%LOCALAPPDATA%\MagicHat\version\<version>`, then recreates the selected install directory with only `launcher.exe` and the uninstaller. Every install writes and flushes a temporary version pointer, then atomically replaces `%LOCALAPPDATA%\MagicHat\active-version` with the installer version even if a pointer already exists; activation errors abort installation. The launcher embeds the stable application icon, and installer shortcuts use it for both target and icon so version cleanup cannot invalidate shortcut icons. The uninstaller force-terminates packaged MagicHat processes running from Local AppData version directories; files that remain locked are registered for deletion on the next Windows restart without asking the user to restart immediately.
- `client/src/windows/main/themes/` owns application theme sources. `dark/` is bundled into the renderer; NSIS installs every other theme into the packaged user's `data/themes/` directory and replaces packaged theme files during reinstall or upgrade.
- `scripts/` contains environment helpers. Root `start.bat` and `package.bat` remain stable user entry points.

## Workspace

- Root `package.json` declares client, common, and main as npm workspaces. The native CLI Helper and JavaScript Launcher are built independently with MSVC; the UAC Broker is a TypeScript bundle executed by Electron or MagicHat in Node mode.
- Root `VERSION` is the single application version source and uses four numeric components. The renderer displays the complete value; packaging maps the first three components to npm-compatible package metadata and uses all four for Windows file metadata and installer artifact names.
- Dependencies, registry configuration, and locking are owned by root `node_modules/`, `.npmrc`, and `package-lock.json`.
- `tsconfig.base.json` contains compiler options shared by renderer and main. Each module keeps its runtime-specific settings.
- Root `npm install` and package scripts are the canonical dependency, typecheck, build, start, debug, and package commands. Development startup hashes renderer source, shared TypeScript inputs, and build configuration under `client/dist/`; it skips the renderer build only when that hash and the renderer entry output are current. `start.bat rebuild` bypasses this renderer cache, and it can be combined with `debug` in either argument order. The canonical `npm run build` and packaging paths always perform the full renderer build.
- `npm run build:native` checks every manifest-listed native project and compiles only stale or missing targets. It is the shared native-build step used by the root build, startup, and packaging chains; `start.bat` and `package.bat` do not invoke native build scripts separately.
- `native-tools/cli-helper/src/index.cpp` is the native Windows named-pipe CLI client. Its build script compiles it with MSVC into `native-tools/cli-helper/bin/magichat-cli.exe`; packaging copies the existing executable and classified language integrations without rebuilding them. Runtime invocation has no system Node.js dependency.
- `npm run build` incrementally builds native projects, `client/dist/`, `dist-electron/main/`, `dist-electron/preload/`, `dist-electron/backend/`, and `dist-electron/uac-broker/`. Electron Builder packages the Backend and Broker bundles outside ASAR. Main starts Backend through `utilityProcess.fork()`; the native JavaScript launcher elevates itself when required, then runs the Broker bundle through the current executable with `ELECTRON_RUN_AS_NODE=1`. `package.bat` packages unsigned by default; optional certificate-path and certificate-password arguments enable signing for the application, installer, and staged native executable copies. Signed packaging fails rather than falling back to unsigned output.
- `publish.bat` publishes the packaged installer and update ZIP to the fixed `latest` release in `ddmagichat/magichat-release`. Only after publication succeeds, it removes stale assets and all other releases and tags, including orphan tags across all API pages; older versions are not archived.
- Unpackaged runs use the gray `build/debugAppIcon.ico`; packaged application windows, shortcuts, and executables use the coral `build/appIcon.ico`; the NSIS setup executable uses `build/installerIcon.ico` with a package badge.

## Boundaries

- Keep `client/`, `common/`, and `main/` at their current depth. Shared source imports rely on this layout.
- Runtime data and generated build artifacts are not committed.
- Runtime RPC uses two dedicated MessageChannels per renderer, one to Main and one directly to Backend, without exposing a listening port. Main also owns a separate Backend control channel.
- Development runtime data uses the repository `data/` directory; packaged runtime data uses Electron user data.
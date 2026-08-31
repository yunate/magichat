# Repository

MagicHat is a local Electron toolbox organized as one npm workspace.

## Structure

- [`client/`](client/AI_CONTEXT.md) owns the Vue renderer.
- [`native-tools/`](native-tools/AI_CONTEXT.md) owns native projects, their incremental build manifest, and the unified build entry.
- [`common/`](common/AI_CONTEXT.md) owns shared models, protocols, serializers, and the MessagePort RPC bridge.
- [`main/`](main/AI_CONTEXT.md) owns the Electron main process, preload, and local business services.
- `build/` owns the Electron main and preload bundle script plus NSIS customization.
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
- `npm run build` incrementally builds native projects, `client/dist/`, `dist-electron/main/`, `dist-electron/preload/`, and `dist-electron/uac-broker/`. Electron Builder packages the broker bundle outside ASAR; the native JavaScript launcher elevates itself when required, then runs the bundle through the current executable with `ELECTRON_RUN_AS_NODE=1`. `package.bat` packages unsigned by default; optional certificate-path and certificate-password arguments enable signing for the application, installer, and staged native executable copies. Signed packaging fails rather than falling back to unsigned output.
- Unpackaged runs use the gray `build/debugAppIcon.ico`; packaged application windows, shortcuts, and executables use the coral `build/appIcon.ico`; the NSIS setup executable uses `build/installerIcon.ico` with a package badge.

## Boundaries

- Keep `client/`, `common/`, and `main/` at their current depth. Shared source imports rely on this layout.
- Runtime data and generated build artifacts are not committed.
- Runtime RPC uses one dedicated MessageChannel per renderer and does not expose a listening port.
- Development runtime data uses the repository `data/` directory; packaged runtime data uses Electron user data.
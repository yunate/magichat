# Repository

MagicHat is a local Electron toolbox organized as one npm workspace.

## Structure

- [`client/`](client/AI_CONTEXT.md) owns the Vue renderer.
- [`common/`](common/AI_CONTEXT.md) owns shared models, protocols, serializers, and the MessagePort RPC bridge.
- [`main/`](main/AI_CONTEXT.md) owns the Electron main process, preload, and local business services.
- `build/` owns the Electron main and preload bundle script.
- `scripts/` contains environment helpers. Root `start.bat` and `package.bat` remain stable user entry points.

## Workspace

- Root `package.json` declares client, common, and main as npm workspaces.
- Dependencies, registry configuration, and locking are owned by root `node_modules/`, `.npmrc`, and `package-lock.json`.
- `tsconfig.base.json` contains compiler options shared by renderer and main. Each module keeps its runtime-specific settings.
- Root `npm install` and package scripts are the canonical dependency, typecheck, build, start, debug, and package commands.
- `npm run build` builds `client/dist/`, `dist-electron/main/`, and `dist-electron/preload/`. Electron Builder packages these outputs.

## Boundaries

- Keep `client/`, `common/`, and `main/` at their current depth. Shared source imports rely on this layout.
- Runtime data and generated build artifacts are not committed.
- Runtime RPC uses one dedicated MessageChannel per renderer and does not expose a listening port.
- Development runtime data uses the repository `data/` directory; packaged runtime data uses `data/` beside the application executable.
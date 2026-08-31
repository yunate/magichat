# Native Tools

Windows native projects and their shared incremental build entry.

## Structure

- `native-projects.json` is the authoritative project table. Each row declares input paths, a build script, a target executable, and the last successful source and target SHA-256 hashes.
- `build-all-natives.bat` is the stable entry used once by the root npm build. Startup and packaging reach it through that build chain. It invokes `build-all-natives.ps1` for structured manifest parsing and hashing.
- [`cli-helper/`](cli-helper/AI_CONTEXT.md) owns the native CLI bridge client and classified language integrations.
- [`js-launcher/`](js-launcher/AI_CONTEXT.md) owns JavaScript process launch through the current Electron or MagicHat executable, including optional elevation.

## Build Contract

- Every input file contributes its native-tools-relative path and content hash, so content changes, additions, removals, and renames invalidate the project source hash.
- A project is current only when its target exists and both its source and target hashes match the table.
- A stale project invokes only its declared fixed build script. Build failure, a missing target, or source changes during compilation stop the unified build without updating that project's hashes.
- The table is updated after each successful project build. There is no automatic retry or fallback build path.
- Native project `bin/*.exe` targets are generated locally and ignored by Git. Startup and packaging obtain them through the root incremental build.
- Direct project build scripts remain force-build entry points for focused development and validation.

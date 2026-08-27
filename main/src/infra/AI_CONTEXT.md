# Main Infrastructure

Local filesystem, configuration, JSON, and log primitives. This module contains no business-domain decisions.

## Components

- `applicationPaths.ts` derives immutable application-wide roots and renderer/preload entry paths. Development data uses the repository `data/` directory; packaged data uses `data/` beside the application executable.
- `configManager.ts` directly implements `ConfigServerRpcApi`, derives and creates its config directory, maps supported config keys to filenames, and keeps shared serializers authoritative for domain conversion.
- `jsonFile.ts` provides guarded JSON reads and atomic writes.
- `strictJsonFile.ts` provides throwing JSON reads and unique temporary-file atomic writes for authoritative TreeView persistence.
- `logFile.ts` provides failure-tolerant task log append and read operations.

## Boundaries

- Business domains derive their own paths from `ApplicationPaths.dataDir`; global paths do not create business directories or write inside packaged `app.asar` resources.
- JSON read from disk remains untrusted until the owning serializer or service validates it.
- Config RPC strings are validated through `common/config/configType.ts` before filename lookup or I/O. Unknown and inherited keys are rejected.
- Missing config files use fresh defaults. Invalid config files are logged and fall back to defaults.
- Task recovery uses structured silent reads so the service can report sanitized task locations instead of full filesystem paths.
- Atomic write failures preserve the previous file and remove temporary output.
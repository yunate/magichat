# Task Service

Owns Task Center queueing, lifecycle, persistence, recovery, templates, logs, broadcasts, and local script execution.

## Structure

- `taskManager.ts` directly implements `TasksServerRpcApi` and is the process-level owner of tasks, queue slots, persistence, recovery, and broadcasts.
- `task.ts` defines the shared task lifecycle and file-backed logging.
- `taskPaths.ts` owns the task data root and validates task IDs before deriving per-task config and log paths.
- `scriptTask.ts` executes validated script tasks.
- `taskFactory.ts` creates and restores tasks and manages built-in and user templates.
- Tasks report changes through injected callbacks and never import the manager.

## Persistence and recovery

- Persisted records are treated as untrusted. The `Task` base constructor is the runtime validation boundary for shared task models and matching task types. Each concrete task constructor owns its task-specific info invariant.
- Each task uses `{ info: TaskInfo, params: TaskCreateParam }` metadata beside a separate `log.txt`; creation name and resumability live at `params.name` and `params.canResume`, while script-specific fields live under `params.params`.
- `TaskFactory` creates only the common `TaskInfo` fields and selects the concrete task type. After shared validation and storage by `Task`, each concrete task constructor completes missing task-specific info; restored task-specific info and titles are preserved. `Task` directly retains the provided `TaskInfo` and `TaskCreateParam` references and exposes them through readonly `taskInfo` and `createParam` properties under a read-only caller convention. `TaskInfo` remains the sole mutable lifecycle state, and runtime task-specific info comes only from `TaskInfo.tasksSpectialInfo`.
- Persisted create params are validated directly against the current `{ type, name, canResume, params }` contract. `name` is required non-blank outer metadata. Legacy create param shapes are malformed and skipped.
- Script variables use `Record<string, string>` in the domain model and persisted JSON payloads. `ScriptTaskInfo` preserves the original script and a copied variables snapshot for details. Macro calls convert variables to temporary maps.
- A task directory name is the authoritative persisted ID and must match `info.id`. Duplicate IDs never replace restored tasks.
- Task templates and temporary scripts are derived inside their owning Task services from the Task data root.
- Missing task configs are ignored. Invalid, unreadable, or malformed records are skipped without exposing full filesystem paths.
- Interrupted tasks are abandoned by default. A script task with `canResume: true` is reset and queued to run again after restart.

## Execution boundaries

- `TaskCenterConfig.maxParallel` controls queue concurrency; non-positive values mean unlimited.
- Script processes use fixed interpreters with argument arrays, never a shell-composed command string.
- Script macro replacement is called only when encoding the temporary execution file. `MacroParser.replaceMacrosInText` resolves variable-value dependencies in synchronous rounds, rejecting unknown references or cycles, then replaces known valid text macros in one pass while unknown or invalid text candidates may remain. Persisted create params and task info retain the original script source and variables.
- Script bodies are stored in temporary files that are removed after execution and cleared at startup.
- Only terminal tasks can be deleted, preventing live runtime resources from being orphaned.

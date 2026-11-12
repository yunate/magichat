# Task Service

Owns Task Center queueing, lifecycle, persistence, recovery, templates, logs, broadcasts, and local script execution.

## Structure

- `taskManager.ts` directly implements `TasksServerRpcApi` and is the process-level owner of tasks, queue slots, persistence, recovery, and broadcasts.
- `task.ts` defines the shared task lifecycle and file-backed logging.
- `taskPaths.ts` owns the fixed task data root, resolves configured template Roots, and validates task IDs before deriving per-task config and log paths.
- `scriptTask.ts` executes validated script tasks.
- `taskFactory.ts` creates and restores tasks and manages built-in and user templates from the currently selected template Root.
- Tasks report changes through injected callbacks and never import the manager.

## Persistence and recovery

- Persisted records are treated as untrusted. The `Task` base constructor is the runtime validation boundary for shared task models and matching task types. Each concrete task constructor owns its task-specific info invariant.
- Each task uses `{ info: TaskInfo, params: TaskCreateParam }` metadata beside `log.txt`. Before a complete line would take the current log past 10 MiB, the current file replaces the single `log.1` archive and logging continues in a new `log.txt`. Creation name and resumability live at `params.name` and `params.canResume`, while script-specific fields live under `params.params`.
- `TaskInfo.displayState` and `displayDetails` are runtime-only. Task broadcasts include them, while `Task.serialize()` omits them and Task construction discards stale values found in stored data. `set-task-state` and `set-task-detail` replace these values; empty input clears them.
- A running script can replace its Task title through `set-task-title`; empty input restores the original create-param name. The title uses the normal Task update path, so it is broadcast immediately and persisted across restart; original create params remain unchanged for Run new.
- `TaskFactory` creates only the common `TaskInfo` fields and selects the concrete task type. After shared validation and storage by `Task`, each concrete task constructor completes missing task-specific info; restored task-specific info and titles are preserved. `Task` directly retains the provided `TaskInfo` and `TaskCreateParam` references and exposes them through readonly `taskInfo` and `createParam` properties under a read-only caller convention. `TaskInfo` remains the sole mutable lifecycle state, and runtime task-specific info comes only from `TaskInfo.tasksSpectialInfo`.
- Persisted create params are validated directly against the current `{ type, name, canResume, params }` contract. `name` is required non-blank outer metadata. Legacy create param shapes are malformed and skipped.
- Script variables use `Record<string, string>` in the domain model and persisted JSON payloads. `ScriptTaskInfo` preserves the original script and a copied variables snapshot for details. Macro calls convert variables to temporary maps.
- A task directory name is the authoritative persisted ID and must match `info.id`. Duplicate IDs never replace restored tasks.
- Persisted Task records and temporary scripts remain under the fixed Task data root. User templates use `task-templates.json` under the active configured template Root; changing Roots reloads that file without moving, merging, or deleting another Root's templates. The default template Root resolves to the fixed Task data root, preserving the original template file location.
- Missing task configs are ignored. Invalid, unreadable, or malformed records are skipped without exposing full filesystem paths.
- Interrupted tasks are abandoned by default. A script task with `canResume: true` is reset and queued to run again after restart. Restored tasks do not start during module initialization; Backend starts the queue only after the CLI named pipe is listening, so resumed scripts can use Task CLI commands immediately.

## Execution boundaries

- `TaskCenterConfig.maxParallel` controls queue concurrency; non-positive values mean unlimited.
- Script processes use fixed interpreters with argument arrays, never a shell-composed command string.
- Node.js script processes automatically preload the CLI CommonJS helper and can call the global `mhsetenv(updates)` function. The global `mhcall(path)` function requires a MagicHat Terminal identity and therefore is unavailable to Task Center runs.
- Python script processes automatically load the CLI helper through the injected `PYTHONPATH` and `sitecustomize.py`, and can call the built-in `mhsetenv(updates)` function. The built-in `mhcall(path)` function likewise requires a MagicHat Terminal identity and is unavailable to Task Center runs.
- Script macro replacement is called only when encoding the temporary execution file. `MacroParser.replaceMacrosInText` resolves variable-value dependencies in synchronous rounds, rejecting unknown references or cycles, then replaces known valid text macros in one pass while unknown or invalid text candidates may remain. Persisted create params and task info retain the original script source and variables.
- Script bodies are stored in temporary files that are removed after execution and cleared at startup.
- Only terminal tasks can be deleted, preventing live runtime resources from being orphaned.
- Inline log requests seek backward from the end of `log.txt` and decode only enough chunks to return the requested tail. The full current log is revealed in the platform file manager and is never transferred to the renderer.

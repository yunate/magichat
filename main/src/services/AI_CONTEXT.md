# Services

Process-level business services. [`tasks/`](tasks/AI_CONTEXT.md) owns the Task Center domain.

## Structure

- `tasks/` owns task creation, persistence, execution, process lifecycle, logs, and updates.
- `command/` configures the Command TreeView provider with domain folder and script item serializers, and owns explicit reveal/delete recovery operations for invalid Command storage.
- [`treeView/`](treeView/AI_CONTEXT.md) owns the generic serializer-backed local TreeView DataProvider.
- `scriptExecution.ts` is the shared interpreter invocation and script encoding source for Task scripts.

## Boundaries

- RPC handlers remain thin and delegate domain behavior to services.
- Services obtain paths and persistence primitives from `infra/`.
- Task broadcasts target bridges held by `WindowManager`, with failures isolated per window.
- Script execution uses fixed programs and argument arrays without shell command construction.
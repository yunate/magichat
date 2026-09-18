# Common Tasks

Shared task entities, task-specific definitions, and runtime serializers.

## Structure

- `taskType.ts` maps each task type to its info, create-params, and template serializers. `TaskType`, `TaskSepctialCreateParam<K>`, and task-specific payload types are inferred from this registry.
- `taskCreateParam.ts`, `taskInfo.ts`, and `taskTemplate.ts` own the outer entities and directly exported serializers; they are not registered in a global serializer table.
- `scriptTaskDefinition.ts` owns script-specific types and leaf serializers. Variable validation delegates to `MacroParser` through a temporary map.
- Supported script types are PowerShell, Node.js, Python, and CMD. Bash is not part of the shared `ScriptType` contract.
- `tasksRpcApi.ts` defines both Task RPC directions: `TasksServerRpcApi` is implemented by server and called by client, including template-root resolution; `TaskEventsClientRpcApi` is implemented by client and called by server.

## Contracts

- `TaskCreateParam` is the complete discriminated creation descriptor. Its required non-blank `name` and required `canResume` fields are shared outer creation metadata, while the optional `params` field is the task-specific `TaskSepctialCreateParam<K>` leaf selected and validated through the registry.
- `TaskInfo.displayState` and `displayDetails` are optional script-reported runtime presentation. State is one summary line; details are ordered non-blank lines shown only while expanded. Both are broadcast to clients, excluded from persisted Task info, and cleared when constructing a Task from stored data. They remain independent of lifecycle `status` and do not affect scheduling, completion, or resume behavior.
- `TasksServerRpcApi.getTaskLogs` returns the bounded inline tail. `revealTaskLog` reveals the current log file through Main without transferring full log content over RPC.
- Leaf create params contain only task-specific fields and do not repeat outer creation fields such as `type`, `name`, or `canResume`.
- Known task-type literals preserve their concrete serializer types. Dynamic strings return an unknown-valued serializer entry and reject unsupported types.
- Leaf definition modules must not import `taskType.ts`, preventing a runtime registry cycle.
- `SCRIPT_TASK_KEY` in `scriptTaskDefinition.ts` is the single source for the script task key used by the registry and model defaults.
- Adding a task type requires its three leaf serializers and one registry entry.
- Creation and template-save behavior is currently script-only.
- `ScriptTemplate.canResume` remains a template creation option and is separate from the script create-params leaf.
- Script create params, templates, and `ScriptTaskInfo` carry `variables: Record<string, string>`; task info preserves the original script and variables snapshot for details.
- `MacroParser` accepts `ReadonlyMap<string, string>` and validates `mh{key}` references. Whitespace immediately inside braces is ignored; keys start with a letter or underscore and may contain non-empty segments separated by `.` or `-`. Values remain strings.
- `MacroParser.replaceMacrosInText` resolves variable-value dependencies in synchronous rounds before replacing text in one pass. It rejects unknown references, cycles, and invalid macro candidates in variable values, while unknown or invalid text candidates may remain; `extractKeys` can check remaining valid macro keys.
- The public `Spectial` spelling is retained for compatibility.
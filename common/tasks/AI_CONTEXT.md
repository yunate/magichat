# Common Tasks

Shared task entities, task-specific definitions, and runtime serializers.

## Structure

- `taskType.ts` maps each task type to its info, create-params, and template serializers. `TaskType`, `TaskSepctialCreateParam<K>`, and task-specific payload types are inferred from this registry.
- `taskCreateParam.ts`, `taskInfo.ts`, and `taskTemplate.ts` own the outer entities and directly exported serializers; they are not registered in a global serializer table.
- `scriptTaskDefinition.ts` owns script-specific types and leaf serializers. Variable validation delegates to `MacroParser` through a temporary map.
- `tasksRpcApi.ts` defines both Task RPC directions: `TasksServerRpcApi` is implemented by server and called by client; `TaskEventsClientRpcApi` is implemented by client and called by server.

## Contracts

- `TaskCreateParam` is the complete discriminated creation descriptor. Its required non-blank `name` and required `canResume` fields are shared outer creation metadata, while the optional `params` field is the task-specific `TaskSepctialCreateParam<K>` leaf selected and validated through the registry.
- Leaf create params contain only task-specific fields and do not repeat outer creation fields such as `type`, `name`, or `canResume`.
- Known task-type literals preserve their concrete serializer types. Dynamic strings return an unknown-valued serializer entry and reject unsupported types.
- Leaf definition modules must not import `taskType.ts`, preventing a runtime registry cycle.
- `SCRIPT_TASK_KEY` in `scriptTaskDefinition.ts` is the single source for the script task key used by the registry and model defaults.
- Adding a task type requires its three leaf serializers and one registry entry.
- Creation and template-save behavior is currently script-only.
- `ScriptTemplate.canResume` remains a template creation option and is separate from the script create-params leaf.
- Script create params, templates, and `ScriptTaskInfo` carry `variables: Record<string, string>`; task info preserves the original script and variables snapshot for details.
- `MacroParser` accepts `ReadonlyMap<string, string>` and validates that keys match `[A-Za-z_][A-Za-z0-9_]*` and values are strings.
- `MacroParser.replaceMacrosInText` resolves variable-value dependencies in synchronous rounds before replacing text in one pass. It rejects unknown references, cycles, and invalid macro candidates in variable values, while unknown or invalid text candidates may remain; `extractKeys` can check remaining valid macro keys.
- The public `Spectial` spelling is retained for compatibility.
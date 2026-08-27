# Command Contracts

Shared Command TreeView data models and the client-to-main DataProvider RPC contract.

## Contracts

- `commandData.ts` defines ordered Macro key-value pairs with persistent enabled state, named parameter groups, folder parameter data, script item data, and their strict serializers.
- Folder data contains its local parameter groups and selected group. Item data contains the script type, original script content, local parameter groups, and selected group; TreeView owns entity names, IDs, paths, draft state, and tab state.
- Parameter serializers enforce exact records, valid unique keys, string values, boolean enabled state, and valid Macro candidate syntax. Existing parameter records without enabled state are normalized to enabled during strict read and are written in the current schema on the next save. Unknown references are allowed at this boundary because they may resolve from ancestor folder scopes.
- `commandTreeViewRpcApi.ts` specializes the generic TreeView DataProvider and exposes Command storage reveal and explicit deletion operations for invalid-data recovery.

## Boundaries

- Command data uses only the current strict schema. Empty legacy `data` objects are not accepted.
- Folder inheritance, scope precedence, editor dirty state, and save confirmation belong to the client Command page, not the shared serializer or `MacroParser`.

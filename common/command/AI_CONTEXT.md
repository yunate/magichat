# Command Contracts

Shared Command business data models and storage RPC contract.

## Contracts

- `commandData.ts` defines ordered Macro key-value pairs with persistent enabled state, named parameter groups, Workspace environment data, folder parameter data, script item data, and their strict serializers.
- `../config/command.ts` defines Command settings, including Terminal placement, Terminal initial path, and storage Roots. Its default `${MAGICHAT_DATA}/tmp/terminal` path preserves the original Terminal working directory; the immediately preceding config schema without this field is normalized to that default.
- Workspace data contains one ordered `env` list. Environment keys are unique and use the same strict Macro key and value rules as Folder and Item parameters.
- Folder data contains its local parameter groups and selected group. The in-memory Item model contains script type, script content, local parameter groups, selected group, and optional `codeViewPlacement` (`left`, `right`, `top`, `bottom`, or `hide`). Item persistence stores script content only in the TreeView entity extension named `script`; the strict JSON `data` record stores the remaining Item fields, including placement when supplied. Folder and Workspace data do not contain placement. TreeView owns entity names, IDs, paths, draft state, and tab state.
- Parameter serializers enforce exact records, valid unique keys, string values, boolean enabled state, and valid Macro candidate syntax. Existing parameter records without enabled state are normalized to enabled during strict read and are written in the current schema on the next save. Unknown references are allowed at this boundary because they may resolve from ancestor folder scopes.
- `commandStorageRpcApi.ts` defines the Main-provided Command storage API and the Client-provided Command push API. The storage object resolves roots and the configured Terminal initial path, exposes explicit recovery operations, and binds one initialized Command Client proxy to its bridge connection. Generic TreeView persistence is provided separately; Command serializers are consumed by the renderer.

## Boundaries

- Command data uses only the current strict schema. Item JSON containing the former `content` field and persisted Item data without a `script` extension are not accepted. A newly created Item with null JSON data initializes default metadata and an empty script.
- Item metadata may omit `codeViewPlacement`; serialization preserves that absence without inserting a default. Only the renderer interprets an absent value as `left`. Present but invalid placement values remain errors.
- Workspace, Folder, and Item business data remains outside structural TreeView snapshots and is transported through the generic entity-data API.
- Folder inheritance, scope precedence, editor dirty state, and save confirmation belong to the client Command page, not the shared serializer or `MacroParser`.

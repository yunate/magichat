# TextEdit

Reusable controlled editor for Macro parameters and optional multiline text.

## Structure

- `TextEdit.vue` owns local group selection, creation, and deletion, Param expansion, external reload synchronization, the optional TextArea surface, its pointer- and keyboard-resizable Param/TextArea split, lazy additional-parameter retrieval, and the exposed raw and resolved value queries. Deleting the active group selects the following group, or the preceding group at the end; deleting the final group creates an empty `default params` group and shows a toast. Consumers can disable parameter-group selection, creation, and deletion while retaining parameter editing.
- `ParamEditor.vue` owns the selected group's ordered key-value rows, per-row enabled state, always-available auto-promoting draft row, drag reorder, inline key errors, resizable key/value columns, and `magichat-param-v1` batch paste handling. New and legacy-imported rows default to enabled. The key column starts from a deterministic editor default; container measurements constrain explicit resize interactions but transient layout changes never overwrite the stored width. Its drag handle opens a Copy/Copy all/Delete row menu on click, and the same menu opens from a row context-menu event, including while an input is focused. When script Macro synchronization is enabled, parsed Macro rows stay first in script order; their keys cannot be edited and their rows cannot be deleted or moved, while enabled state and values remain editable.
- `TextAreaEditor.vue` owns multiline editing, configurable space insertion for Tab, whole-line clipboard commands, and document-scoped undo and redo history.
- `MacroTextInput.vue` overlays Macro and whitespace presentation on native input controls. `MacroPopup.vue` presents source, resolved value, failure details, and copy feedback.
- `textEditTypes.ts` merges ordered additional Macro scopes with the selected local group, adapts the merged values to the shared strict `MacroParser` API, and converts failures into editor result details without partial expansion.

## Boundaries

- A TextEdit instance can show Param plus TextArea or hide TextArea for a Param-only surface. The Param panel starts collapsed by default and remains available through its toolbar toggle. Consumers can request initial expansion and readonly controls for selection-capable display surfaces.
- Script Macro parameter synchronization and parameter-group management restrictions are opt-in; existing consumers retain the default unrestricted behavior.
- TextArea resolves against lazily retrieved additional parameter scopes followed by the currently selected parameter group. Later additional scopes override earlier scopes, and the local group has highest priority.
- Disabled parameters remain persisted and editable but do not participate in Macro scope merging, validation results, or task variable submission.
- The optional additional-parameter provider is called once per top-level resolution and its returned scopes are not retained by TextEdit.
- Invalid keys use row-level errors. Unknown, cyclic, or invalid references remain editable and use warning presentation.
- Components emit current values and never persist, execute, save, or invoke RPC APIs.

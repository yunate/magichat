import { dirname, join, relative } from "pathe";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  type CommandEnvTarget,
  type CommandParam,
} from "../../../../../../common/command";
import type { TerminalRunRequest } from "../../../../../../common/terminal";
import { TREE_VIEW_ITEM_FILE_EXTENSION, TreeViewPath } from "../../../../../../common/treeView";
import {
  resolveTextEditText,
  type TextEditAdditionalParamScope,
  type TextEditParamGroup,
} from "../../../../components/textEdit";
import type { TreeView } from "../../../../components/treeView";

export type CommandMacroTarget = Readonly<{
  kind: "workspace" | "folder" | "item";
  path: string;
}>;

export async function createCommandCliRunRequest(
  model: TreeView | null,
  workspaceEnv: readonly CommandParam[],
  requestedPath: string,
  sourceCommandPath: string | null,
): Promise<TerminalRunRequest> {
  const workspaceRef = model?.selectedWorkspaceRef.value;
  if (model === null || workspaceRef === null || workspaceRef === undefined) {
    throw new Error("Command workspace is unavailable");
  }
  const itemPath = resolveCliPath(requestedPath, workspaceRef.workspacePath, sourceCommandPath);
  const item = await model.resolveItemByPath(itemPath);
  const entityData = await model.controller.getEntityData({ kind: "item", path: item.path });
  const data = commandItemDataSerializer.fromEntityData(entityData);
  if (data.content.length === 0) {
    throw new Error(`Called Command has no content: ${JSON.stringify(requestedPath)}`);
  }

  const folderScopes: TextEditAdditionalParamScope[] = [];
  for (const folderPath of collectAncestorFolderPaths(workspaceRef.workspacePath, item.path)) {
    const { dataJson: folderDataJson } = await model.controller.getEntityData({
      kind: "folder",
      path: folderPath,
    });
    const folderData = folderDataJson === null
      ? commandFolderDataSerializer.getDefault()
      : commandFolderDataSerializer.fromJson(folderDataJson);
    const group = folderData.paramGroups.find(
      (candidate) => candidate.id === folderData.selectedParamGroupId,
    );
    if (group === undefined) throw new Error("Selected folder param group is unavailable");
    folderScopes.push({
      label: "Folder",
      sourcePath: relative(dirname(workspaceRef.workspacePath), folderPath),
      params: group.params,
    });
  }
  const selectedGroup = data.paramGroups.find((group) => group.id === data.selectedParamGroupId);
  if (selectedGroup === undefined) throw new Error("Selected Command param group is unavailable");
  const itemGroup: TextEditParamGroup = {
    id: selectedGroup.id,
    name: selectedGroup.name,
    sourceType: "Command",
    sourcePath: relative(dirname(workspaceRef.workspacePath), item.path),
    params: selectedGroup.params,
  };
  const environmentScopes: readonly TextEditAdditionalParamScope[] = [{
    label: "Environment",
    sourcePath: workspaceRef.workspaceName,
    params: workspaceEnv,
  }];
  const resolution = resolveTextEditText(data.content, itemGroup, folderScopes, environmentScopes);
  if (!resolution.successful) throw new Error(resolution.error ?? "Command content could not be resolved");
  return {
    scriptId: item.properties.id,
    commandPath: item.path,
    scriptType: data.scriptType,
    scriptContent: resolution.value,
  };
}

export async function resolveCommandMacroTarget(
  model: TreeView | null,
  target: CommandEnvTarget,
): Promise<CommandMacroTarget> {
  const workspaceRef = model?.selectedWorkspaceRef.value;
  if (
    model === null
    || workspaceRef === null
    || workspaceRef === undefined
  ) {
    throw new Error("Command workspace is unavailable");
  }
  if (target.path === "__root__") {
    return { kind: "workspace", path: workspaceRef.workspacePath };
  }
  const targetPath = resolveCliPath(
    target.path,
    workspaceRef.workspacePath,
    target.sourceCommandPath,
  );
  if (targetPath.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)) {
    await model.resolveItemByPath(targetPath);
    return { kind: "item", path: targetPath };
  }
  await model.resolveFolderByPath(targetPath);
  return { kind: "folder", path: targetPath };
}

function resolveCliPath(
  requestedPath: string,
  workspacePath: string,
  sourceCommandPath: string | null,
): string {
  const path = requestedPath.replaceAll("\\", "/");
  const isAbsolute = /^[a-zA-Z]:\//.test(path) || path.startsWith("/");
  const isExplicitRelative = path === "."
    || path === ".."
    || path.startsWith("./")
    || path.startsWith("../");
  if (isExplicitRelative && sourceCommandPath === null) {
    throw new Error("Relative paths must run from a MagicHat Command");
  }
  if (path === "." || path === "./") return sourceCommandPath ?? workspacePath;
  return TreeViewPath.normalize(
    isAbsolute
      ? path
      : join(isExplicitRelative ? sourceCommandPath ?? workspacePath : dirname(workspacePath), path),
    "CLI path",
  );
}

function collectAncestorFolderPaths(workspacePath: string, itemPath: string): string[] {
  const ancestors: string[] = [];
  let folderPath = dirname(itemPath);
  while (true) {
    ancestors.unshift(folderPath);
    if (folderPath === workspacePath) return ancestors;
    folderPath = dirname(folderPath);
  }
}

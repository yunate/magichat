import { dirname, join, relative } from "pathe";
import {
  commandFolderDataSerializer,
  commandItemDataSerializer,
  type CommandEnvTarget,
  type CommandParam,
} from "../../../../../../common/command";
import type { TerminalRunRequest } from "../../../../../../common/terminal";
import { TreeViewPath, type TreeViewFolder } from "../../../../../../common/treeView";
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
  const item = model.getItemByPath(itemPath);
  if (item === null) {
    throw new Error(
      `Command path does not identify an Item in the current workspace. Requested: ${JSON.stringify(requestedPath)}. Resolved: ${JSON.stringify(itemPath)}`,
    );
  }
  const dataJson = await model.controller.getEntityData({ kind: "item", path: item.path });
  const data = dataJson === null
    ? commandItemDataSerializer.getDefault()
    : commandItemDataSerializer.fromJson(dataJson);
  if (data.content.length === 0) {
    throw new Error(`Called Command has no content: ${JSON.stringify(requestedPath)}`);
  }

  const folderScopes: TextEditAdditionalParamScope[] = [];
  for (const folder of collectAncestorFolders(model.rootFolder.value, item.path)) {
    const folderDataJson = await model.controller.getEntityData({ kind: "folder", path: folder.path });
    const folderData = folderDataJson === null
      ? commandFolderDataSerializer.getDefault()
      : commandFolderDataSerializer.fromJson(folderDataJson);
    const group = folderData.paramGroups.find(
      (candidate) => candidate.id === folderData.selectedParamGroupId,
    );
    if (group === undefined) throw new Error("Selected folder param group is unavailable");
    folderScopes.push({
      label: "Folder",
      sourcePath: relative(dirname(workspaceRef.workspacePath), folder.path),
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

export function resolveCommandMacroTarget(
  model: TreeView | null,
  target: CommandEnvTarget,
): CommandMacroTarget {
  const workspaceRef = model?.selectedWorkspaceRef.value;
  const rootFolder = model?.rootFolder.value;
  if (
    model === null
    || workspaceRef === null
    || workspaceRef === undefined
    || rootFolder === null
    || rootFolder === undefined
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
  if (model.getItemByPath(targetPath) !== null) return { kind: "item", path: targetPath };
  if (findFolderByPath(rootFolder, targetPath) !== null) {
    return { kind: "folder", path: targetPath };
  }
  throw new Error(
    `Macro path does not identify an entity in the current workspace. Requested: ${JSON.stringify(target.path)}. Resolved: ${JSON.stringify(targetPath)}`,
  );
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

function collectAncestorFolders(root: TreeViewFolder | null, itemPath: string): TreeViewFolder[] {
  if (root === null) throw new Error("Command workspace is unavailable");
  const ancestors: TreeViewFolder[] = [];
  let folderPath = dirname(itemPath);
  while (true) {
    const folder = findFolderByPath(root, folderPath);
    if (folder === null) throw new Error("Command ancestor folder is unavailable");
    ancestors.unshift(folder);
    if (folder.path === root.path) return ancestors;
    folderPath = dirname(folderPath);
  }
}

function findFolderByPath(root: TreeViewFolder, path: string): TreeViewFolder | null {
  const pending = [root];
  while (pending.length > 0) {
    const folder = pending.shift();
    if (folder === undefined) continue;
    if (folder.path === path) return folder;
    pending.push(...folder.folders);
  }
  return null;
}

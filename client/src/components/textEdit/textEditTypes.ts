import { MacroParser, type MacroReference } from "../../../../common/macroParser";

export type TextEditParam = Readonly<{
  key: string;
  value: string;
  enabled: boolean;
}>;

export type TextEditParamGroup = Readonly<{
  id: string;
  name: string;
  sourceType: string;
  sourcePath: string;
  params: readonly TextEditParam[];
}>;

export type TextEditAdditionalParamScope = Readonly<{
  label: string;
  sourcePath: string;
  params: readonly TextEditParam[];
}>;

export type TextEditAdditionalParamsProvider = () => readonly TextEditAdditionalParamScope[];

export type TextEditCompletion = Readonly<{
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  isSnippet: boolean;
}>;

export type TextEditCompletionContext = Readonly<{
  linePrefix: string;
  word: string;
}>;

export type TextEditCompletionProvider = (
  context: TextEditCompletionContext,
) => readonly TextEditCompletion[];

export type ResolvedTextEditParamGroup = Readonly<{
  id: string;
  name: string;
  params: readonly ResolvedTextEditParam[];
  successful: boolean;
  error: string | null;
}>;

export type ResolvedTextEditParam = Readonly<{
  key: string;
  value: string;
  enabled: boolean;
  successful: boolean;
  error: string | null;
}>;

export type TextEditTextResolution = Readonly<{
  value: string;
  successful: boolean;
  error: string | null;
}>;

export type MacroDisplayDetail = Readonly<{
  key: string;
  sourceType: string;
  sourcePath: string;
  value: string;
  successful: boolean;
  error: string | null;
}>;

export type MacroAnalysis = Readonly<{
  revision: number;
  references: readonly MacroReference[];
  details: ReadonlyMap<string, MacroDisplayDetail>;
  textResolution: TextEditTextResolution;
}>;

type MergedTextEditParam = Readonly<{
  rawValue: string;
  sourceType: string;
  sourcePath: string;
}>;

export function cloneTextEditParamGroups(
  groups: readonly TextEditParamGroup[],
): TextEditParamGroup[] {
  return groups.map((group) => ({
    ...group,
    params: group.params.map((param) => ({ ...param })),
  }));
}

export function resolveTextEditParamGroup(
  group: TextEditParamGroup,
  additionalScopes: readonly TextEditAdditionalParamScope[] = [],
  overrideScopes: readonly TextEditAdditionalParamScope[] = [],
): ResolvedTextEditParamGroup {
  const mergedParams = createMergedParams(additionalScopes, group, overrideScopes);
  const params = group.params.map((param, index): ResolvedTextEditParam => {
    if (!param.enabled) {
      return {
        key: param.key,
        value: param.value,
        enabled: false,
        successful: true,
        error: null,
      };
    }
    const keyError = getTextEditParamKeyError(group.params, index);
    if (keyError !== null) {
      return {
        key: param.key,
        value: param.value,
        enabled: param.enabled,
        successful: false,
        error: keyError,
      };
    }
    try {
      return {
        key: param.key,
        value: resolveMergedParam(param.key, mergedParams),
        enabled: param.enabled,
        successful: true,
        error: null,
      };
    } catch (reason: unknown) {
      return {
        key: param.key,
        value: param.value,
        enabled: param.enabled,
        successful: false,
        error: errorMessage(reason),
      };
    }
  });
  const failed = params.find((param) => !param.successful);
  return {
    id: group.id,
    name: group.name,
    params,
    successful: failed === undefined,
    error: failed?.error ?? null,
  };
}

export function resolveTextEditText(
  text: string,
  group: TextEditParamGroup | null,
  additionalScopes: readonly TextEditAdditionalParamScope[] = [],
  overrideScopes: readonly TextEditAdditionalParamScope[] = [],
): TextEditTextResolution {
  try {
    const mergedParams = createMergedParams(additionalScopes, group, overrideScopes);
    const value = MacroParser.replaceMacrosInText(text, createMergedParamMap(mergedParams));
    const unresolvedKeys = MacroParser.extractKeys(value, true);
    if (unresolvedKeys.length > 0) throw new Error(`Unknown macro "${unresolvedKeys[0]}"`);
    return {
      value,
      successful: true,
      error: null,
    };
  } catch (reason: unknown) {
    return { value: text, successful: false, error: errorMessage(reason) };
  }
}

export function createMacroDisplayDetails(
  group: TextEditParamGroup | null,
  additionalScopes: readonly TextEditAdditionalParamScope[] = [],
  overrideScopes: readonly TextEditAdditionalParamScope[] = [],
): ReadonlyMap<string, MacroDisplayDetail> {
  const mergedParams = createMergedParams(additionalScopes, group, overrideScopes);
  const details = new Map<string, MacroDisplayDetail>();
  for (const [key, param] of mergedParams) {
    try {
      details.set(key, {
        key,
        sourceType: param.sourceType,
        sourcePath: param.sourcePath,
        value: resolveMergedParam(key, mergedParams),
        successful: true,
        error: null,
      });
    } catch (reason: unknown) {
      details.set(key, {
        key,
        sourceType: param.sourceType,
        sourcePath: param.sourcePath,
        value: param.rawValue,
        successful: false,
        error: errorMessage(reason),
      });
    }
  }
  return details;
}

export function getTextEditParamKeyError(
  params: readonly TextEditParam[],
  index: number,
): string | null {
  const param = params[index];
  if (param === undefined || param.key.length === 0) return "Key is required.";
  if (!MacroParser.validateParamPairs(new Map([[param.key, ""]])).isValid) {
    return "Key must start with a letter or underscore and use letters, numbers, underscores, dots, or dashes without empty segments.";
  }
  const previousIndex = params.findIndex((candidate) => candidate.key === param.key);
  return previousIndex === index ? null : `Key duplicates row ${previousIndex + 1}.`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function createMergedParams(
  additionalScopes: readonly TextEditAdditionalParamScope[],
  group: TextEditParamGroup | null,
  overrideScopes: readonly TextEditAdditionalParamScope[],
): ReadonlyMap<string, MergedTextEditParam> {
  const mergedParams = new Map<string, MergedTextEditParam>();
  for (const scope of additionalScopes) {
    appendParamScope(mergedParams, scope.label, scope.sourcePath, scope.params);
  }
  if (group !== null) {
    appendParamScope(mergedParams, group.sourceType, group.sourcePath, group.params);
  }
  for (const scope of overrideScopes) {
    appendParamScope(mergedParams, scope.label, scope.sourcePath, scope.params);
  }
  return mergedParams;
}

function appendParamScope(
  mergedParams: Map<string, MergedTextEditParam>,
  sourceType: string,
  sourcePath: string,
  params: readonly TextEditParam[],
): void {
  params.forEach((param, index) => {
    if (!param.enabled) return;
    if (getTextEditParamKeyError(params, index) !== null) return;
    mergedParams.set(param.key, { rawValue: param.value, sourceType, sourcePath });
  });
}

function createMergedParamMap(
  mergedParams: ReadonlyMap<string, MergedTextEditParam>,
): ReadonlyMap<string, string> {
  return new Map([...mergedParams].map(([key, param]) => [key, param.rawValue]));
}

function resolveMergedParam(
  rootKey: string,
  mergedParams: ReadonlyMap<string, MergedTextEditParam>,
): string {
  const dependencyValues = new Map<string, string>();
  const visitingKeys = new Set<string>();

  const appendDependency = (key: string): void => {
    if (dependencyValues.has(key)) return;
    if (visitingKeys.has(key)) {
      throw new Error(`Macro parameter cycle detected: ${[...visitingKeys, key].join(", ")}`);
    }
    const param = mergedParams.get(key);
    if (param === undefined) {
      throw new Error(`Macro parameter "${rootKey}" references unknown key "${key}"`);
    }
    visitingKeys.add(key);
    for (const dependency of MacroParser.extractKeys(param.rawValue, true)) {
      appendDependency(dependency);
    }
    visitingKeys.delete(key);
    dependencyValues.set(key, param.rawValue);
  };

  appendDependency(rootKey);
  return MacroParser.replaceMacrosInText(MacroParser.formatReference(rootKey), dependencyValues);
}

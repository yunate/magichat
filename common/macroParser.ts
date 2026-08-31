export class MacroParser {
  public static validateParamPairs(
    paramPairs: ReadonlyMap<string, string>,
  ): MacroParamValidationResult {
    for (const [key, value] of paramPairs) {
      if (typeof key !== "string" || !MacroParser._KEY_PATTERN.test(key)) {
        return { isValid: false, kind: "invalid-key", key };
      }
      if (typeof value !== "string") {
        return { isValid: false, kind: "invalid-value", key };
      }
      const invalidReferenceKey = MacroParser._findInvalidMacroKey(value);
      if (invalidReferenceKey !== null) {
        return { isValid: false, kind: "invalid-reference", key, invalidReferenceKey };
      }
    }

    const dependenciesByKey = new Map<string, readonly string[]>();
    for (const [key, value] of paramPairs) {
      const dependencies = MacroParser.extractKeys(value);
      for (const dependency of dependencies) {
        if (!paramPairs.has(dependency)) {
          return { isValid: false, kind: "unknown-reference", key, dependency };
        }
      }
      dependenciesByKey.set(key, dependencies);
    }

    const readyKeys = new Set<string>();
    while (readyKeys.size < dependenciesByKey.size) {
      let becameReadyCount = 0;
      for (const [key, dependencies] of dependenciesByKey) {
        if (readyKeys.has(key) || !dependencies.every((dependency) => readyKeys.has(dependency))) continue;
        readyKeys.add(key);
        becameReadyCount += 1;
      }
      if (becameReadyCount === 0) {
        return {
          isValid: false,
          kind: "cycle",
          keys: [...dependenciesByKey.keys()].filter((key) => !readyKeys.has(key)),
        };
      }
    }
    return { isValid: true };
  }

  public static extractReferences(text: string): MacroReference[] {
    const references: MacroReference[] = [];
    MacroParser._MACRO_CANDIDATE_PATTERN.lastIndex = 0;

    for (const match of text.matchAll(MacroParser._MACRO_CANDIDATE_PATTERN)) {
      const candidateKey = match[1];
      if (candidateKey === undefined) continue;
      const key = candidateKey.trim();
      if (!MacroParser._KEY_PATTERN.test(key)) {
        continue;
      }
      references.push({ key, start: match.index, end: match.index + match[0].length });
    }

    return references;
  }

  // Extracts macro keys from text in first occurrence order.
  // params:
  //   - text: Text containing `mh{key}` macros.
  //   - isStrictMode: Throws when an invalid macro key is found when true.
  // return:
  //   Extracted unique macro keys.
  // except:
  //   - Macro key "<key>" is invalid: Strict mode found an invalid macro key.
  public static extractKeys(
    text: string,
    isStrictMode = false,
  ): string[] {
    const keys = new Set<string>();
    if (isStrictMode) MacroParser._validateMacroCandidates(text);
    for (const reference of MacroParser.extractReferences(text)) {
      keys.add(reference.key);
    }

    return [...keys];
  }

  // Resolves parameter-pair value dependencies, then performs a single-pass macro replacement in text.
  // params:
  //   - text: Text containing `mh{key}` macros.
  //   - paramPairs: Parameter pairs whose values may contain dependent macros.
  // return:
  //   Replacement result. Unknown or invalid text macros may remain; use `extractKeys`
  //   to check remaining valid macro keys.
  // except:
  //   - Macro key "<key>" is invalid: A parameter key or strict macro candidate in a value is invalid.
  //   - Macro parameter value must be a string: A value is not a string at runtime.
  //   - Macro parameter references unknown key: A value references a missing parameter.
  //   - Macro parameter cycle detected: Remaining parameters cannot be resolved.
  //   - Macro parameter resolution is incomplete: A resolved state is unexpectedly missing.
  public static replaceMacrosInText(
    text: string,
    paramPairs: ReadonlyMap<string, string>,
  ): string {
    const resolvedParamPairs = MacroParser._replaceMacrosInParamPairs(paramPairs);
    return MacroParser._replaceMacroInText(
      text,
      (key) => resolvedParamPairs.get(key),
    );
  }

  public static formatReference(key: string): string {
    if (!MacroParser._KEY_PATTERN.test(key)) {
      throw new Error(MacroParser._invalidKeyMessage(key));
    }
    return `mh{${key}}`;
  }

  private static _replaceMacrosInParamPairs(
    paramPairs: ReadonlyMap<string, string>,
  ): Map<string, string> {
    type MacroParamState = {
      rawValue: string;
      dependencies: readonly string[];
      resolvedValue: string | null;
    };

    const validation = MacroParser.validateParamPairs(paramPairs);
    if (!validation.isValid) throw new Error(MacroParser._validationMessage(validation));

    const states = new Map<string, MacroParamState>();
    for (const [key, rawValue] of paramPairs) {
      const dependencies = MacroParser.extractKeys(rawValue);
      states.set(key, { rawValue, dependencies, resolvedValue: null });
    }

    let readyCount = 0;
    while (readyCount < states.size) {
      const readyValues = new Map<string, string>();
      for (const [key, state] of states) {
        if (state.resolvedValue !== null) {
          readyValues.set(key, state.resolvedValue);
        }
      }

      let becameReadyCount = 0;
      for (const state of states.values()) {
        if (
          state.resolvedValue === null
          && state.dependencies.every((dependency) => readyValues.has(dependency))
        ) {
          const value = MacroParser._replaceMacroInText(
            state.rawValue,
            (dependency) => readyValues.get(dependency),
          );
          state.resolvedValue = value;
          becameReadyCount += 1;
        }
      }

      if (becameReadyCount === 0) {
        const pendingKeys: string[] = [];
        for (const [key, state] of states) {
          if (state.resolvedValue === null) {
            pendingKeys.push(key);
          }
        }
        throw new Error(`Macro parameter cycle detected: ${pendingKeys.join(", ")}`);
      }

      readyCount += becameReadyCount;
    }

    const result = new Map<string, string>();
    for (const key of paramPairs.keys()) {
      const state = states.get(key);
      if (state === undefined || state.resolvedValue === null) {
        throw new Error("Macro parameter resolution is incomplete");
      }
      result.set(key, state.resolvedValue);
    }
    return result;
  }

  private constructor() {}

  private static _replaceMacroInText(
    text: string,
    resolveMacro: (key: string) => string | undefined,
  ): string {
    MacroParser._MACRO_CANDIDATE_PATTERN.lastIndex = 0;
    const parts: string[] = [];
    let lastIndex = 0;

    let match = MacroParser._MACRO_CANDIDATE_PATTERN.exec(text);
    while (match !== null) {
      parts.push(text.slice(lastIndex, match.index));
      const candidate = match[0];
      const candidateKey = match[1];
      const key = candidateKey?.trim();
      const replacement = key !== undefined && MacroParser._KEY_PATTERN.test(key)
        ? resolveMacro(key)
        : undefined;
      parts.push(replacement ?? candidate);
      lastIndex = match.index + candidate.length;
      match = MacroParser._MACRO_CANDIDATE_PATTERN.exec(text);
    }
    parts.push(text.slice(lastIndex));
    return parts.join("");
  }

  private static _validateMacroCandidates(text: string): void {
    const invalidKey = MacroParser._findInvalidMacroKey(text);
    if (invalidKey !== null) throw new Error(MacroParser._invalidKeyMessage(invalidKey));
  }

  private static _findInvalidMacroKey(text: string): string | null {
    MacroParser._MACRO_CANDIDATE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(MacroParser._MACRO_CANDIDATE_PATTERN)) {
      const candidateKey = match[1];
      if (candidateKey === undefined) continue;
      const key = candidateKey.trim();
      if (!MacroParser._KEY_PATTERN.test(key)) return key;
    }
    return null;
  }

  private static _validationMessage(validation: MacroParamValidationFailure): string {
    switch (validation.kind) {
      case "invalid-key": return MacroParser._invalidKeyMessage(validation.key);
      case "invalid-value": return "Macro parameter value must be a string";
      case "invalid-reference": return MacroParser._invalidKeyMessage(validation.invalidReferenceKey);
      case "unknown-reference": {
        return `Macro parameter "${validation.key}" references unknown key "${validation.dependency}"`;
      }
      case "cycle": return `Macro parameter cycle detected: ${validation.keys.join(", ")}`;
    }
  }

  private static _invalidKeyMessage(key: string): string {
    return `Macro key ${JSON.stringify(key)} is invalid`;
  }

  private static readonly _MACRO_CANDIDATE_PATTERN = /mh\{([^{}]*)\}/g;
  private static readonly _KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:[.-][A-Za-z0-9_]+)*$/;
}

export type MacroReference = {
  key: string;
  start: number;
  end: number;
};

export type MacroParamValidationResult =
  | { isValid: true }
  | MacroParamValidationFailure;

type MacroParamValidationFailure = {
  isValid: false;
} & (
  | { kind: "invalid-key"; key: string }
  | { kind: "invalid-value"; key: string }
  | { kind: "invalid-reference"; key: string; invalidReferenceKey: string }
  | { kind: "unknown-reference"; key: string; dependency: string }
  | { kind: "cycle"; keys: readonly string[] }
);
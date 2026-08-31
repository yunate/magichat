import { dump, load } from "js-yaml";

export type YamlMode = "toYaml" | "toJson";

export interface YamlSuccess {
  ok: true;
  text: string;
}

export interface YamlFailure {
  ok: false;
  error: string;
}

export type YamlResult = YamlSuccess | YamlFailure;

export function transformYaml(input: string, mode: YamlMode): YamlResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, text: "" };
  try {
    return mode === "toYaml" ? _jsonToYaml(trimmed) : _yamlToJson(input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Conversion failed" };
  }
}

function _jsonToYaml(input: string): YamlResult {
  const parsed: unknown = JSON.parse(input);
  return { ok: true, text: dump(parsed) };
}

function _yamlToJson(input: string): YamlResult {
  const parsed: unknown = load(input);
  if (parsed === undefined) return { ok: false, error: "YAML is empty or contains only comments" };
  return { ok: true, text: JSON.stringify(parsed, null, 2) };
}

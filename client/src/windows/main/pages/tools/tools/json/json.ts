export type JsonMode = "format" | "minify";

export interface JsonSuccess {
  ok: true;
  text: string;
}

export interface JsonFailure {
  ok: false;
  error: string;
}

export type JsonResult = JsonSuccess | JsonFailure;

export function transformJson(input: string, mode: JsonMode): JsonResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, text: "" };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const text = mode === "format" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    return { ok: true, text: text ?? "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to parse JSON" };
  }
}

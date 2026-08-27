import fs from "node:fs";

export type JsonFileReadResult =
  | { status: "loaded"; value: unknown }
  | { status: "missing" }
  | { status: "error"; reason: "read" | "parse"; message: string };

export function readJsonFileResult(file: string): JsonFileReadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") {
      return { status: "missing" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", reason: "read", message };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { status: "loaded", value: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", reason: "parse", message };
  }
}

// Read and JSON-parse a file, returning null when it is missing or unparsable
// (read/parse failures are logged). The returned value is untrusted external data,
// so callers own its runtime validation before use.
export function readJsonFile(file: string, tag: string): unknown {
  const result = readJsonFileResult(file);
  if (result.status === "loaded") return result.value;
  if (result.status === "error") {
    console.error(`[${tag}] failed to read/parse ${file}: ${result.message}`);
  }
  return null;
}

// Write a value as pretty JSON; failures are logged and swallowed so persistence
// never crashes the caller. The write goes to a sibling `.tmp` file and is then
// renamed over the target so a crash mid-write can never leave a half-written
// file that would fail to parse on the next read.
export function writeJsonFile(file: string, value: unknown, tag: string): void {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to write ${tmp}: ${message}`);
    return;
  }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to replace ${file}: ${message}`);
  }
}

import fs from "node:fs";
import path from "node:path";

// Per-task log persistence: each task appends its already-stamped lines to a plain
// `log.txt`. Appends are synchronous so lines of the same task keep their order and
// never interleave with a concurrent write; failures are logged and swallowed so a
// logging hiccup never crashes a task.

// Append stamped lines to a log file, creating the parent directory if needed. Each
// line is written on its own row.
export function appendLogLines(file: string, lines: string[], tag: string): void {
  if (lines.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, lines.map((line) => `${line}\n`).join(""), "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to append ${file}: ${message}`);
  }
}

// Read the whole log file as lines (missing file -> empty). The trailing newline never
// yields a spurious blank line. Read failures are logged and degrade to empty.
export function readLogLines(file: string, tag: string): string[] {
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (raw.length === 0) return [];
    const lines = raw.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to read ${file}: ${message}`);
    return [];
  }
}

// Read only the last `limit` lines of a log file (missing file -> empty).
export function readTailLogLines(file: string, limit: number, tag: string): string[] {
  const lines = readLogLines(file, tag);
  return lines.length > limit ? lines.slice(lines.length - limit) : lines;
}

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function readStrictJsonFile(filePath: string): unknown {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TreeView JSON file could not be read: ${filePath}. ${message}`);
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TreeView JSON file is invalid: ${filePath}. ${message}`);
  }
}

export function writeStrictJsonFileAtomic(filePath: string, value: unknown): void {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, filePath);
  } catch (error: unknown) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

export type MHFile = {
  json: string;
  extends: Map<string, string>;
};

export class MFFileSerializer {
  public static read(filePath: string): MHFile {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`MH file could not be read: ${filePath}. ${message}`);
    }

    const headers = [...content.matchAll(MFFileSerializer._HEADER_PATTERN)];
    const firstHeader = headers[0];
    const jsonEnd = firstHeader === undefined
      ? content.length
      : MFFileSerializer._removeSeparatorLength(content, firstHeader.index);
    const json = content.slice(0, jsonEnd);
    MFFileSerializer._validateJson(json, filePath);

    const extensions = new Map<string, string>();
    for (const [index, header] of headers.entries()) {
      const key = header[1];
      if (key === undefined) throw new Error(`MH file extension header is invalid: ${filePath}`);
      const headerEnd = header.index + header[0].length;
      const valueStart = MFFileSerializer._skipLineBreak(content, headerEnd);
      const nextHeader = headers[index + 1];
      const valueEnd = nextHeader === undefined
        ? content.length
        : MFFileSerializer._removeSeparatorLength(content, nextHeader.index);
      extensions.set(key, content.slice(valueStart, valueEnd));
    }
    return { json, extends: extensions };
  }

  public static write(filePath: string, value: MHFile): void {
    MFFileSerializer._validateJson(value.json, filePath);
    let content = value.json;
    for (const [key, extensionValue] of value.extends) {
      MFFileSerializer._validateKey(key);
      content += `\n---MH:${key}---\n${extensionValue}`;
    }

    const temporaryPath = MFFileSerializer._createTemporaryPath(filePath);
    try {
      fs.writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
      MFFileSerializer._renameWithRetry(temporaryPath, filePath);
    } catch (error: unknown) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  private static _renameWithRetry(sourcePath: string, targetPath: string): void {
    const deadline = performance.now() + MFFileSerializer._RENAME_RETRY_TIMEOUT_MS;
    for (;;) {
      try {
        fs.renameSync(sourcePath, targetPath);
        return;
      } catch (error: unknown) {
        const remainingMs = deadline - performance.now();
        if (remainingMs > 0) {
          Atomics.wait(
            new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
            0,
            0,
            Math.min(MFFileSerializer._RENAME_RETRY_DELAY_MS, remainingMs),
          );
          if (performance.now() < deadline) continue;
        }
        console.error(`Failed to rename ${sourcePath} to ${targetPath} within ${MFFileSerializer._RENAME_RETRY_TIMEOUT_MS}ms`);
        throw error;
      }
    }
  }

  private static _validateJson(json: string, filePath: string): void {
    try {
      JSON.parse(json);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`MH file JSON is invalid: ${filePath}. ${message}`);
    }
  }

  private static _validateKey(key: string): void {
    if (key.length === 0 || key.includes("\r") || key.includes("\n")) {
      throw new Error("MH file extension key must be a nonempty single-line string");
    }
  }

  private static _createTemporaryPath(filePath: string): string {
    return path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
  }

  private static _skipLineBreak(content: string, index: number): number {
    if (content.startsWith("\r\n", index)) return index + 2;
    if (content.startsWith("\n", index)) return index + 1;
    throw new Error("MH file extension header must occupy a complete line");
  }

  private static _removeSeparatorLength(content: string, index: number): number {
    if (index >= 2 && content.slice(index - 2, index) === "\r\n") return index - 2;
    if (index >= 1 && content[index - 1] === "\n") return index - 1;
    throw new Error("MH file extension header must occupy a complete line");
  }

  private static readonly _HEADER_PATTERN = /^---MH:([^\r\n]+)---\r?$/gm;
  private static readonly _RENAME_RETRY_TIMEOUT_MS = 300;
  private static readonly _RENAME_RETRY_DELAY_MS = 10;
}
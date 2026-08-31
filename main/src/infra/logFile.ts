import fs from "node:fs";
import path from "node:path";

const TAIL_READ_CHUNK_BYTES = 64 * 1024;

export function appendRotatingLogLines(
  file: string,
  archiveFile: string,
  lines: string[],
  maxBytes: number,
  tag: string,
): void {
  if (lines.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let currentBytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
    let pendingLines: string[] = [];
    let pendingBytes = 0;

    const flushPendingLines = (): void => {
      if (pendingLines.length === 0) return;
      fs.appendFileSync(file, pendingLines.join(""), "utf8");
      currentBytes += pendingBytes;
      pendingLines = [];
      pendingBytes = 0;
    };

    for (const line of lines) {
      const terminatedLine = `${line}\n`;
      const lineBytes = Buffer.byteLength(terminatedLine, "utf8");
      if (currentBytes + pendingBytes > 0
        && currentBytes + pendingBytes + lineBytes > maxBytes) {
        flushPendingLines();
        fs.rmSync(archiveFile, { force: true });
        fs.renameSync(file, archiveFile);
        currentBytes = 0;
      }
      pendingLines.push(terminatedLine);
      pendingBytes += lineBytes;
    }
    flushPendingLines();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to append ${file}: ${message}`);
  }
}

export function readTailLogLines(file: string, limit: number, tag: string): string[] {
  if (limit <= 0 || !fs.existsSync(file)) return [];
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(file, "r");
    let position = fs.fstatSync(descriptor).size;
    if (position === 0) return [];

    const chunks: Buffer[] = [];
    let newlineCount = 0;
    while (position > 0 && newlineCount <= limit) {
      const chunkLength = Math.min(TAIL_READ_CHUNK_BYTES, position);
      position -= chunkLength;
      const chunk = Buffer.allocUnsafe(chunkLength);
      const bytesRead = fs.readSync(descriptor, chunk, 0, chunkLength, position);
      const content = bytesRead === chunkLength ? chunk : chunk.subarray(0, bytesRead);
      chunks.unshift(content);
      for (const byte of content) if (byte === 0x0a) newlineCount += 1;
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    const lines = raw.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.length > limit ? lines.slice(lines.length - limit) : lines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] failed to read ${file}: ${message}`);
    return [];
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

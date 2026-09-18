import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { formatWithOptions } from "node:util";
import { gApplicationPaths } from "./applicationPaths";

const LOG_FILE_PATTERN = /^mh-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.log$/;
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
type ConsoleMethod = (...values: unknown[]) => void;

export class ScopeLogger implements Disposable {
  public constructor(name: string) {
    this._name = name;
    console.log(`${this._name} start`);
  }

  public [Symbol.dispose](): void {
    console.log(`${this._name} end`);
  }

  private readonly _name: string;
}

export class TimerLogger implements Disposable {
  public constructor(name: string) {
    this._name = name;
    this._startTimeMs = performance.now();
  }

  public [Symbol.dispose](): void {
    const elapsedMs = performance.now() - this._startTimeMs;
    console.log(`${this._name} took ${elapsedMs.toFixed(2)} ms`);
  }

  private readonly _name: string;
  private readonly _startTimeMs: number;
}

export class Logger {
  public async start(): Promise<void> {
    if (this._isStarted) return;
    this._isStarted = true;
    this._installConsoleBridge();
    try {
      await fs.mkdir(gApplicationPaths.logDirectoryPath, { recursive: true });
      const timestamp = new Date().toISOString()
        .slice(0, 19)
        .replace("T", "-")
        .replaceAll(":", "-");
      this._logFilePath = path.join(gApplicationPaths.logDirectoryPath, `mh-${timestamp}.log`);
      await fs.writeFile(this._logFilePath, "", { flag: "wx" });
      this._isFileEnabled = true;
      void this._cleanOldLogs();
    } catch (error: unknown) {
      this._reportFileFailure(error);
    }
  }

  public async dispose(): Promise<void> {
    await this._writeQueue;
    this._restoreConsole();
  }

  private _enqueue(level: LogLevel, scope: string, message: string): void {
    const logFilePath = this._logFilePath;
    if (!this._isFileEnabled || logFilePath === null) return;
    const sanitizedMessage = message.replaceAll("\r", "\\r").replaceAll("\n", "\\n");
    const line = `${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${sanitizedMessage}\n`;
    this._writeQueue = this._writeQueue.then(async () => {
      try {
        await fs.appendFile(logFilePath, line, "utf8");
      } catch (error: unknown) {
        this._reportFileFailure(error);
      }
    });
  }

  private async _cleanOldLogs(): Promise<void> {
    try {
      const expirationTime = Date.now() - LOG_RETENTION_MS;
      const entries = await fs.readdir(gApplicationPaths.logDirectoryPath, { withFileTypes: true });
      await Promise.all(entries
        .filter((entry) => entry.isFile() && LOG_FILE_PATTERN.test(entry.name))
        .map(async (entry) => {
          const logFilePath = path.join(gApplicationPaths.logDirectoryPath, entry.name);
          const stat = await fs.stat(logFilePath);
          if (stat.mtimeMs < expirationTime) await fs.rm(logFilePath);
        }));
    } catch (error: unknown) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      process.stderr.write(`[logger] Failed to clean old logs: ${message}\n`);
    }
  }

  private _installConsoleBridge(): void {
    console.debug = (...values: unknown[]) => this._forwardConsole(
      "DEBUG",
      this._originalConsole.debug,
      values,
    );
    console.log = (...values: unknown[]) => this._forwardConsole(
      "INFO",
      this._originalConsole.log,
      values,
    );
    console.info = (...values: unknown[]) => this._forwardConsole(
      "INFO",
      this._originalConsole.info,
      values,
    );
    console.warn = (...values: unknown[]) => this._forwardConsole(
      "WARN",
      this._originalConsole.warn,
      values,
    );
    console.error = (...values: unknown[]) => this._forwardConsole(
      "ERROR",
      this._originalConsole.error,
      values,
    );
  }

  private _forwardConsole(
    level: LogLevel,
    consoleMethod: ConsoleMethod,
    values: unknown[],
  ): void {
    consoleMethod(...values);
    const normalizedValues = values.map((value) => value instanceof Error
      ? `${value.name}: ${value.message}`
      : value);
    const formatted = formatWithOptions(
      { colors: false, depth: 4, breakLength: Infinity },
      ...normalizedValues,
    );
    const scopeMatch = /^\[([^\]]+)]\s*/.exec(formatted);
    const scope = scopeMatch?.[1] ?? "main";
    this._enqueue(level, scope, scopeMatch === null ? formatted : formatted.slice(scopeMatch[0].length));
  }

  private _restoreConsole(): void {
    if (!this._isStarted) return;
    console.debug = this._originalConsole.debug;
    console.log = this._originalConsole.log;
    console.info = this._originalConsole.info;
    console.warn = this._originalConsole.warn;
    console.error = this._originalConsole.error;
  }

  private _reportFileFailure(error: unknown): void {
    this._isFileEnabled = false;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`[logger] File logging disabled: ${message}\n`);
  }

  private readonly _originalConsole = {
    debug: console.debug.bind(console),
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  private _writeQueue: Promise<void> = Promise.resolve();
  private _logFilePath: string | null = null;
  private _isStarted = false;
  private _isFileEnabled = false;
}

export const gLogger = new Logger();
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  CLI_PAGE_TASK_CENTER,
} from "../../../../common/cli";
import {
  SCRIPT_TASK_KEY,
  type ScriptCreateParams,
  type ScriptType,
} from "../../../../common/tasks/scriptTaskDefinition";
import { MacroParser } from "../../../../common/macroParser";
import { getErrorMessage } from "../../utils/error";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { createCliEnvironment } from "../cli/cliEnvironment";
import { createScriptExecution, getScriptExtension } from "../scriptExecution";
import { Task, type TaskCallbacks } from "./task";

// Line-splitter state for one child stream (holds the trailing partial line).
interface LineState {
  rest: string;
}

// A one-shot local script run. Security: loopback-only local tool running scripts
// the user typed themselves (equivalent to their own terminal). The body is written
// to a random temp file and passed as an argv element to a fixed interpreter (spawn
// with an args array, never a shell string), so there is no shell-injection surface;
// the temp file is deleted on exit and nothing sensitive is logged.
export class ScriptTask extends Task {
  constructor(
    taskInfo: unknown,
    taskCreateParam: unknown,
    callbacks: TaskCallbacks,
    tmpDir: string,
  ) {
    super(taskInfo, taskCreateParam, callbacks);
    const params = this._getScriptParams();
    if (this.taskInfo.tasksSpectialInfo === undefined) {
      this.taskInfo.tasksSpectialInfo = {
        scriptType: params.scriptType,
        scriptContent: params.scriptContent,
        variables: { ...params.variables },
        exitCode: null,
      };
    }
    this._tmpDir = tmpDir;
  }

  protected _start(): void {
    const params = this._getScriptParams();
    const taskId = this.taskInfo.id;
    const tmpFile = path.join(this._tmpDir, `${taskId}${getScriptExtension(params.scriptType)}`);
    const paramPairs = new Map(Object.entries(params.variables));
    const scriptContent = MacroParser.replaceMacrosInText(params.scriptContent, paramPairs);
    const executableContent = this._createExecutableContent(params.scriptType, scriptContent);
    const execution = createScriptExecution(params.scriptType, executableContent, tmpFile);
    try {
      fs.writeFileSync(tmpFile, execution.content, "utf8");
    } catch (err) {
      const message = getErrorMessage(err);
      this._appendLog([`fatal: failed to write script file: ${message}`]);
      this._finish("failed");
      return;
    }

    this._appendLog([`spawn ${execution.command} (${params.scriptType})`]);
    let child: ChildProcess;
    try {
      child = spawn(execution.command, execution.args, {
        env: createCliEnvironment(process.env, {
          page: CLI_PAGE_TASK_CENTER,
          taskId,
        }),
        windowsHide: true,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      this._cleanupTmp(tmpFile);
      this._appendLog([`fatal: failed to spawn interpreter: ${message}`]);
      this._finish("failed");
      return;
    }
    this._child = child;

    const stdoutState: LineState = { rest: "" };
    const stderrState: LineState = { rest: "" };
    child.stdout?.on("data", (chunk: Buffer) => this._streamLines(stdoutState, chunk));
    child.stderr?.on("data", (chunk: Buffer) => this._streamLines(stderrState, chunk));

    child.on("error", (err) => {
      this._cleanupTmp(tmpFile);
      this._child = null;
      // A user stop or a server-shutdown dispose already owns this task's fate; do not
      // let the kill-triggered error mark it failed.
      if (this._isStopped || this._isDisposed || this._isTerminal()) return;
      this._appendLog([`fatal: process error: ${err.message}`]);
      this._updateInfo({ exitCode: null });
      this._finish("failed");
    });

    child.on("close", (code) => {
      this._flushLine(stdoutState);
      this._flushLine(stderrState);
      this._cleanupTmp(tmpFile);
      this._child = null;
      // A user stop already finished the task as abandoned; a server-shutdown dispose
      // kills the child on purpose (close code=null), so leave status running for the
      // next startup's resumable recovery instead of finishing it as failed.
      if (this._isStopped || this._isDisposed || this._isTerminal()) return;
      this._appendLog([`process exited with code ${code}`]);
      this._updateInfo({ exitCode: code });
      this._finish(code === 0 ? "succeeded" : "failed");
    });
  }

  protected _releaseResources(): void {
    if (this._child) {
      try {
        this._child.kill();
      } catch (err) {
        const reason = getErrorMessage(err);
        const taskId = this.taskInfo.id;
        console.warn(`[tasks] failed to kill child for ${taskId}: ${reason}`);
      }
      this._child = null;
    }
  }

  private _getScriptParams(): ScriptCreateParams {
    const createParam = this.createParam;
    if (createParam.type !== SCRIPT_TASK_KEY || createParam.params === undefined) {
      throw new Error("Script create params are required");
    }
    return createParam.params;
  }

  private _createExecutableContent(scriptType: ScriptType, scriptContent: string): string {
    if (scriptType !== "powershell") return scriptContent;
    const modulePath = gApplicationPaths.cliPowerShellModulePath.replaceAll("'", "''");
    return `Import-Module -Name '${modulePath}'\n${scriptContent}`;
  }

  private _streamLines(state: LineState, chunk: Buffer): void {
    state.rest += chunk.toString("utf8");
    const parts = state.rest.split(/\r?\n/);
    state.rest = parts.pop() ?? "";
    if (parts.length > 0) this._appendLog(parts);
  }

  private _flushLine(state: LineState): void {
    if (state.rest.length > 0) {
      this._appendLog([state.rest]);
      state.rest = "";
    }
  }

  private _cleanupTmp(tmpFile: string): void {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch (err) {
      const reason = getErrorMessage(err);
      console.warn(`[tasks] failed to remove temp file ${tmpFile}: ${reason}`);
    }
  }

  private readonly _tmpDir: string;
  private _child: ChildProcess | null = null;
}

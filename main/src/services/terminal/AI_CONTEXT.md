# Terminal Runtime

Main-side owner of per-Command interactive Windows PTYs.

## Structure

- `terminalRuntimeService.ts` implements the instance-level `TerminalServerRpcApi`, owns one `node-pty` process, and pushes PTY output unchanged through `TerminalClientRpcApi`.
- `terminalRuntimeManager.ts` tracks active services for application shutdown and owns the shared `data/tmp/terminal` helper-script directory.

## Boundaries

- Each RPC object is bound to its creating `BridgePeer`. Shell and interpreter executables are selected from shared enum values; renderer input cannot provide executable paths.
- Interactive PowerShell uses PSReadLine `SaveAtExit` history persistence. This avoids shared history-file synchronization on each command while retaining history when the shell exits normally.
- Interactive CMD uses the `CMD ` prompt prefix before its current-path prompt, matching PowerShell's visible `PS ` shell identification.
- Public RPC operations share one FIFO queue. `init()` idempotently connects the renderer notifier and never creates a PTY. `createPty()` atomically accepts the validated shell type and dimensions and returns the actual Windows PTY backend plus OS build for xterm resize compatibility, `stop()` writes Ctrl+C without waiting for shell state, and `destroyPty()` closes the process.
- PTY data and exit callbacks stay outside the operation queue. PTY output is forwarded unchanged. `run()` starts the helper through a short RPC call, while completion-file observation pushes `runCompleted(runId)` independently so long commands do not consume the bridge's 30-second request timeout budget.
- The runtime exposes whether the PTY process is active. It does not infer shell prompt state or parse PTY output; `run()` has a narrower deterministic state bounded by a unique completion file.
- `run()` writes the user script and a shell-specific wrapper to separate temporary files. Before invoking the wrapper, it sends Ctrl+C to clear pending shell input or interrupt an untracked foreground command so the invocation starts on a clean command line. The wrapper first creates a start-confirmation file; if it does not appear within three seconds, the run fails and completes instead of leaving the renderer in a permanent Running state. The interactive shell only invokes the wrapper, keeping the interpreter and completion-file implementation out of echoed input. The wrapper creates its unique completion file after the script exits; PowerShell uses `try/finally` so failed invocations also create it. Ctrl+C sent through Terminal input or `stop()` explicitly resolves the pending run because an interrupted shell is not guaranteed to finish the wrapper. Completed and interrupted runs stop file observation and delete all run files.
- Renderer notifier failure disables further notifications without closing the PTY. Peer disconnect, explicit disposal, or process shutdown still closes it.
- Helper-script deletion failures are logged. Shutdown retries cleanup at the directory level after all Terminal services have been disposed.

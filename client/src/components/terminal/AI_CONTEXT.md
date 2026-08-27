# Terminal Component

Reusable xterm.js surface backed by one main-side PTY runtime.

## Structure

- `Terminal.vue` owns xterm.js, FitAddon, resize observation, the instance FIFO queue, and lazy RPC initialization. Runtime and operation failures are emitted to the business owner and are not rendered inside the Terminal surface.
- `terminalClientRpcObject.ts` routes main-side output and stable runtime errors to the owning component.
- `terminalTypes.ts` defines the API exposed to business callers.

## Boundaries

- Mounting does not initialize xterm.js or create a PTY. `initialize()` idempotently initializes xterm.js with stdin disabled and creates the RPC runtime and notifier connection, while `createPty()` explicitly starts the requested shell. Callers await `initialize()` instead of mirroring completion through a ready event.
- The component contains no business toolbar, dialogs, polling, or Tab visibility logic. Command owns those interactions, while the shared persistent stack keeps mounted Terminal surfaces measurable.
- Main output callbacks write directly to xterm.js and do not enter the operation queue. Public operations and internal resize/dispose are ordered per component instance.
- `getCurrentLine()` reads the current cursor line from xterm's active buffer and joins wrapped screen rows into one logical line. It exposes displayed text only and does not imply that the shell is at a prompt.
- `createPty()` receives the shell type and dimensions as one atomic operation. Main returns the actual Windows PTY backend and OS build so xterm applies the matching resize and reflow behavior; debug sessions use WinPTY because ConPTY can deadlock while the inspector is attached. Business callers own the stop and PTY creation sequence.
- `run()` requires an active PTY and delegates every script type, including PowerShell, to the main-side helper-script execution path. It never creates a PTY. The start RPC returns immediately, and the component resolves its local Promise from the matching `runCompleted(runId)` push after the helper completion file is observed or the run is interrupted. Terminal input therefore remains available and long commands do not hit the bridge request timeout.
- Ctrl+V always reads text from the system clipboard and pastes it through xterm instead of sending the Ctrl+V control character to the PTY. Ctrl+C copies the current xterm selection and shows a success toast. Without a selection, Ctrl+C remains PTY input so it can interrupt the foreground command.
- `stop()` sends Ctrl+C without inferring or waiting for shell state. After the stop RPC succeeds, it resolves local pending run Promises as a deterministic interruption boundary even if the completion push is delayed. `destroyPty()` closes the shell process, then resets xterm state and scrollback. `clear()` writes the fixed `cls` command through the runtime and returns keyboard focus to xterm. Unmount disposes the remote runtime before destroying its proxy.

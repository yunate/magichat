# JavaScript Launcher

Native Windows launcher for running a JavaScript file through the current Electron or MagicHat executable.

## Contract

- `js-launcher <js-path> <runas> [parameters...]` starts the JavaScript file and writes the child process ID to stdout.
- The launcher resolves its parent process executable as the JavaScript host. `runas=false` sets `ELECTRON_RUN_AS_NODE=1` and starts that host directly with `CreateProcessW`.
- `runas=true` uses `ShellExecuteExW` to elevate another launcher instance. The elevated instance sets `ELECTRON_RUN_AS_NODE=1`, starts the host with `CreateProcessW`, and returns the host process ID through its process exit code.
- Parameters are treated as opaque values and re-encoded only to cross the Windows command-line boundary.

## Build

- `src/build-native.bat` builds `bin/js-launcher.exe` with MSVC C++20 and warnings as errors.
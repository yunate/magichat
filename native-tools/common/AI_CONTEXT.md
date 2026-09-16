# Native Common

Header-only C++20 primitives shared by native projects.

## Contract

- `windowsHandle.h` owns Win32 and Find handles through non-copyable RAII wrappers.
- `windowsError.h` converts captured Win32 error codes into operation errors.
- `windowsCommandLine.h` applies Windows argument quoting rules without constructing shell commands.
- Each consuming native project lists the exact shared headers it uses in `native-projects.json`, so header changes invalidate only affected targets.
# Launcher

Native C++20 Windows launcher for installed version selection.

## Contract

- `Launcher` owns version selection, active-version persistence, and process creation; `Version` owns strict four-component parsing and comparison.
- `src/utils/` contains only stateless filesystem, application-path, and string conversion functions.
- Resolves `%LOCALAPPDATA%\MagicHat` with `SHGetKnownFolderPath` and never derives the application root from the launcher location.
- Strictly reads the four-component version in `active-version` and starts `version\<version>\MagicHat.exe` with forwarded arguments.
- If the selected version directory is absent, selects the greatest launchable formal version and atomically replaces `active-version` before launch.
- Does not access the network, inspect update drafts, validate application contents beyond the fixed executable, or retry failed operations.

## Build

- `src/build-native.bat` compiles `src/index.cpp` as a statically linked x64 Windows executable with C++20 and warnings as errors, and embeds the packaged application icon through the Windows resource compiler.
- The unified native manifest produces `bin/launcher.exe` before startup or packaging.
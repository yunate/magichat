---
name: modern-cpp
description: "Modern C++17/20 implementation, refactoring, debugging, and review guidance. Use when working with .cpp, .cc, .cxx, .h, .hpp, CMake, MSVC, Clang, GCC, Win32 APIs, native CLI programs, RAII, ownership, error handling, binary protocols, Unicode, or compiler warnings."
argument-hint: "Describe the C++ implementation, refactoring, debugging, or review task"
user-invocable: true
---

# Modern C++

Use modern C++ language facilities while respecting the target platform, compiler, ABI, and project build system. Prefer direct code whose ownership and failure behavior are visible.

## Workflow

1. Read the build command, compiler flags, target standard, platform APIs, and adjacent protocol contracts.
2. State the observable behavior and identify boundaries for external input, ownership, encoding, and I/O.
3. Make the smallest complete design. Use classes for resources or stateful invariants, and free functions for focused stateless conversions.
4. Compile with the project's strictest warning settings. Treat warning-free compilation as required, but do not mistake editor toolchain misconfiguration for compiler evidence.
5. Run the narrowest behavioral test, including boundary data such as empty strings, Unicode, partial I/O, malformed frames, and maximum lengths when relevant.
6. Recheck resource release, integer conversions, error propagation, and public API size.

## Design

- Use RAII for every owned resource. A successful acquisition must immediately enter an owner whose destructor releases it.
- Make ownership explicit. Prefer values, references, `std::unique_ptr`, and move-only resource wrappers. Avoid owning raw pointers.
- Classes must own a lifecycle, resource, or invariant. Do not turn unrelated free functions into a utility class merely to appear object-oriented.
- Keep public APIs minimal. Constructors establish valid objects or throw; methods preserve class invariants.
- Delete copying for unique native resources. Add move operations only when a current caller needs them.
- Prefer composition over inheritance. Use virtual dispatch only for multiple real runtime implementations.
- Keep conversion and protocol code separate from transport and application orchestration.
- Use `constexpr`, scoped constants, and strong domain types where they prevent invalid states.

## Safety and correctness

- Initialize every object and field. Avoid uninitialized buffers and implicit narrowing conversions.
- Validate untrusted lengths before allocation, indexing, conversion, or arithmetic. Check both individual fields and complete frame size.
- Use `std::size_t` for in-memory sizes and convert to platform integer widths only after proving the value fits.
- Avoid C-style casts, `reinterpret_cast`, and `const_cast`. If a platform API forces a cast, isolate it at the boundary and keep the reason evident from types and naming.
- Never retain `std::string_view`, `std::wstring_view`, spans, pointers, or iterators beyond the lifetime of their source.
- Do not use exceptions for expected branching. Exceptions are appropriate for construction and operation failures that the current layer cannot complete.
- Catch at an application or translation boundary. Preserve useful context and return a nonzero process exit code on failure.
- Do not silently retry, substitute values, truncate data, or continue after failed native I/O unless the product explicitly defines that recovery behavior.

## Native resources and Win32

- Wrap `HANDLE` and similar resources in a small move-disabled RAII type. Treat `nullptr` and `INVALID_HANDLE_VALUE` according to the creating API.
- Capture `GetLastError()` immediately after the failing call, before cleanup or logging can overwrite it.
- For overlapped I/O, keep the event, buffer, and `OVERLAPPED` alive until completion or confirmed cancellation.
- Handle partial reads and writes. A successful API call does not imply the complete buffer was transferred.
- Distinguish Console handles from redirected byte streams. Use wide Console APIs for Unicode and UTF-8 bytes for redirected output when that is the protocol contract.
- Keep command execution argument-based. Do not construct shell command strings from untrusted values.

## Binary protocols

- Give every frame an explicit magic or version, byte order, field widths, and maximum total size.
- Encode and decode symmetrically. Validate magic, status values, counts, lengths, UTF-8, and trailing bytes.
- Treat transport fragmentation as normal. Read exact fixed headers first, validate lengths, then read exact payloads.
- Use the same byte-based limits on every implementation of the protocol.
- Keep protocol models independent from transport handles.

## Style

- Follow the repository's existing indentation, brace, naming, and file layout conventions.
- Prefer descriptive names over abbreviations. Boolean names begin with `is`, `has`, `can`, or `should`.
- Keep functions focused and use early returns to reduce nesting.
- Avoid macros except platform configuration or unavoidable C APIs.
- Add comments only for non-obvious platform constraints, ownership rules, protocol details, or concurrency behavior. Do not narrate code.
- Remove unused includes, dead branches, commented-out code, and speculative abstractions.

## Validation checklist

- The intended compiler accepts the selected C++ standard.
- Strict warnings pass, including the project's warnings-as-errors policy.
- Every acquired resource is released on success and all exceptions.
- No asynchronous operation outlives its event, buffer, or owner.
- Integer conversions are bounded before narrowing.
- Unicode behavior is correct for Console and redirected streams.
- Protocol implementations agree on field layout and limits.
- Tests or direct probes cover the changed success and failure boundaries.

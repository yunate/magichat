# Backend Infrastructure

Backend-owned stateful persistence services. Generic file and path helpers are shared under `main/src/infra/` and `main/src/utils/`.

- `configManager.ts` is the authoritative Config RPC owner. It validates keys and serializers before file access, preserves existing read defaults/error policies, writes atomically, and notifies local listeners only after successful writes. `setMainWindowBounds()` updates the current global record in one synchronous operation without overwriting page/theme changes made by another caller.
- Generic JSON, MH file, log, application-path and process-log implementations are reused from `../../infra/`. Physical path checks and error formatting are reused from `../../utils/`.
- Shared helpers keep their existing validation, error reporting, atomic-write and retry semantics. The calling business service retains ownership of business state and persistence decisions.
- The pure serialized TaskQueue is under `common/taskQueue.ts`, shared with Renderer and Broker.
- No migration fallback, automatic reload, new retry strategy, or alternate persistence owner is introduced here.
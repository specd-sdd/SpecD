# Proposal: move-impl-tracking-to-cli

## Motivation

Implementation file autodetection currently runs inside `GetStatus`, `TransitionChange`, and `CompileContext` whenever a change has historically entered `implementing`. That couples a VCS side effect to core use cases that other callers may invoke for pure reads, transitions, or context compilation. It also blocks alternative tracking strategies: the CLI needs on-demand refresh at command boundaries, while MCP (future) will keep an active process and update tracked files via a filesystem watcher—not by re-running detection inside shared use cases. Removing refresh from those use cases is the main enabler for delivery-specific tracking without redundancy.

## Current behaviour

- **`GetStatus`** (`core:get-status`): before building the status view, mutates the change via `ChangeRepository.mutate`, calls `ImplementationDetector.detectModifiedFiles`, and adds any new paths to `trackedImplementationFiles` with state `open` when `getHistoricalImplementationAt()` is non-null.
- **`TransitionChange`** (`core:transition-change`): runs the same detection block inside its pre-transition `mutate` when the historical implementing guard is satisfied.
- **`cli:change-status`** and **`cli:change-transition`**: call the core use cases directly; they do not orchestrate detection themselves. They may enrich implementation output with graph diagnostics but do not reimplement detector logic.
- **`CompileContext`** (`core:compile-context`): runs the same detection block inside `ChangeRepository.mutate` before assembling context when the historical implementing guard is satisfied.
- **`cli:change-context`**: calls `CompileContext` directly; does not orchestrate refresh itself.
- **`UpdateImplementationTracking`** handles explicit mutations (`add`, `remove`, `ignore`, `resolve`) only; there is no dedicated use case for “refresh from detector”.

## Proposed solution

1. Introduce a focused core use case **`RefreshImplementationTracking`** (spec `core:refresh-implementation-tracking`) that:
   - loads the change;
   - skips when `getHistoricalImplementationAt()` is null;
   - otherwise calls `ImplementationDetector.detectModifiedFiles` and merges new paths into tracked files (same semantics as today: only add missing paths as `open`);
   - persists via `ChangeRepository.mutate`.
2. **Remove** autodetection from `GetStatus`, `TransitionChange`, and `CompileContext` (including `ImplementationDetector` from their constructors and kernel wiring). Use cases that expose implementation state continue to **project** it from the loaded `Change` where applicable.
3. **Orchestrate from CLI**: `cli:change-status`, `cli:change-transition`, and `cli:change-context` call `RefreshImplementationTracking` **before** `GetStatus`, `TransitionChange`, or `CompileContext`, using the same guard (historical implementing). The refresh use case applies the guard internally so CLI callers invoke it unconditionally before the downstream use case.
4. Keep **`cli:change-implementation`** commands on persisted state only for `list` (no automatic refresh), avoiding double detection when the user just ran `changes status` or `changes context`.

Callers that need VCS-backed refresh (today: CLI lifecycle commands) invoke `RefreshImplementationTracking` explicitly before `GetStatus`, `TransitionChange`, or `CompileContext`. **MCP is out of scope for this change** and is not required to call that use case: future MCP integration will update tracked files through a filesystem watcher while the server process is active.

## Specs affected

### New specs

- `core:refresh-implementation-tracking`: Application use case that runs targeted implementation autodetection and merges results into a change’s tracked implementation files.
  - Depends on: `core:change`, `core:implementation-detector-port`, `core:storage`

### Modified specs

- `core:get-status`: Remove “autodetection on status load”; `GetStatus` becomes read-only with respect to implementation tracking (load + project only).
  - Depends on (added): none

- `core:transition-change`: Remove “autodetection before transition”; transition logic assumes tracking was refreshed by the caller when needed.
  - Depends on (added): none

- `cli:change-status`: Require orchestration: call `RefreshImplementationTracking` before `GetStatus` when historical implementing applies; clarify that implementation section still serializes `GetStatus` projection (graph enrichment unchanged).
  - Depends on (added): `core:refresh-implementation-tracking`

- `cli:change-transition`: Require orchestration: call `RefreshImplementationTracking` before `TransitionChange` under the same guard; avoid duplicate refresh on failure paths that also call `GetStatus` unless explicitly required.
  - Depends on (added): `core:refresh-implementation-tracking`

- `core:compile-context`: Remove implementation autodetection from context compilation; `CompileContext` assumes tracking was refreshed by the caller when needed.
  - Depends on (added): none

- `cli:change-context`: Require orchestration: call `RefreshImplementationTracking` before `CompileContext`.
  - Depends on (added): `core:refresh-implementation-tracking`

- `core:implementation-detector-port`: Retarget “who invokes the port” from `GetStatus` / `CompileContext` / pre-transition use cases to `RefreshImplementationTracking` only. The port spec stays in the application layer and MUST NOT name delivery adapters (CLI, MCP, etc.).
  - Depends on (added): `core:refresh-implementation-tracking`

## Impact

| Area                                                                         | Change                                                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/application/use-cases/get-status.ts`                      | Remove detector dependency and pre-status `mutate` detection loop                                                                                                     |
| `packages/core/src/application/use-cases/transition-change.ts`               | Remove detector dependency and pre-transition detection loop                                                                                                          |
| `packages/core/src/application/use-cases/compile-context.ts`                 | Remove detector dependency and pre-compile detection loop                                                                                                             |
| `packages/core/src/application/use-cases/refresh-implementation-tracking.ts` | **New** shared refresh use case                                                                                                                                       |
| `packages/core/src/composition/kernel.ts`                                    | Wire `refreshImplementationTracking`; drop detector from status/transition/compile-context factories                                                                  |
| `packages/cli/src/commands/change/status.ts`                                 | Call refresh before status                                                                                                                                            |
| `packages/cli/src/commands/change/transition.ts`                             | Call refresh before transition                                                                                                                                        |
| `packages/cli/src/commands/change/context.ts`                                | Call refresh before compile context                                                                                                                                   |
| Tests                                                                        | Update `get-status`, `transition-change`, `compile-context` specs; add refresh use case tests; extend CLI command tests                                               |
| `core:implementation-detector-port`                                          | Delta: port invoked by `RefreshImplementationTracking`, not by `GetStatus` / `TransitionChange` / `CompileContext`; no delivery-layer callers named in this core spec |

## Technical context

- Guard in code today: `freshChange.getHistoricalImplementationAt() !== null` (aligned with `core:change` historical implementing signal).
- Detection merge today: for each detected path, if not already in `trackedImplementationFiles`, call `trackImplementationFile(file, 'open')`.
- `projectImplementationTracking` in `_shared/implementation-tracking.ts` remains the projection helper for results.
- Rejected: keeping autodetection in core and deduplicating inside the detector (user prefers explicit, delivery-specific tracking over hidden idempotency).
- Rejected: removing autodetection from status/transition entirely (still required at CLI command boundaries via refresh orchestration).
- **MCP (future, not in this change):** long-running MCP process will use a **filesystem watcher** to keep `trackedImplementationFiles` current while the agent runs. It will not rely on `RefreshImplementationTracking` or on embedding detection in `GetStatus` / `CompileContext` / `TransitionChange`. Document in `design.md` as follow-up; no MCP spec delta here.
- Core specs (`RefreshImplementationTracking`, `implementation-detector-port`, read-only use cases) remain **delivery-agnostic**—they must not prescribe CLI or MCP behaviour.

## Resolved (formerly open)

- **`cli:project-context`** — No action in this change. The command calls `GetProjectContext` (project-level `context:` + include/exclude patterns), not `CompileContext`. There is no active change, no `trackedImplementationFiles`, and no historical-implementing guard. Implementation refresh does not apply; no spec delta required.

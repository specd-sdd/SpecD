# Proposal: start-implementation-tracking

## Motivation

Implementation tracking in specd is currently tightly coupled to the `implementing` lifecycle transition: detection only begins once a change records a `transitioned` event to `implementing` via `change.hasEverReachedImplementing`. Operators and AI agents lack a way to explicitly start implementation tracking on demand through a dedicated CLI command, and the core domain relies on scanning append-only history events rather than checking an explicit persisted tracking field in the change manifest (`manifest.json`).

All implementation tracking operations must adhere strictly to the principle that **any state mutation is channeled exclusively through existing mutation commands, domain invariants, and mutation use cases (`UpdateImplementationTracking` and `ChangeRepository.mutate`)**, without introducing disjoint mutation paths.

## Current behaviour

- Implementation detection is gated on `change.hasEverReachedImplementing`, which scans `change.history` for `evt.type === 'transitioned' && evt.to === 'implementing'`.
- There is no CLI subcommand under `specd changes implementation` to explicitly initiate tracking.
- The change manifest `manifest.json` does not persist a dedicated tracking activation field; tracking state is implicitly inferred from lifecycle history.
- If an operator or agent starts modifying implementation files before or outside the `implementing` lifecycle state, automatic VCS candidate detection cannot be initiated explicitly.

## Proposed solution

1. **Domain Model & Invariant Encapsulation (`Change` Entity in `@specd/core`)**:
   - Add private field `_implementationTrackingStartedAt: Date | null = null`.
   - Add getter `get implementationTrackingStartedAt(): Date | null`.
   - Add getter `get isImplementationTrackingActive(): boolean { return this._implementationTrackingStartedAt !== null }`.
   - Add domain mutation method `startImplementationTracking(at: Date = new Date()): void` which sets `_implementationTrackingStartedAt = at` if it was `null`. If already active, the operation is idempotent and retains the existing start timestamp.
   - All mutations on this field are strictly encapsulated within the entity and executed within serialized `ChangeRepository.mutate()` transactions.

2. **Manifest Persistence (`manifest.json` & `core:change-manifest`)**:
   - In `manifest.json`, persist optional field `"implementationTrackingStartedAt": "<ISO-8601-string>" | null`.
   - On deserialization / hydration in `FsChangeRepository` / `Change.fromRaw`:
     - If `"implementationTrackingStartedAt"` is present, parse it as `Date`.
     - Backward compatibility fallback: if `"implementationTrackingStartedAt"` is absent / undefined, evaluate `change.getHistoricalImplementationAt()`. If the change has historically reached `implementing`, initialize `_implementationTrackingStartedAt` with that historical timestamp; otherwise initialize with `null`.

3. **Lifecycle Backward Compatibility (`core:transition-change`)**:
   - In `TransitionChange.execute()`, within the existing `_changes.mutate()` transition block, when `input.to === 'implementing'` and `!change.isImplementationTrackingActive`, invoke `change.startImplementationTracking(transitionTimestamp)`. This guarantees that transitioning to `implementing` automatically activates implementation tracking exactly as before while remaining inside the existing lifecycle mutation transaction.

4. **Detection Execution (`core:refresh-implementation-tracking` & `core:vcs-implementation-detector`)**:
   - Update `RefreshImplementationTracking.execute()` to guard candidate detection on `freshChange.isImplementationTrackingActive` instead of `freshChange.getHistoricalImplementationAt() !== null`.
   - Update `VcsImplementationDetector.detectModifiedFiles()` to resolve the baseline revision from `change.implementationTrackingStartedAt` rather than scanning history.

5. **Mutation Primitive Extension (`core:update-implementation-tracking`)**:
   - All implementation mutations (including `start`) MUST go through the canonical `UpdateImplementationTracking` use case:
     ```typescript
     export type UpdateImplementationTrackingAction =
       | 'add'
       | 'remove'
       | 'ignore'
       | 'resolve'
       | 'unresolve'
       | 'start'
     ```
   - Update `UpdateImplementationTrackingInput` to make `file?: string` optional when `action === 'start'`.
   - When `input.action === 'start'`, validate the change exists, invoke `change.startImplementationTracking()`, and persist the updated projection through `_changes.mutate()`.

6. **CLI Subcommand (`@specd/cli` & `cli:change-implementation`)**:
   - Register `specd changes implementation start <name>` under `registerChangeImplementation()` in `packages/cli/src/commands/change/implementation.ts`.
   - The command delegates exclusively to `UpdateImplementationTracking` with `{ name, action: 'start' }`.
   - Support `--format text|json|toon` and `--config <path>`.
   - Output formatting:
     - `text`: Renders confirmation message indicating whether tracking was newly started or was already active, with the active timestamp.
     - `toon`:
       ```toon
       result: ok
       name: <name>
       trackingActive: true
       startedAt: <iso-timestamp>
       ```

## Specs affected

### New specs

_None_

### Modified specs

- `cli:change-implementation`: Adds the `start` subcommand to `specd changes implementation` and specifies its behavior, options, and output formats.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change`: Adds `implementationTrackingStartedAt`, `isImplementationTrackingActive`, and `startImplementationTracking(at?: Date)` domain members.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-manifest`: Specifies serialization and deserialization of `implementationTrackingStartedAt` in `manifest.json` with legacy fallback semantics.
  - Depends on (added): none
  - Depends on (removed): none
  - Depends on (removed): none
- `core:transition-change`: Guarantees that the first transition to `implementing` activates implementation tracking if not already active within the existing transition mutation.
  - Depends on (added): none
  - Depends on (removed): none
- `core:refresh-implementation-tracking`: Updates candidate detection guard to check `change.isImplementationTrackingActive`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-implementation-tracking`: Exposes the `'start'` action in `UpdateImplementationTrackingAction` as the sole entry point for explicit tracking activation mutations.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`@specd/core`**:
  - `packages/core/src/domain/entities/change.ts`
  - `packages/core/src/infrastructure/repositories/fs-change-repository.ts`
  - `packages/core/src/application/use-cases/update-implementation-tracking.ts`
  - `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`
  - `packages/core/src/application/use-cases/transition-change.ts`
  - `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`
- **`@specd/cli`**:
  - `packages/cli/src/commands/change/implementation.ts`
- **Existing changes / manifests**:
  - Full backward compatibility: changes without `implementationTrackingStartedAt` in `manifest.json` evaluate legacy historical transitions or activate on entering `implementing`.

## Technical context

- **Unified Mutation Pipeline**: No secondary mutation routes are introduced. All implementation modifications go through `UpdateImplementationTracking` and `ChangeRepository.mutate()`.
- **Domain Entity**: `Change` maintains immutable history events and mutable state projection. `_implementationTrackingStartedAt` stores the exact point in time when implementation tracking commenced.
- **VCS Base Ref Resolution**: `VcsImplementationDetector` uses `implementationTrackingStartedAt` with `vcs.refAt(isoString)` to find the Git commit base reference.
- **Idempotency**: Running `specd changes implementation start <name>` multiple times is idempotent and preserves the initial baseline timestamp.
- **Zero Breaking Changes**: Existing tests for `TransitionChange`, `RefreshImplementationTracking`, and `FsChangeRepository` will remain compatible through the hydration fallback.

## Open questions

_None._

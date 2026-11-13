# Spec Compliance Audit Report — Batch `deps` (`support-commas-in-names`)

**Audited specs:**

1. `core:update-spec-deps`
2. `cli:change-deps`
3. `core:update-persisted-spec-deps`
4. `cli:spec-deps`

**Cross-cutting contracts checked:** `default:_global/cross-platform`, `default:_global/architecture`, `default:_global/error-handling-conventions`, `default:_global/testing`.

---

## Summary Counts

- **Specs audited:** 4 (`core:update-spec-deps`, `cli:change-deps`, `core:update-persisted-spec-deps`, `cli:spec-deps`)
- **Discrepancies:** 2 (0 HIGH, 0 MEDIUM, 2 LOW)
  - `core:update-spec-deps`: 1 LOW (minor spec-wording drift: "Change lookup" references `ChangeRepository.get` while implementation and "Persistence and output" use `ChangeRepository.mutate`)
  - `core:update-persisted-spec-deps`: 1 LOW (minor spec drift: `resolveUpdatePersistedSpecDepsDeps` resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` instead of `specs` + `initializePersistedSpecState`)
- **Missing / partial tests:** 4 minor test-coverage gaps (no blocking gaps; core logic is covered)
- **Test runs executed:**
  - `@specd/core`: 4 test files, **62 / 62 tests passed** (`update-spec-deps.spec.ts`: 31, `composition/update-spec-deps.spec.ts`: 3, `update-persisted-spec-deps.spec.ts`: 25, `composition/update-persisted-spec-deps.spec.ts`: 3)
  - `@specd/cli`: 3 test files, **97 / 97 tests passed** (`change-deps.spec.ts`: 33, `spec-deps.spec.ts`: 19, `handle-error.spec.ts`: 45)

---

## 1. `core:update-spec-deps`

### Requirements Summary

- `UpdateSpecDeps.execute` accepts `{ name, specId, add?, remove?, set?, clear? }` without splitting or joining ID lists.
- Loads change by `name`, throwing `ChangeNotFoundError` if absent, and requires `specId` (normalized) to be in `change.specIds` (otherwise `InvalidInputError`).
- Enforces mutual exclusivity (`set` vs `add`/`remove`/`clear`; `clear` vs `add`/`remove`) and requires at least one operation (`InvalidInputError` with `INVALID_INPUT`).
- Validates and normalizes `specId`, `add`, and `set` via `parseSpecId` before any mutation (`InvalidSpecIdError` / `WorkspaceNotFoundError`); dependency targets need not exist yet. `remove` normalizes valid IDs and keeps invalid IDs literal, checking existence sequentially (`InvalidInputError`).
- Applies `remove` before `add` (idempotent) via shared `applyDependsOnMutation`, persists via `ChangeRepository.mutate(name, fn)` calling `change.setSpecDependsOn`, and returns `{ specId, dependsOn }`.
- `createUpdateSpecDeps(config, options?)` delegates through `resolveUpdateSpecDepsDeps(resolver)`.

### Implementation Status

**Compliant** (1 LOW spec-drift note).

- `packages/core/src/application/use-cases/update-spec-deps.ts`:
  - Lines 7–28: `UpdateSpecDepsInput` and `UpdateSpecDepsResult` match the contract.
  - Lines 64–67: `this._workspaces = [...workspaces]` materializes one-shot iterables (e.g., `Map.keys()`) for repeated executions.
  - Lines 81–99: Enforces mutual exclusivity and minimum-operation checks with `InvalidInputError`.
  - Lines 101–114: Validates `specId`, `add`, and `set` with `parseSpecId` before calling `mutate`; `remove` uses `tryNormalizeDepId` (lines 37–46).
  - Lines 116–136: Calls `this._changes.mutate(input.name, ...)`, checks `change.specIds.includes(specId)`, delegates mutation to `applyDependsOnMutation` (`packages/core/src/application/use-cases/_shared/apply-depends-on-mutation.ts:19-73`), calls `change.setSpecDependsOn(specId, result)`, and returns `{ specId, dependsOn: result }`.
- `packages/core/src/composition/use-cases/update-spec-deps.ts`:
  - Lines 27–32: `resolveUpdateSpecDepsDeps(resolver)` resolves `changes` and `workspaces`.
  - Lines 78–87: `createUpdateSpecDeps(config, options?)` creates a composition resolver and delegates through `resolveUpdateSpecDepsDeps(resolver)`.
- `_global/*` compliance: Pure application/composition separation, `SpecdError` subtypes only, no platform-specific I/O.

### Discrepancies

1. **[LOW] "Change lookup" wording vs `ChangeRepository.mutate` usage**
   - **Evidence:** `core:update-spec-deps` spec states under _Requirement: Change lookup_: _"The use case MUST load the change by `name` via `ChangeRepository.get`."_ However, _Requirement: Persistence and output_ in the same spec requires `ChangeRepository.mutate(name, fn)`, and `packages/core/src/application/use-cases/update-spec-deps.ts:116` calls `this._changes.mutate(input.name, ...)` directly (which performs the lookup and throws `ChangeNotFoundError` if missing).
   - **Assessment:** **Spec drift** (unlikely to be an implementation bug, since calling `get` before `mutate` would be redundant and `mutate` is explicitly required for serialized persistence).

### Test Coverage

- `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31 tests, all passing):
  - Covers `add`, `remove`, `set`, `clear`, `set: []`, `add+remove`, one-shot `Map.keys()`, `ChangeRepository.mutate` spy, exclusivity matrix, `INVALID_INPUT` code, missing change, `specId` not in change, missing op, missing `remove` target, idempotent `add`, absent `specDependsOn`, `set: ['']`, `add: [' ']`, comma-containing IDs (`a,b`, `core:a,b`), malformed IDs, unknown workspace, non-existent dependency target, bare ID qualification, invalid entry among valid ones storing nothing, and removing invalid stored values / bare IDs.
- `packages/core/test/composition/use-cases/update-spec-deps.spec.ts` (3 tests, all passing):
  - Covers `resolveUpdateSpecDepsDeps(resolver)`, config-based `createUpdateSpecDeps(config)`, and explicit-deps `createUpdateSpecDeps(deps)`.

### Missing Tests

- `Scenario: Same ID in remove and add ends up present` (e.g., `remove: ['default:core/a']` and `add: ['default:core/a']` moving it to the end) is not explicitly asserted in `update-spec-deps.spec.ts` (though `applyDependsOnMutation` is tested for this in `update-persisted-spec-deps.spec.ts:354-367`).

---

## 2. `cli:change-deps`

### Requirements Summary

- Exposes `specd change deps <name> [<specId>] [--add <id>...] [--remove <id>...] [--set <id>...] [--clear] [--force] [--format text|json|toon] [--config <path>]`.
- Forwards `<specId>`, `--add`, `--remove`, and `--set` raw without parsing, qualifying, or splitting on commas; display mode uses `GetChangeSpecDeps`.
- `--clear` requires confirmation on interactive terminals (or `--force`), exits 1 on non-interactive terminals without `--force`, and exits 0 with `cancelled` when declined.
- Outputs normalized `specId` returned by the use case across text, JSON, and TOON formats.
- Exits 1 with `error:` to stderr on all error cases.

### Implementation Status

**Compliant.**

- `packages/cli/src/commands/change/deps.ts`:
  - Lines 14–34: Registers `deps <name> [specId]` with `.allowExcessArguments(false)`, repeatable `--add`/`--remove`/`--set` via `collect` (no comma splitting), `--clear`, `--force`, `--format`, `--config`.
  - Lines 78–91: Fast-fail `cliError` checks for missing `specId` with modification flags, `--clear` conflicts, and `--set` conflicts.
  - Lines 94–139: Display mode (`specId` present) calls `kernel.changes.getSpecDeps.execute({ name, specId })` without any spec ID parser; list mode calls `kernel.changes.status.execute({ name })`.
  - Lines 141–157: `--clear` calls `confirmOrExit` with `--clear requires confirmation; pass --force to skip it`; prints `cancelled` (or `{ result: 'cancelled' }`) and returns 0 when declined.
  - Lines 159–185: Modification mode forwards raw `specId` and flags to `kernel.changes.updateSpecDeps.execute`, renders `result.specId` and `result.dependsOn`, and delegates errors to `handleError(err, opts.format)`.
- `_global/*` compliance: Thin CLI adapter delegating to `kernel.changes.*`, no business logic or direct I/O.

### Discrepancies

None.

### Test Coverage

- `packages/cli/test/commands/change-deps.spec.ts` (33 tests, all passing):
  - Covers `add`, `remove`, `set`, real-kernel integration test verifying normalized IDs, JSON/TOON/text formats, `(none)` display, list-all mode, display-one mode via `GetChangeSpecDeps`, all error cases (`ChangeNotFoundError`, `SpecNotInChangeError`, `--set`+`--add`, `--clear` conflicts, missing `specId`, `--set ""`, `--set "core:a,b"`, `--add " "`, `InvalidSpecIdError`, `WorkspaceNotFoundError` in display mode), raw forwarding, clear confirmation (accepted, declined, `--force`, non-TTY), `--help` listing `--clear`/`--force`, and static source check verifying no `parseSpecId` or `listWorkspaces`.

### Missing Tests

- `Scenario: Unknown workspace in a dependency` (`--add nope:auth/login`) is tested for display mode (`getSpecDeps` with `WorkspaceNotFoundError` at lines 700–715), not explicitly in modification mode (`updateSpecDeps`), though both use the same `handleError` path.

---

## 3. `core:update-persisted-spec-deps`

### Requirements Summary

- `UpdatePersistedSpecDeps.execute` accepts `{ specId, add?, remove?, set?, clear? }`.
- Enforces mutual exclusivity (`set` vs `add`/`remove`/`clear`; `clear` vs `add`/`remove`) and minimum operation (`InvalidInputError`).
- Validates `specId`, `add`, and `set` via `parseSpecId` before any I/O; checks `readOnly` workspace ownership before I/O (`ReadOnlyWorkspaceError`); verifies target existence for `add` and `set` (`SpecNotFoundError`); verifies target `specId` exists (`SpecNotFoundError`).
- `remove`/`set`/`clear` read persisted state with `{ lenientDependsOn: true }`, while `add` reads strictly; `remove` normalizes valid IDs and matches invalid IDs literally; post-mutation check throws `InvalidSpecLockError` if any invalid `dependsOn` entry remains.
- Missing persisted state: `set`/`clear` create state without artifact derivation; non-empty `add` derives initial base via `resolveInitialPersistedDependsOn()`, applies `remove` then `add`, and creates state (`created: true, initialized: true`); `remove` alone or empty `add` is a no-op (`created: false, initialized: false`, no write).
- Applies patch via `applyPersistedSpecStatePatch` and writes with `expectedRevision: originalHash` (or `null`), propagating `ArtifactConflictError` without retry.
- `createUpdatePersistedSpecDeps(config, options?)` delegates through `resolveUpdatePersistedSpecDepsDeps(resolver)`.

### Implementation Status

**Compliant** (1 LOW spec-drift note).

- `packages/core/src/application/use-cases/update-persisted-spec-deps.ts`:
  - Lines 99–115: Mutual exclusivity and minimum operation checks.
  - Lines 117–129: `parseSpecId` validation on `specId`, `add`, `set`, followed by `repo.ownership() === 'readOnly'` check before any target or spec I/O.
  - Lines 131–137: Target existence check for `add` and `set` (`SpecNotFoundError`).
  - Lines 139–162: `tryNormalizeDepId` for `remove`; `repo.get` check (`SpecNotFoundError`); `readPersistedState(spec, isRepairOp ? { lenientDependsOn: true } : undefined)`.
  - Lines 169–197: Raw-match precedence for `remove` against stored entries, `applyDependsOnMutation`, post-mutation `isFullyQualifiedSpecId` check throwing `InvalidSpecLockError(..., 'dependsOn.${i}', ...)`, `applyPersistedSpecStatePatch`, conditional `writePersistedState` with `expectedRevision: current.originalHash`.
  - Lines 208–260: `_createMissingState` handles no-op (`!createsState`), `set`/`clear` (skips derivation), non-empty `add` (calls `resolveInitialPersistedDependsOn`, applies `remove` + `add`, writes with `expectedRevision: null`).
- `packages/core/src/composition/use-cases/update-persisted-spec-deps.ts`:
  - Lines 38–48: `resolveUpdatePersistedSpecDepsDeps(resolver)` resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher`.
  - Lines 108–109: `createUpdatePersistedSpecDeps(config, options?)` delegates through `resolveUpdatePersistedSpecDepsDeps(resolver)`.

### Discrepancies

1. **[LOW] `UpdatePersistedSpecDepsDeps` shape in spec vs composition implementation**
   - **Evidence:** `core:update-persisted-spec-deps` spec states: _"`resolveUpdatePersistedSpecDepsDeps(resolver)` MUST resolve: `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace; `initializePersistedSpecState` collaborator sufficient to invoke `resolveInitialPersistedDependsOn()`"_. In `packages/core/src/composition/use-cases/update-persisted-spec-deps.ts:19-48`, `UpdatePersistedSpecDepsDeps` instead has `{ specRepositories, getActiveSchema, parsers, extractorTransforms, contentHasher }`, because `UpdatePersistedSpecDeps` invokes `resolveInitialPersistedDependsOn(...)` directly rather than an `InitializePersistedSpecState` instance.
   - **Assessment:** **Spec drift** (the spec describes the conceptual collaborator while the implementation wires the exact dependencies of `resolveInitialPersistedDependsOn`).

### Test Coverage

- `packages/core/test/application/use-cases/update-persisted-spec-deps.spec.ts` (25 tests, all passing):
  - Covers `remove` no-op on missing state, conflicting flags before I/O, no-op error before I/O, invalid ID before I/O, missing dep target, missing spec, bare ID qualification, removing invalid stored value, propagating `InvalidSpecLockError`, `clear`, unknown workspace, lenient read + bare `remove` normalization, raw bare entry removal, remaining invalid entry throwing `InvalidSpecLockError` without write, strict read on `add`, `remove` before `add` with overlap, `originalHash` as `expectedRevision`, `ArtifactConflictError` without retry, `readOnly` workspace rejection before I/O, and missing-state paths (`clear`, `set` skipping derivation, `add` deriving base, `remove`+`add` on derived base, `remove` alone no-op, `add: []` no-op).
- `packages/core/test/composition/use-cases/update-persisted-spec-deps.spec.ts` (3 tests, all passing):
  - Smoke tests via `describeCompositionFactorySmoke` for `createUpdatePersistedSpecDeps`.

### Missing Tests

- `packages/core/test/composition/use-cases/update-persisted-spec-deps.spec.ts` only runs `describeCompositionFactorySmoke` and does not explicitly assert `resolveUpdatePersistedSpecDepsDeps(resolver)` field resolution against a real config (unlike `test/composition/use-cases/update-spec-deps.spec.ts:22-31`).
- `Scenario: clear combined with remove is rejected` is not directly tested in `update-persisted-spec-deps.spec.ts` (though `set` + `add` is tested there and `clear` + `remove` is tested in `update-spec-deps.spec.ts`).

---

## 4. `cli:spec-deps`

### Requirements Summary

- Exposes `specd specs deps {list, add, remove, set, clear} <spec-id>` with `--format text|json|toon`, `--config`, `.allowExcessArguments(false)`.
- `list` calls `Kernel.specs.getPersistedDeps`; distinguishes uninitialized state from empty `dependsOn` in text and includes `initialized` in JSON/TOON.
- `add`, `remove`, `set`, `clear` each make one call to `Kernel.specs.updatePersistedDeps` without CLI-owned mutation logic, passing `<spec-id>` and `--dep` values raw without splitting on commas.
- `remove` on uninitialized spec (`initialized: false`) reports a no-op outcome (`nothing was removed`) with exit 0.
- `clear [--force]` confirms on interactive TTY, fails with exit 1 on non-TTY without `--force` (and never mentions `--clear`), and prints `cancelled` with exit 0 when declined.
- Renders `initialized` from the use case result without hard-coding.
- Maps `SpecNotFoundError`, `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ArtifactConflictError`, `ReadOnlyWorkspaceError`, and `InvalidSpecLockError` to exit 1; adds the exact 3-command repair hint on a following line (and as `hint` in JSON/TOON, not folded into `message`, with no `--force` or parentheticals) only when `InvalidSpecLockError.fieldPath` is under `dependsOn`.

### Implementation Status

**Compliant.**

- `packages/cli/src/commands/spec/deps.ts`:
  - Lines 67–202: Registers `deps` group with `list`, `add`, `remove`, `set`, `clear`, each with `.allowExcessArguments(false)`, `--format`, `--config`, and structured output help text.
  - Lines 30–60: `renderDepsResult` distinguishes `result.initialized === false` from empty `dependsOn: (empty)` in text and emits `initialized` in JSON/TOON when defined.
  - Lines 95, 119, 147: `add` and `remove` require `--dep` via `requiredOption(..., collect, [])`; `set` uses optional `--dep` so `set` without `--dep` sends `set: []`.
  - Lines 133–137: `remove` passes custom `notInitializedText` (`spec ${result.specId} is not initialized — nothing was removed`).
  - Lines 176–189: `clear` uses `confirmOrExit` with `nonInteractiveMessage: 'clearing requires confirmation; pass --force to skip it'` (no `--clear` mention).
  - Lines 87, 111, 139, 160, 198: All 5 leaves pass `{ lockRepairHint: true }` to `handleError`.
- `packages/cli/src/handle-error.ts`:
  - Lines 34–35, 218–230: Adds `LOCK_REPAIR_HINT` only when `options?.lockRepairHint === true` and `fieldPath === 'dependsOn' || fieldPath.startsWith('dependsOn.')`.
  - Lines 62–73: Writes `hint` on its own line to stderr and as top-level `hint` in JSON/TOON without modifying `message`.
- `_global/*` compliance: Thin CLI adapter, no direct `spec-lock.json` I/O, unified `SpecdError` handling.

### Discrepancies

None.

### Test Coverage

- `packages/cli/test/commands/spec-deps.spec.ts` (19 tests, all passing):
  - Covers help schemas on all 5 leaves, `list` delegation, `set` delegation, `--dep ""` rejection, missing target `SpecNotFoundError`, `InvalidSpecLockError` without stack trace, `clear` confirmation (accepted, declined, `--force`, non-TTY, no `--clear` in message), uninitialized vs initialized `list` text & JSON, `remove` uninitialized no-op, `InvalidSpecIdError` on `Bad Id`, `--dep "a,b"` raw forwarding, `ArtifactConflictError`, and `ReadOnlyWorkspaceError`.
- `packages/cli/test/handle-error.spec.ts` (45 tests, all passing):
  - Lines 123–194 explicitly test `InvalidSpecLockError` repair hint: exact 3 commands, no hint when `lockRepairHint` not requested, no `--force`, no parentheticals, emitted once on its own line after `error:`, kept out of JSON `message` (placed in `hint`), and omitted for non-`dependsOn` field paths (`contentHash`).

### Missing Tests

- `Scenario: Set with no --dep flags clears the list` (`specd specs deps set <spec-id>` with no `--dep` passing `set: []`) is not explicitly tested in `spec-deps.spec.ts`.

# Spec-Compliance Audit — Partial Batch 2

**Change:** harden-implementation-tracking
**Date:** 2026-06-21
**Scope:** cli:change-implementation, core:change-repository-port, core:archive-repository-port

---

## Spec: cli:change-implementation

### Requirements Summary

| #   | Requirement           | Status |
| --- | --------------------- | ------ |
| 1   | Command signature     | PASS   |
| 2   | List subcommand       | PASS   |
| 3   | Add subcommand        | PASS   |
| 4   | Resolve subcommand    | PASS   |
| 5   | Unresolve subcommand  | PASS   |
| 6   | Ignore subcommand     | PASS   |
| 7   | Remove subcommand     | PASS   |
| 8   | Review subcommand     | PASS   |
| 9   | Shared path semantics | PASS   |

### Implementation Status

**Requirement 1: Command signature**

- `registerChangeImplementation` at `implementation.ts:15-149` registers `list`, `add`, `remove`, `ignore`, `resolve`, `review`, and `unresolve` subcommands. PASS.

**Requirement 2: List subcommand**

- `renderImplementationState` at `implementation.ts:160-221`: groups tracked files by state including `removed` (line 180), shows links with symbol refinements and stale diagnostics. PASS.

**Requirement 3: Add subcommand**

- CLI passes `--spec`, `--file`, `--symbol` to `UpdateImplementationTracking.execute` with `action: 'add'` (`implementation.ts:55-63`).
- File existence validated by core use case (`update-implementation-tracking.ts:150-151`).
- Creates tracked entry with state `open` when not tracked (`update-implementation-tracking.ts:161-163`).
- `fileLinkExplicit` correctly set: `true` when no symbols, `false` with symbols (`update-implementation-tracking.ts:153-158`). PASS.

**Requirement 4: Resolve subcommand**

- Comma-separated `--file` expanded at `implementation.ts:254`.
- Core `_applyResolve` requires file existence (`update-implementation-tracking.ts:232-233`).
- Rejects missing files with `ImplementationFileNotFoundError`. PASS.

**Requirement 5: Unresolve subcommand**

- CLI registered at `implementation.ts:130-148`.
- Core `_applyUnresolve` requires file existence (`update-implementation-tracking.ts:251-252`).
- Refuses `removed` files — throws `ImplementationFileNotFoundError` at line 255-257. PASS.

**Requirement 6: Ignore subcommand**

- CLI registered at `implementation.ts:90-108` with comma-separated `--file`.
- Core `_applyIgnore`: allows tracked missing files (line 203-208 — skips existence check when `isTracked`).
- Rejects untracked missing files with `ImplementationFileNotFoundError` (line 206-207). PASS.

**Requirement 7: Remove subcommand**

- Symbol-level removal calls `change.removeImplementationSymbol` (`update-implementation-tracking.ts:181-185`).
- File-level removal calls `change.removeImplementationLink` (`update-implementation-tracking.ts:188`). PASS.

**Requirement 8: Review subcommand**

- `review` delegates to `renderImplementationState` (`implementation.ts:38-40`), which uses `getImplementationReview` use case with enrichment for stale symbols. PASS.

**Requirement 9: Shared path semantics**

- CLI accepts raw project-relative paths (e.g. `packages/core/src/...`) without requiring `workspace:path` format. PASS.

### Discrepancies

None for the parts this change modifies.

### Test Coverage

| Requirement                            | Test File                                | Coverage |
| -------------------------------------- | ---------------------------------------- | -------- |
| Add creates tracked file               | `change-implementation.spec.ts`          | GOOD     |
| Add refines with symbols               | `change-implementation.spec.ts`          | GOOD     |
| Adding link to missing file fails      | `change-implementation.spec.ts`          | GOOD     |
| Resolve multiple files comma-separated | `change-implementation.spec.ts`          | GOOD     |
| Resolve missing file fails             | `update-implementation-tracking.spec.ts` | GOOD     |
| Resolve removed file fails             | `update-implementation-tracking.spec.ts` | GOOD     |
| Unresolve existing file                | `update-implementation-tracking.spec.ts` | GOOD     |
| Unresolve removed file fails           | `update-implementation-tracking.spec.ts` | GOOD     |
| Ignore multiple files                  | `change-implementation.spec.ts`          | GOOD     |
| Ignore missing untracked fails         | `update-implementation-tracking.spec.ts` | GOOD     |
| Ignore missing tracked succeeds        | `update-implementation-tracking.spec.ts` | GOOD     |
| Remove symbol preserves remaining      | `update-implementation-tracking.spec.ts` | GOOD     |

### Summary

9 requirements, 9 conformant, 0 discrepancies, 0 missing tests.

---

## Spec: core:change-repository-port

### Requirements Summary

Only auditing the `internalPaths` requirement added by this change:

| #   | Requirement                                  | Status |
| --- | -------------------------------------------- | ------ |
| 1   | internalPaths returns absolute storage paths | PASS   |

### Implementation Status

**Requirement: internalPaths returns absolute storage paths**

- **Port declaration**: `abstract internalPaths(): readonly string[] | undefined` at `change-repository.ts:254`. JSDoc (lines 245-253) specifies `undefined` for non-filesystem implementations, empty array means "no paths to exclude". PASS.
- **FsChangeRepository**: Returns `[this._changesPath, this._draftsPath, this._discardedPath]` at `change-repository.ts:1302-1303`. PASS.
- **Nullable semantics**: `undefined` when concept doesn't apply; MUST NOT return empty array to signal inapplicability. JSDoc clearly states this. PASS.

### Discrepancies

None.

### Test Coverage

| Scenario                                        | Test File                                                                                         | Coverage        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| FsChangeRepository returns storage paths        | Implicit via `refresh-implementation-tracking.spec.ts:70-82` (exclusion paths passed to detector) | GOOD (indirect) |
| Non-filesystem implementation returns undefined | `helpers.ts:StubChangeRepository.internalPaths()` returns `undefined` by default                  | GOOD (stub)     |

### Summary

1 requirement (delta portion), 1 conformant, 0 discrepancies, 0 missing tests.

---

## Spec: core:archive-repository-port

### Requirements Summary

Only auditing the `internalPaths` requirement added by this change:

| #   | Requirement                                  | Status |
| --- | -------------------------------------------- | ------ |
| 1   | internalPaths returns absolute storage paths | PASS   |

### Implementation Status

**Requirement: internalPaths returns absolute storage paths**

- **Port declaration**: `abstract internalPaths(): readonly string[] | undefined` at `archive-repository.ts:149`. JSDoc (lines 140-148) specifies `undefined` for non-filesystem implementations. PASS.
- **FsArchiveRepository**: Returns `[this._archivePath]` at `archive-repository.ts:1000-1001`. PASS.
- **Nullable semantics**: Same as ChangeRepository — `undefined` for non-applicable, empty array = "no paths to exclude". PASS.

### Discrepancies

None.

### Test Coverage

| Scenario                                        | Test File                                                           | Coverage        |
| ----------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| FsArchiveRepository returns archive root        | Implicit via `refresh-implementation-tracking.spec.ts:70-82`        | GOOD (indirect) |
| Non-filesystem implementation returns undefined | `helpers.ts:makeArchiveRepository()` returns `undefined` by default | GOOD (stub)     |

### Summary

1 requirement (delta portion), 1 conformant, 0 discrepancies, 0 missing tests.

---

## Cross-Spec Consistency (Batch 2)

| Check                                                                                  | Result                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `cli:change-implementation` unresolve vs `core:change` (removed state)                 | Consistent — unresolve refuses removed files; only refresh resurrects |
| `cli:change-implementation` ignore vs `core:change` (tracked state)                    | Consistent — ignore allows tracked-removed files                      |
| `core:change-repository-port` internalPaths vs `core:refresh-implementation-tracking`  | Consistent — refresh collects `?? []` from both repos                 |
| `core:archive-repository-port` internalPaths vs `core:refresh-implementation-tracking` | Consistent — same null-coalescing pattern                             |

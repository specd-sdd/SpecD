# Spec-Compliance Audit — Partial Batch 1

**Change:** harden-implementation-tracking
**Date:** 2026-06-19T18:16:59Z
**Auditor:** automated spec-compliance check
**Scope:** core:change-manifest, core:refresh-implementation-tracking, core:implementation-detector-port

---

## Spec: core:change-manifest

### Requirements Summary

| #   | Requirement                                     | Status  |
| --- | ----------------------------------------------- | ------- |
| 1   | Manifest structure                              | PARTIAL |
| 2   | Archive outcome history events                  | PASS    |
| 3   | Artifact filenames use expected paths           | PASS    |
| 4   | Filename normalization preserves tracked intent | PASS    |
| 5   | Schema version                                  | FAIL    |
| 6   | Atomic writes                                   | PASS    |

### Implementation Status

**Requirement 1: Manifest structure**

| Sub-requirement                                                                     | Code                                                                                                                                                                                                                                               | Conforms? |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `name` immutable after creation                                                     | `ChangeManifest.name` readonly in `manifest.ts:371`, `Change._name` private readonly `change.ts:248`                                                                                                                                               | YES       |
| `createdAt` immutable, ISO 8601                                                     | `ChangeManifest.createdAt` string, `changeToManifest` serializes via `toISOString()` `change-repository.ts:1342`                                                                                                                                   | YES       |
| `schema` written once at creation, never updated                                    | `changeToManifest` extracts from `created` event only `change-repository.ts:1316-1320`; no subsequent code updates it                                                                                                                              | YES       |
| `workspaces` accepted on load but not written on save                               | Zod schema: `workspaces: z.array(z.string()).optional()` `manifest.ts:358`; `changeToManifest` does not include `workspaces` field `change-repository.ts:1340-1352`                                                                                | YES       |
| `specIds` mutable snapshot                                                          | Persisted as `[...change.specIds]` `change-repository.ts:1345`                                                                                                                                                                                     | YES       |
| `invalidationPolicy` persisted                                                      | Zod: `z.enum([...]).optional()` `manifest.ts:361`; serialized in `changeToManifest:1347`; round-trip tests exist `change-repository.spec.ts:1528`                                                                                                  | YES       |
| `trackedImplementationFiles` with `file` and `state`                                | Zod `manifestTrackedImplementationFileSchema:318-321` enforces `file: z.string()` and `state: z.enum(['open','resolved','ignored','removed'])`; domain `TrackedImplementationFile` `change.ts:214-218`; serialized in `changeToManifest:1326-1330` | YES       |
| `implementationLinks` with `specId`, `file`, `fileLinkExplicit`, optional `symbols` | Zod `manifestImplementationLinkSchema:323-338` with `superRefine` enforcing `fileLinkExplicit: false` requires symbols; domain `ImplementationLink` `change.ts:222-236`                                                                            | YES       |
| `fileLinkExplicit: false` only valid with non-empty `symbols`                       | Zod `superRefine` at `manifest.ts:330-337` validates exactly this constraint                                                                                                                                                                       | YES       |
| `specDependsOn` optional record                                                     | Zod `specDependsOn: z.record(...).optional()` `manifest.ts:360`; serialized in `changeToManifest:1322-1325`; round-trip tests exist                                                                                                                | YES       |
| `artifacts` array with `state` on each artifact and file                            | Zod `manifestArtifactSchema` with `state: artifactStatusSchema.optional()` and `files` with `state: artifactStatusSchema.optional()` `manifest.ts:302-316`; serialized in `serializeArtifact` including state `change-repository.ts:1364-1366`     | YES       |
| Missing state defaults to `missing` on load                                         | `raw.state ?? 'missing'` at `change-repository.ts:1129`; file state falls back via `resolvedRawFile.state ?? await this._deriveFileStatus(...)` `change-repository.ts:1097-1098`                                                                   | YES       |
| `validatedHash` three valid values (null, SHA-256, `__skipped__`)                   | Zod `validatedHash: z.string().nullable()` `manifest.ts:306`; sentinel `__skipped__` handled in `_deriveFileStatus` `change-repository.ts:1277-1278`                                                                                               | YES       |
| `hasDrift` per file                                                                 | Zod `hasDrift: z.boolean().optional()` `manifest.ts:307`; serialized conditionally `change-repository.ts:1371`; round-trip tests `change-repository.spec.ts:1610`                                                                                  | YES       |
| `validatedHash` not proof of presence                                               | Code checks file existence before interpreting `validatedHash`; lines 1102-1111 re-derive status when `validatedHash !== null` but status is `missing`                                                                                             | YES       |
| `history` append-only array                                                         | `history` serialized via `serializeEvent` `change-repository.ts:1351`; never pruned in any operation; events only pushed via `push()` on `Change._history`                                                                                         | YES       |
| No top-level `state` field                                                          | `changeManifestSchema` and `ChangeManifest` interface have no `state` field; lifecycle derived from history                                                                                                                                        | YES       |
| `invalidated event with`cause`, `message`, `affectedArtifacts`                      | `RawInvalidatedEvent` includes all three fields `manifest.ts:161-174`; serialized in `serializeEvent:1424-1435`                                                                                                                                    | YES       |
| Legacy `artifact-change` cause normalized                                           | `normalizeInvalidatedCause` `change-repository.ts:1531-1535` maps `'artifact-change'` to `'artifact-drift'`; test at `change-repository.spec.ts:133`                                                                                               | YES       |
| `specDependsOn` seeded from `spec-lock.json` then `metadata.json` then empty        | `loadPersistedSpecDependsOn` `load-persisted-spec-depends-on.ts:23-50` implements exactly this precedence chain; used by `CreateChange` `create-change.spec.ts:132,158`                                                                            | YES       |

**PARTIAL** reason: The `specDependsOn` seeding logic exists in `loadPersistedSpecDependsOn` but the _manifest-level_ seeding scenario ("seeded when the spec first enters the change scope from spec-lock.json") is implicitly covered through `CreateChange` and `UpdateSpecDeps` use cases rather than directly tested at the manifest serialization boundary. The implementation is correct, but the direct "manifest written after scope-entry contains specDependsOn seeded from sidecar" scenario lacks a dedicated integration test.

**Requirement 2: Archive outcome history events**

| Sub-requirement                                                       | Code                                                                                                                                                                                                                                             | Conforms? |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `archive-failed` event with `step`, `message`, `commitStarted`        | `ArchiveFailedEvent` domain type `change.ts:117-124`; `RawArchiveFailedEvent` manifest type `manifest.ts:177-190`; `Change.recordArchiveFailure()` `change.ts:866-880`; `_recordArchiveFailure()` in `ArchiveChange` `archive-change.ts:965-989` | YES       |
| Successful archive completion not appended as active-history event    | `ArchiveChange.execute` does not append any success event to the active change's history; archiving moves the change to the archive directory                                                                                                    | YES       |
| Failed pre-commit attempt does not imply partial permanent acceptance | `_handleCommitFailure` `archive-change.ts:917-954` calls `_recordArchiveFailure` with `commitStarted: true` and restores state to `archivable`                                                                                                   | YES       |

Tests: `archive-change.spec.ts:595` verifies `archive-failed` event fields (`step`, `commitStarted`).

**Requirement 3: Artifact filenames use expected paths**

| Sub-requirement                                                                                   | Code                                                                                                                                                     | Conforms? |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `expectedArtifactFilename` resolves delta vs. direct based on `specExists` and `delta` capability | `artifact-filename.ts:28-44` — returns `deltas/...delta.yaml` when `delta && specExists === true`, otherwise `specs/...`                                 | YES       |
| Creation-time filename is correct (not reliant on later repair)                                   | `FsChangeRepository` calls `expectedArtifactFilename` during manifest construction; verified in test `change-repository.spec.ts:918`                     | YES       |
| Legacy stale filename normalized on load                                                          | `_manifestToChange` `change-repository.ts:1063-1088` normalizes filenames with `artifactRepresentationClass` guard; test `change-repository.spec.ts:936` | YES       |

**Requirement 4: Filename normalization preserves tracked intent**

| Sub-requirement                                                          | Code                                                                                                                                                                                                         | Conforms? |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Representation-changing normalization rejected                           | `_manifestToChange` compares `artifactRepresentationClass(rawFile.filename)` vs `artifactRepresentationClass(expectedFilename)`; only accepts normalization when they match `change-repository.ts:1079-1083` | YES       |
| Null `validatedHash` does not trigger normalization flip                 | Test `change-repository.spec.ts:1954` explicitly verifies that a `specs/...` filename with null hash is preserved even when the spec now exists                                                              | YES       |
| Partial materialization from failed archive does not flip tracked intent | Protected by the `artifactRepresentationClass` check — a `specs/...` → `deltas/...` flip is a `direct → delta` representation change which is rejected unless exact equivalence is proven                    | YES       |

**Requirement 5: Schema version**

| Sub-requirement                                                 | Code                                                                                                                                                                                                                                                                   | Conforms?                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Schema unchanged → no warning                                   | `_manifestToChange` only emits warning when `manifest.schema.version !== this._activeSchema.version` or `manifest.schema.name !== this._activeSchema.name` `change-repository.ts:1047-1056`                                                                            | YES (for version), NO (for name — see below) |
| Schema version bumped → emit warning                            | `Logger.warn(...)` at `change-repository.ts:1052-1055`; test `change-repository.spec.ts:1932`                                                                                                                                                                          | YES                                          |
| Schema name changed → emit warning                              | **FAIL**: Code throws `SchemaMismatchError` `change-repository.ts:1048-1050` instead of emitting a warning. This error blocks the operation entirely.                                                                                                                  | **NO**                                       |
| Archiving with schema mismatch → warning + confirm, not blocked | **FAIL**: `ArchiveChange.execute` throws `SchemaMismatchError` at `archive-change.ts:247-249`; test at `archive-change.spec.ts:243-257` confirms the throw. The spec requires a warning that surfaces the mismatch so the user can decide; archiving must be possible. | **NO**                                       |

**Requirement 6: Atomic writes**

| Sub-requirement                  | Code                                                                                                                                                                    | Conforms? |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Temp file + rename pattern       | `writeFileAtomic` `write-atomic.ts:13-22` writes to `${filePath}.tmp-${pid}-${uuid}` then `fs.rename`; `_writeManifestAtomic` calls it `change-repository.ts:1024-1027` | YES       |
| Rename on failure cleans up temp | `write-atomic.ts:18-19` catches rename errors and `unlink`s the temp file                                                                                               | YES       |

No test explicitly verifies atomicity (partial-write prevention); the implementation is correct but untested for crash-recovery scenarios.

### Discrepancies

1. **Schema name mismatch is a hard error, not a warning (Spec vs. Code)**
   - **Spec**: "specd must emit a warning", "archiving a change with a schema version mismatch must still be possible; the warning surfaces the mismatch so the user can decide"
   - **Code**: `_manifestToChange` throws `SchemaMismatchError` `change-repository.ts:1049`; `ArchiveChange.execute` throws `SchemaMismatchError` `archive-change.ts:248`
   - **Likely cause**: The code predates this spec requirement or the spec was written to describe the desired behavior, not the current implementation
   - **Side that might be wrong**: **Code** — the spec is explicit that the mismatch should be advisory, not blocking

2. **Schema name mismatch spec says "warning" but also covers name mismatch archiving** — the spec uses the phrase "schema version mismatch" in the archiving scenario (line: "When specd archive is run on a change with a schema version mismatch"), but the requirement title applies to both name and version. The code blocks on **name** mismatch but only warns on **version** mismatch. The spec intends both to be advisory warnings.

### Test Coverage

| Requirement                                                      | Test File(s)                                                                                                             | Coverage                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Manifest structure (general)                                     | `change-repository.spec.ts` (round-trip, save/load)                                                                      | GOOD                                                                   |
| Missing state defaults to missing                                | Implicit via `_manifestToChange` code; no dedicated test for stateless manifest loading                                  | PARTIAL — no explicit test                                             |
| `specDependsOn` seeding from sidecar/metadata                    | `create-change.spec.ts:132,158`; `load-persisted-spec-depends-on.ts` tested indirectly                                   | PARTIAL — seeding tested at use-case level, not at manifest round-trip |
| `implementationLinks` `fileLinkExplicit: false` requires symbols | Zod schema-level validation `manifest.ts:330-337`; no dedicated unit test asserting rejection                            | PARTIAL                                                                |
| Archive outcome history events                                   | `archive-change.spec.ts:595`                                                                                             | GOOD                                                                   |
| Artifact filenames use expected paths                            | `change-repository.spec.ts:918,936`                                                                                      | GOOD                                                                   |
| Filename normalization preserves intent                          | `change-repository.spec.ts:1954` (null hash preservation)                                                                | GOOD                                                                   |
| Representation-changing normalization rejected                   | Implicit from `artifactRepresentationClass` logic; no explicit test for the "reject flip" case beyond the null-hash test | PARTIAL                                                                |
| Schema version — warning                                         | `change-repository.spec.ts:1932`                                                                                         | GOOD                                                                   |
| Schema name — should be warning but throws                       | `change-repository.spec.ts:1914-1929` (tests the throw, confirming the discrepancy)                                      | N/A (tests wrong behavior)                                             |
| Schema mismatch archiving not blocked                            | `archive-change.spec.ts:243-257` (tests the throw, confirming the discrepancy)                                           | N/A (tests wrong behavior)                                             |
| Atomic writes                                                    | No dedicated test                                                                                                        | MISSING                                                                |
| `invalidationPolicy` persistence                                 | `change-repository.spec.ts:1528`                                                                                         | GOOD                                                                   |
| `hasDrift` persistence                                           | `change-repository.spec.ts:1610`                                                                                         | GOOD                                                                   |
| Legacy `artifact-change` cause normalization                     | `change-repository.spec.ts:133`                                                                                          | GOOD                                                                   |
| `validatedHash` not proof of presence                            | `lifecycle-engine.spec.ts:262`                                                                                           | GOOD                                                                   |

### Summary

6 requirements, 3 fully conformant, 1 partial (manifest structure — minor seeding test gap), 2 failing (schema version — name mismatch throws instead of warning, archiving blocked instead of advisory).

---

## Spec: core:refresh-implementation-tracking

### Requirements Summary

| #   | Requirement                      | Status  |
| --- | -------------------------------- | ------- |
| 1   | Input contract                   | PASS    |
| 2   | Historical implementing guard    | PASS    |
| 3   | Detection merge semantics        | PASS    |
| 4   | Deletion and removal semantics   | PASS    |
| 5   | Resurrections and re-appearances | PASS    |
| 6   | Internal directory filtering     | PASS    |
| 7   | Persistence                      | PASS    |
| 8   | Result projection                | PASS    |
| 9   | Change must exist                | PASS    |
| 10  | Constructor dependencies         | PARTIAL |
| 11  | Delivery-agnostic boundary       | PASS    |

### Implementation Status

**Requirement 1: Input contract**

`RefreshImplementationTrackingInput` at `refresh-implementation-tracking.ts:14-17` accepts `name: string`. Conforms.

**Requirement 2: Historical implementing guard**

`execute()` at `refresh-implementation-tracking.ts:85`: `if (freshChange.getHistoricalImplementationAt() !== null)` — guard satisfied triggers detection, guard not satisfied skips entirely. Conforms.

**Requirement 3: Detection merge semantics**

`_mergeCandidates()` at `refresh-implementation-tracking.ts:127-140`:

- New paths → `change.trackImplementationFile(file, 'open')` (line 135)
- Existing tracked entries → preserved (line 133-134: `currentState !== undefined` skips if not `removed`)
- Removed entries → set to `open` (line 136-137)
- Does NOT mark files `resolved` or `ignored` during merge. Conforms.

**Requirement 4: Deletion and removal semantics**

`_existenceSweep()` at `refresh-implementation-tracking.ts:147-159`:

- Skips `ignored` files (line 150)
- Missing non-removed files → `trackImplementationFile(file, 'removed')` (line 154)
- Missing files → links cleaned via `_removeImplementationLinksForFile` (line 155)
  Conforms.

**Requirement 5: Resurrections and re-appearances**

Detection merge: removed file detected → `open` (line 136-137)
Existence sweep: removed file found on disk → `open` (line 156-157)
Conforms.

**Requirement 6: Internal directory filtering**

`_collectExclusions()` at `refresh-implementation-tracking.ts:108-119`:

- Collects `this._changes.internalPaths()` and `this._archives.internalPaths()`
- Normalizes absolute paths to project-relative via `_toPortableProjectRelativePath()`
- Passes as `excludePaths` to detector (line 88)
  Conforms.

**Requirement 7: Persistence**

Uses `this._changes.mutate(input.name, ...)` at `refresh-implementation-tracking.ts:84`. When guard not satisfied, `mutate` still loads the change but does not alter tracked implementation state (lines 85-92 — all mutations inside the `if` block). Conforms.

**Requirement 8: Result projection**

Returns `projectImplementationTracking(freshChange)` at `refresh-implementation-tracking.ts:93` via the shared helper. Result wraps as `{ implementationTracking }` at `refresh-implementation-tracking.ts:100`. Conforms.

**Requirement 9: Change must exist**

`if (implementationTracking === null) throw new ChangeNotFoundError(input.name)` at `refresh-implementation-tracking.ts:96-98`. Conforms.

**Requirement 10: Constructor dependencies**

**Spec**: `changes: ChangeRepository`, `archives: ArchiveRepository`, `implementationDetector: ImplementationDetector`

**Code constructor** (`refresh-implementation-tracking.ts:60-66`):

- `changes: ChangeRepository` ✅
- `archives: ArchiveRepository` ✅
- `implementationDetector: ImplementationDetector` ✅
- `files: FileReader` — **not in spec**
- `projectRoot: string` — **not in spec**

The use case additionally takes `FileReader` and `projectRoot: string` beyond what the spec declares. These are infrastructure realities (existence checks need filesystem access and project root for path normalization), but they are not documented in the spec's constructor dependencies requirement.

**Requirement 11: Delivery-agnostic boundary**

No imports of CLI, MCP, or filesystem watcher code. The use case accepts a `FileReader` port (abstraction) and detector port (abstraction). Conforms.

### Discrepancies

1. **Constructor accepts `FileReader` and `projectRoot` not listed in spec Requirement 10**
   - **Spec**: Constructor accepts `changes`, `archives`, `implementationDetector`
   - **Code**: Also accepts `files: FileReader`, `projectRoot: string`
   - **Likely cause**: The spec was written before the existence-sweep phase was added, or the spec chose not to detail infrastructure helper dependencies
   - **Side that might be wrong**: **Spec** — the existence-sweep architectural need for `FileReader` and `projectRoot` is real; the spec should enumerate them

### Test Coverage

| Requirement                                         | Test File                                                                                         | Coverage                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Input contract                                      | `refresh-implementation-tracking.spec.ts` (implicit across all tests)                             | GOOD                                |
| Historical implementing guard                       | `refresh-implementation-tracking.spec.ts:47-57` (skips detector), `:59-68` (invokes detector)     | GOOD                                |
| Detection merge — new paths → open                  | `refresh-implementation-tracking.spec.ts:84-102`                                                  | GOOD                                |
| Detection merge — existing tracked preserved        | `refresh-implementation-tracking.spec.ts:120-135` (resolved), `:137-148` (ignored)                | GOOD                                |
| Detection merge — removed files revived by detector | `refresh-implementation-tracking.spec.ts:150-165`                                                 | GOOD                                |
| Deletion — missing open → removed                   | `refresh-implementation-tracking.spec.ts:167-178`                                                 | GOOD                                |
| Deletion — missing resolved → removed               | `refresh-implementation-tracking.spec.ts:180-191`                                                 | GOOD                                |
| Deletion — ignored preserved even if missing        | `refresh-implementation-tracking.spec.ts:193-204`                                                 | GOOD                                |
| Deletion — links for missing files cleaned          | `refresh-implementation-tracking.spec.ts:206-223`                                                 | GOOD                                |
| Resurrections — removed file found on disk → open   | `refresh-implementation-tracking.spec.ts:225-240`                                                 | GOOD                                |
| Internal directory filtering                        | `refresh-implementation-tracking.spec.ts:70-82` (exclusion paths passed)                          | GOOD                                |
| Persistence                                         | `refresh-implementation-tracking.spec.ts:98-101` (subsequent `repo.get` returns new tracked file) | GOOD                                |
| Result projection                                   | `refresh-implementation-tracking.spec.ts:259-270`                                                 | GOOD                                |
| Change must exist                                   | `refresh-implementation-tracking.spec.ts:41-45`                                                   | GOOD                                |
| Constructor dependencies                            | No explicit test for constructor shape                                                            | MISSING (minor — tested implicitly) |
| Delivery-agnostic boundary                          | Spec-text review (no code references)                                                             | N/A (spec-level)                    |

### Summary

11 requirements, 9 conformant, 1 partial (constructor deps — spec omits `FileReader` and `projectRoot`), 0 discrepancies beyond constructor, 0 missing test coverage for core scenarios.

---

## Spec: core:implementation-detector-port

### Requirements Summary

| #   | Requirement            | Status |
| --- | ---------------------- | ------ |
| 1   | Detector interface     | PASS   |
| 2   | Targeted lifecycle use | PASS   |
| 3   | Backend independence   | PASS   |

### Implementation Status

**Requirement 1: Detector interface**

`ImplementationDetector` interface at `implementation-detector.ts:15-27`:

- `detectModifiedFiles(change: Change, options?: ImplementationDetectorOptions): Promise<readonly string[]>` ✅
- `ImplementationDetectorOptions` at `implementation-detector.ts:4-7` with `excludePaths?: readonly string[]` ✅
- Paths are project-relative, forward-slash-normalized (enforced by `VcsImplementationDetector` via `toPortablePath` at `vcs-implementation-detector.ts:147-148`) ✅
- `excludePaths` filtering via `isExcludedByPrefix` at `vcs-implementation-detector.ts:161-165` ✅
- Callers provide `change` context, not raw VCS baseline refs ✅

**Requirement 2: Targeted lifecycle use**

- `RefreshImplementationTracking` invokes `ImplementationDetector.detectModifiedFiles` at `refresh-implementation-tracking.ts:87-89` ✅
- `GetStatus` does NOT import or reference `ImplementationDetector` (verified via grep) ✅
- `TransitionChange` does NOT import or reference `ImplementationDetector` (verified via grep) ✅
- `CompileContext` does NOT import or reference `ImplementationDetector` (verified via grep) ✅
- `Change` entity does NOT invoke the port (verified via grep) ✅

**Requirement 3: Backend independence**

- `ImplementationDetector` is an `interface` with no backend-specific methods ✅
- `VcsImplementationDetector` implements the interface, wrapping VCS details internally ✅
- `NullVcsAdapter` provides a null implementation ✅
- No caller depends on VCS-specific behavior from the detector ✅

### Discrepancies

None.

### Test Coverage

| Requirement                                                      | Test File                                                                                           | Coverage                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Detector returns normalized project-relative paths               | `vcs-implementation-detector.spec.ts:33-69`                                                         | GOOD                                            |
| Detector excludes configured internal paths                      | `vcs-implementation-detector.spec.ts:113-164` (3 tests)                                             | GOOD                                            |
| Historical baseline resolution (callers provide change)          | `vcs-implementation-detector.spec.ts:33,66` (verifies `refAt` called with change-derived timestamp) | GOOD                                            |
| Fallback to current ref when historical unavailable              | `vcs-implementation-detector.spec.ts:71-101`                                                        | GOOD                                            |
| Refresh invokes detector (not Change entity)                     | `refresh-implementation-tracking.spec.ts:59-68`                                                     | GOOD                                            |
| GetStatus/TransitionChange/CompileContext do not invoke detector | Verified via code search — no tests needed for absence                                              | N/A (negative assertion verified by inspection) |
| Backend independence                                             | `NullVcsAdapter` test `vcs-implementation-detector.spec.ts:104-110`                                 | GOOD                                            |

### Summary

3 requirements, 3 conformant, 0 discrepancies, 0 missing tests.

---

## Cross-Spec Consistency

| Check                                                                          | Result                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `core:change-manifest` vs. `core:change` (event model)                         | Consistent — `ArchiveFailedEvent` domain type matches manifest raw type; lifecycle derivation from history is the same model |
| `core:change-manifest` vs. `core:change-layout` (expected paths)               | Consistent — `expectedArtifactFilename` respects delta rules and spec existence                                              |
| `core:change-manifest` vs. `core:storage` (repository writes)                  | Consistent — `writeFileAtomic` used for manifest writes                                                                      |
| `core:change-manifest` vs. `core:spec-id-format`                               | Consistent — `specDependsOn` keyed by spec ID as per format                                                                  |
| `core:change-manifest` vs. `core:workspace`                                    | Consistent — `workspaces` field deprecated in favor of runtime computation                                                   |
| `core:refresh-implementation-tracking` vs. `core:change` (historical guard)    | Consistent — `getHistoricalImplementationAt()` checks for first `implementing` transition                                    |
| `core:refresh-implementation-tracking` vs. `core:implementation-detector-port` | Consistent — refresh passes `Change` context and `excludePaths`; detector returns project-relative paths                     |
| `core:implementation-detector-port` vs. `core:refresh-implementation-tracking` | Consistent — port interface matches caller expectations                                                                      |
| `core:change-manifest` vs. global architecture (layer rules)                   | Consistent — manifest types are in `infrastructure/fs/`; domain types in `domain/`                                           |
| `core:change-manifest` schema version vs. global conventions                   | **DISCREPANCY** — spec says advisory warning for name mismatch; code throws hard error                                       |

---

## Global Findings

### Critical Discrepancy

**Schema name mismatch behavior** — `core:change-manifest` Requirement "Schema version" specifies that both name and version mismatches should be advisory warnings, with the change remaining usable and archivable. The implementation in `FsChangeRepository._manifestToChange` (`change-repository.ts:1048-1050`) and `ArchiveChange.execute` (`archive-change.ts:247-249`) throws `SchemaMismatchError`, which blocks the operation entirely. The test at `archive-change.spec.ts:243` confirms this blocking behavior. This is the most significant compliance gap in the audited specs.

### Minor Gaps

1. **Constructor dependency spec completeness** — `core:refresh-implementation-tracking` specifies only 3 constructor parameters but the implementation takes 5 (adding `FileReader` and `projectRoot`). The spec should be updated if these are considered part of the public contract.

2. **Atomic write test coverage** — No test explicitly verifies the temp-file-and-rename pattern or crash-recovery behavior for manifest writes.

3. **Missing-state default test** — While the code correctly defaults missing `state` fields to `'missing'` on load, no dedicated test creates a manifest with omitted `state` fields and verifies the default.

4. **`fileLinkExplicit: false` validation test** — The Zod `superRefine` enforces that `fileLinkExplicit: false` requires non-empty `symbols`, but no dedicated unit test asserts the validation rejection.

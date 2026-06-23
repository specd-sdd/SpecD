# Verification & Compliance Report

**Change:** harden-implementation-tracking
**Date:** 2026-06-21
**Mode:** full (scenario verification + compliance audit)

---

## 1. Scenario Verification Summary

All 6 specs pass scenario verification. Every WHEN/THEN scenario has been manually traced through the code and confirmed by test runs.

| Spec                                 | Scenarios                                                                                                    | Result |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| core:change-manifest                 | removed state in Zod, fileLinkExplicit+superRefine, TrackedImplementationFileState union                     | PASS   |
| core:change-repository-port          | internalPaths abstract method, FsChangeRepository returns 3 storage paths                                    | PASS   |
| core:archive-repository-port         | internalPaths abstract method, FsArchiveRepository returns archive root                                      | PASS   |
| core:implementation-detector-port    | interface signature, excludePaths, project-relative normalization, isExcludedByPrefix                        | PASS   |
| core:refresh-implementation-tracking | guard, merge, existence sweep, link cleanup, resurrection, exclusion collection                              | PASS   |
| cli:change-implementation            | list/review/add/resolve/ignore/unresolve/remove subcommands, removed state rendering, comma-separated --file | PASS   |

**Test suites:** core 34 pass, CLI 6 pass. Lint and typecheck clean.

---

## 2. Compliance Audit Summary

### Overall

| Spec                                 | Requirements | Conformant | Partial | FAIL  |
| ------------------------------------ | ------------ | ---------- | ------- | ----- |
| core:change-manifest                 | 6            | 3          | 1       | 2     |
| core:refresh-implementation-tracking | 11           | 9          | 1       | 0     |
| core:implementation-detector-port    | 3            | 3          | 0       | 0     |
| cli:change-implementation            | 9            | 9          | 0       | 0     |
| core:change-repository-port          | 1 (delta)    | 1          | 0       | 0     |
| core:archive-repository-port         | 1 (delta)    | 1          | 0       | 0     |
| **Total**                            | **31**       | **26**     | **2**   | **2** |

### Failures

Both FAIL entries are the **same root cause** in `core:change-manifest`, and both are **pre-existing** — not introduced by this change:

1. **Schema name mismatch throws `SchemaMismatchError` instead of advisory warning** (`change-repository.ts:1048-1050`). The spec says both name and version mismatches should emit a warning and remain archivable; the code throws on name mismatch.
2. **Archiving blocked on schema mismatch instead of advisory** (`archive-change.ts:247-249`). Same root cause — the throw prevents archiving.

This change (`harden-implementation-tracking`) adds `removed` state, `internalPaths()`, and relaxed ignore semantics. It does **not** modify schema version handling or the `SchemaMismatchError` path. These are pre-existing discrepancies.

### Partials

1. **core:change-manifest / Manifest structure** — `specDependsOn` seeding from sidecar lacks a dedicated integration test at the manifest serialization boundary. Implementation is correct.
2. **core:refresh-implementation-tracking / Constructor dependencies** — Code takes `FileReader` and `projectRoot` beyond the 3 deps listed in spec. The spec should enumerate them; the implementation is architecturally sound.

### Minor Test Gaps (pre-existing)

- Atomic write pattern (temp + rename) has no crash-recovery test
- Missing-state default loading has no dedicated test
- `fileLinkExplicit: false` Zod `superRefine` rejection has no dedicated unit test

---

## 3. Cross-Spec Consistency

All 6 specs are mutually consistent for the delta introduced by this change. The only cross-spec discrepancy is the pre-existing schema-version hard-error vs. advisory-warning conflict.

---

## 4. Recommendation

The 2 FAIL findings are **pre-existing** and **out of scope** for this change. The 2 PARTIAL findings are minor spec-documentation gaps, not implementation errors.

**This change is ready to transition to `done`.** The pre-existing schema-version discrepancy should be addressed in a separate change.

# Spec-compliance audit — sdk-graph-provider-factory

Date: 2026-07-19

## Result

**Not compliant.** The full-mode audit reviewed the change's 12 merged specs, their direct dependencies, and applicable global constraints. It found **11 findings**: **4 high**, **6 medium**, and **1 low**. The graph was fresh (926 files, 4,102 symbols; no fingerprint mismatch).

## Findings summary

| ID   | Severity      | Area                  | Finding                                                                                                                                 |
| ---- | ------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| H1   | High          | CLI impact            | Multi-file JSON/TOON output leaks canonical workspace paths instead of project-relative paths.                                          |
| C-01 | High          | Verification artifact | `index-project-graph` verify scenarios still require direct `recreate()`, contradicting the merged provider-owned force-reset contract. |
| GS-1 | High          | Ladybug storage       | Migration can remove `storage.epoch`, making generation reads fail after `open()`.                                                      |
| GS-2 | High          | Ladybug search        | FTS rebuild omits document indexing, allowing document search to become stale.                                                          |
| M1   | Medium        | CLI stats             | Does not use the required `openSpecdHost` bootstrap surface.                                                                            |
| M2   | Medium        | SDK lifecycle         | `afterClose` failure can re-run `close()` and `afterClose`.                                                                             |
| C-02 | Medium        | Public API            | The code-graph public barrel exports unlisted `normalizeFileSelectorPath`.                                                              |
| C-03 | Medium        | Architecture/tests    | `GetGraphHealth` directly constructs a VCS adapter; test port mocks use prohibited partial casts.                                       |
| C-04 | Medium        | Test coverage         | Missing health busy/stale propagation and full public-export exclusion coverage.                                                        |
| GS-3 | Medium        | Ladybug storage       | `removeFile()` is not transactional.                                                                                                    |
| TS-1 | Medium (test) | Ladybug tests         | Test expects schema version 8 while production is version 10.                                                                           |
| L1   | Low           | SDK tests             | No direct test asserts `SdkHostContext` has no duplicate top-level config.                                                              |

## Verification evidence

- Verification pre-hooks succeeded: project tests, lint, and typecheck.
- SDK-focused tests passed: 37/37; complete CLI suite passed: 804/804.
- Relevant code-graph test suites reported passing, but package/isolated Ladybug runs ended in the documented native-worker `ERR_IPC_CHANNEL_CLOSED` shutdown condition; they are not clean full-suite proof.
- Verification exit hooks had no configured post actions.

## Detailed audit reports

The complete batch reports are retained as the source-of-truth detailed findings:

- `_partial-sdk-cli.md` — SDK host/provider and CLI graph commands.
- `_partial-graph-composition.md` — provider composition, indexing, and graph health.
- `_partial-graph-stores.md` — abstract graph-store and Ladybug/SQLite implementations.

## Recommended route

The stale verify artifact (C-01) requires artifact review, and the remaining issues include implementation and test gaps. Follow the standard route: **Update Specs** with `/specd-design sdk-graph-provider-factory`, then **Fix Implementation** with `/specd-implement sdk-graph-provider-factory`.

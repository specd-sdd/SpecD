# Spec Compliance Audit — sdk-graph-provider-factory

## Scope

Audited the 15 merged change specs, their direct dependencies, and applicable global constraints. The code graph was fresh. Detailed, complete package-batch findings are preserved in the companion partial reports in this directory:

- `_partial-sdk.md`
- `_partial-code-graph.md`
- `_partial-cli-core.md`

## Summary

| Area                                       | Result                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK host context and graph-provider helper | 17/17 requirements compliant; 3 non-blocking test-coverage gaps                                                                                                                                                    |
| Code-graph composition and stores          | 1 spec/API drift: `IndexProjectGraphInput.vcsRoot` is implemented and forwarded but absent from the merged spec; 4 coverage gaps; broad graph test command was inconclusive due to Vitest `ERR_IPC_CHANNEL_CLOSED` |
| CLI graph commands and core VCS            | 3 high-severity implementation/spec discrepancies and 2 medium test-coverage gaps                                                                                                                                  |

## Confirmed discrepancies

1. **CG-01 — spec drift (medium):** `code-graph:index-project-graph` omits the required `vcsRoot: string | null` input and forwarding contract that implementation and `IndexOptions` require.
2. **CLC-01 — implementation gap (high):** `specd graph stats` does not explicitly call `process.exit(0)` after provider lifecycle cleanup, as its merged requirement requires.
3. **CLC-02 — implementation gap (high):** `VcsAdapter` is re-exported type-only from `@specd/core`, although the merged port spec requires the abstract class value as a public import.
4. **CLC-03 — implementation gap (high):** Supplying unmatched external VCS providers replaces built-in Git/Hg/SVN probes instead of falling through to them.

## Test evidence

- Verification pre-hook: full project test, lint, and typecheck hooks completed successfully.
- Focused SDK audit: 40 tests passed.
- CLI/Core audit package runs passed; they lack assertions for the findings above.
- Code-graph audit observed its targeted suites passing, but the broad run ended with `ERR_IPC_CHANNEL_CLOSED`; do not treat it as a clean exit gate until stabilized.

## Recommended routing

The `vcsRoot` contract mismatch needs a specification decision; the three high findings require implementation changes. Run `/specd-design sdk-graph-provider-factory` first, then `/specd-implement sdk-graph-provider-factory`.

## Detailed findings

The complete, verbatim batch reports are retained as the three companion partial reports listed in **Scope**. They include requirement-by-requirement evidence, test coverage, dependency/global consistency checks, and alternative interpretations for each discrepancy.

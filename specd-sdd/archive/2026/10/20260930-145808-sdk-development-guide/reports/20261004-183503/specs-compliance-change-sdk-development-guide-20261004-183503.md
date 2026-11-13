# Spec compliance audit — sdk-development-guide

## Scope and result

Audited the fourteen merged change specs, their direct dependencies, applicable global constraints, implementation surfaces, focused tests, and documentation. The code graph was refreshed before audit. The repository verification hook passed the full suite; focused coverage additionally passed 72 CLI tests and 131 guide-package tests.

## Findings summary

| ID        | Severity | Classification        | Finding                                                                                                                                                                  |
| --------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1        | High     | Cross-spec conflict   | `@specd/cli` directly imports `@specd/guide`, contrary to the global `cli -> sdk` direction, while the change spec expressly requires that guide dependency.             |
| GCORE-001 | High     | Implementation defect | `packages/guide/src/index.ts` exports `createGuideSdkEngine`, although the merged composition/conventions requirements restrict it to `@specd/guide/sdk`.                |
| F1        | High     | Spec/code conflict    | `GetGuideQuery` resolves bare topics across collections and suggests titles from other collections, conflicting with merged collection-qualified isolation requirements. |
| GCORE-002 | Medium   | Spec decision         | Unknown-topic handling reads all topics after a miss to construct required candidates, conflicting with the literal no-catalog-lookup-before-error clause.               |
| F2        | Medium   | Implementation defect | MiniSearch results retain BM25 ordering and do not guarantee exact full-query substring matches before partial-only hits.                                                |
| DOC-1     | Medium   | Documentation drift   | `docs/guide/cli.md` implies generated topics expose an internal `file` path; the merged contract prohibits generated topic/source-path exposure.                         |

## Evidence

- CLI behavior, adapter delegation, output envelopes, registration, validation, and discovery field conform functionally. Focused CLI tests passed: 72/72.
- Guide model, bundle compilation, catalog separation, errors, list, outline, section/window slicing, and most search behavior conform. Focused guide tests passed: 131/131.
- Documentation presence and routing conform: `docs/cli/guide-sdk.md`, CLI index, guide recipe, and public sidebar are present.
- The full detailed per-area audit trails are preserved in `_partial-cli.md`, `_partial-guide-core.md`, `_partial-guide-queries.md`, and `_partial-docs.md` in this directory.

## Recommended remediation

1. Decide whether the global architecture should explicitly permit `cli -> guide`, or move the guide facade behind the approved SDK boundary.
2. Remove the `createGuideSdkEngine` re-export from `packages/guide/src/index.ts`; retain `src/sdk.ts`; add export-surface coverage.
3. Decide whether qualified-only lookup or cross-collection convenience is the intended product behavior, then align the implementation/tests or all affected specs.
4. Either permit the bounded candidate lookup in the errors spec or redesign the port so candidates are available during collection resolution.
5. Stable-partition search hits by case-insensitive exact full-query substring before BM25 ordering, with a competing-fixture regression test.
6. Correct the generated-topic metadata wording in `docs/guide/cli.md` and add a documentation regression check if warranted.

## Coverage gaps

- Black-box `--config` placement and structured-error stream-separation tests for `guide-sdk`.
- SDK lazy-loading test through the assembled root program.
- `./internal` versus `./sdk` export-surface test.
- Compile-time CRLF offsets, multi-colon identity boundary, README/catalog parity, and unknown-topic port-call-order tests.
- Qualified lookup isolation and exact-full-query-first ranking regression tests.

## Audit counts

- Change specs: 14
- Definite implementation defects: 2
- High cross-spec/spec-code conflicts: 2
- Medium decision/documentation findings: 2
- Full repository suite: passed
- Focused test suites: 203 tests passed

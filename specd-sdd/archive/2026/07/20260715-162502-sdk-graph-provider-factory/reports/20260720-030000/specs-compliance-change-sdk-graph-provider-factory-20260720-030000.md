# Spec compliance audit — sdk-graph-provider-factory

Date: 2026-07-20  
Mode: specific change, merged previews, full verification audit

## Result

**Not compliant yet.** All standard validation hooks passed, and most merged
scenarios conform, but five material contract discrepancies require follow-up.

| Severity | Count | Finding                                                                                                                                                                                                                                           |
| -------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     |     2 | Stale `cli:graph-cli-context` dependency contract; merged GraphStore reverse-coverage API names do not match the public port/adapters.                                                                                                            |
| Medium   |     3 | SQLite omits identity-candidate discovery for spec/document search; `CodeGraphProvider` is publicly directly constructible despite factory-only contract; VCS base static-detection verify scenario contradicts its own default-null requirement. |
| Low      |     2 | CLI hotspot documentation test is CWD-fragile; several scenario-level coverage gaps remain.                                                                                                                                                       |
| Critical |     0 | None.                                                                                                                                                                                                                                             |

## Verification evidence

- Verifying pre-hooks passed: Core **2,153** tests, CLI **804** tests, and the
  code-graph suite completed successfully (with its known post-run IPC warning).
- Lint and typecheck completed successfully in the verifying hook.
- Graph was fresh; all affected merged spec and verify artifacts were reviewed.
- Scenario audit: SDK/CLI **142/142 pass**; graph composition/core **52
  scenarios supported**; graph stores have **four non-pass scenario entries**
  caused by the two functional discrepancies below.
- No verifying post hooks or post-hook instructions are configured.

## Required follow-up

1. Update `cli:graph-cli-context` or reconcile it with the new `cli:graph-stats`
   host/bootstrap contract.
2. Align the GraphStore reverse-coverage method names between spec and port/adapters.
3. Apply SQLite identity-candidate supplementation to spec and document search,
   not just symbol search.
4. Decide whether `CodeGraphProvider` must genuinely be factory-only; enforce it
   or revise that requirement.
5. Correct the VCS verification scenario to test `GitVcsAdapter.detect` or
   `createVcsAdapter`, since `VcsAdapter.detect` is specified to return `null`
   by default.

## Detailed partial audits

The complete, immutable area findings are retained as traceable partial reports:

- `_partial-sdk-cli.md` — 142 scoped scenarios pass; one high stale dependency conflict and one low CWD-sensitive test.
- `_partial-graph-composition.md` — 52 scenarios supported; two medium contract inconsistencies and coverage gaps.
- `_partial-graph-stores.md` — reverse-coverage API mismatch and incomplete SQLite identity-candidate supplementation.

These partial reports are the complete detailed findings for this audit run and
remain alongside this compiled report as required for traceability.

# Spec Compliance Audit — sdk-graph-provider-factory

## Scope

Audited the 15 merged change specs against implementation and tests (graph fresh: `stale: false`). Detailed batch findings:

- `_partial-sdk.md`
- `_partial-code-graph.md`
- `_partial-cli-core.md`

## Summary

| Area                                        | Result                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SDK host context / with-open-graph-provider | Compliant; non-blocking test gaps only                                                                                   |
| Code-graph composition and stores           | CG-01 remediated; 3 residual medium/low findings (naming drift, Ladybug relation catalog, health busy/stale test gap)    |
| CLI graph commands and core VCS             | CLC-01/02/03 remediated; **1 HIGH** stale VERIFY line in `cli:graph-stats`; 1 MEDIUM wording drift in `cli:graph-impact` |

## Confirmed remediations (prior audit 20260720-160631)

1. **CG-01** — PASS: `vcsRoot` required + forwarded; IndexOptions list includes it; tests cover null/non-null.
2. **CLC-01** — PASS: `process.exit(0)` after `withOpenGraphProvider`; ordered test present.
3. **CLC-02** — PASS: `VcsAdapter` runtime value export from ports + public barrels.
4. **CLC-03** — PASS: external providers prefixed; fall-through to built-ins; tests present.

## New / residual discrepancies

1. **F-01 HIGH (artifact):** `cli:graph-stats` VERIFY scenario “Command delegates health to GetGraphHealth via SDK” still says lifecycle goes through `cli:graph-cli-context`, contradicting merged SPEC, sibling scenarios, `cli:graph-cli-context`, and implementation (`openSpecdHost` only).
2. **F-02 MEDIUM (artifact):** `cli:graph-impact` symbol/spec prose still describes inline provider lifecycle; code uses shared CLI context helper.
3. **CG-02 / CG-03 / CG-04:** naming drift `CodeGraphFactoryOptions`, Ladybug relation catalog omission, missing direct busy/stale health tests (non-blocking / medium).

## Verification scenario verdict (this `/specd-verify` run)

- Focused suites passed: SDK 40, graph-stats 17, VCS/barrel 12, index-project-graph 5, other graph CLI 58, provider/health 20.
- **Fail (artifact):** one `cli:graph-stats` VERIFY AND-clause (F-01). Implementation matches SPEC.
- Classification: **artifact review required** (not implementation-only).

## Recommended routing

Update verify/spec wording via `/specd-design sdk-graph-provider-factory` (at least F-01; optionally F-02 and CG naming), then re-verify. Do not treat F-01 as an implementation regression.

## Detailed findings

The complete batch reports are retained as the three companion partial files listed in **Scope**.

# Specs-compliance — change `workflow-transition-checks`

- **Mode:** specific change (re-audit after GetStatus overlap wiring, `'next'` rejects, fail-fast tests, CLI `--allow-out-of-scope`)
- **Date:** 2026-08-28 12:17 (`TIMESTAMP=20260828-121751`)
- **State at audit:** `designing` (verify/design/tasks pending-review from earlier spec edits)
- **Graph:** `graph index --force` failed (`graph-index worker exited unexpectedly`) after deleting incompatible schema-5 SQLite. Subagents used `graph search` where it worked; otherwise Read/Grep.
- **Read-only:** no source or spec files were modified for this audit.

## Executive verdict

The previous **HIGH** (GetStatus archive overlap I/O not wired) is **fixed**: `resolveGetStatusDeps` calls `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })`, and archive predicates still run only when `state === 'archivable'`. Designing live overlap is not `OVERLAP_CONFLICT`.

A new **HIGH** on the same theme: **`TransitionChange` does not reload the `Change` after `RefreshImplementationTracking`**, so `impl.filesResolved` / `impl.linksInScope` can run on a stale snapshot while GetStatus reloads. That can make status show a blocker that transition does not enforce.

CLI recorte-26 (`--next`, `--allow-out-of-scope` forward/omit, archive allow flags, status overlap review) is **compliant**. Remaining CLI HIGH is test-layout: leftover `packages/cli/test/commands/change.spec.ts` still holds the only `artifact-drift` status tests.

## Recorte 26 / follow-up checklist

| Item                                                 | Verdict                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| GetStatus `includeOverlapDetection: true`            | **Fixed** (no composition regression test — M-1)                 |
| Live `OVERLAP_CONFLICT` only in `archivable`         | **Compliant**                                                    |
| Invalidation overlap → review `/specd-design`        | **Compliant**                                                    |
| `to: 'next'` + four reject states                    | **Compliant** (Input contract section still stale)               |
| `failFastOn: 'protocol.edge'` vs collect-all         | **Compliant** + tests                                            |
| CLI `--next` not a local table                       | **Compliant**                                                    |
| CLI transition/archive `--allow-out-of-scope`        | **Compliant** + matching tests                                   |
| `allowOutOfScope` does not skip `impl.filesResolved` | **Compliant** (archive test; Core transition test still missing) |
| Leftover `change.spec.ts`                            | **Still open** (migrate drift tests before delete)               |

## Highest-priority findings (do not treat all HIGHs as equal)

Must-fix for this change’s contract:

1. **HIGH — TransitionChange stale `Change` after refresh** (`_partial-core-lifecycle` D-3). Reload after refresh like GetStatus.
2. **MEDIUM — `includeOverlapDetection` unguarded in composition tests** (previous HIGH can regress silently).
3. **MEDIUM — production `spec.overlap` drops peer names** (generic `OVERLAP_CONFLICT` message).
4. **MEDIUM — Input contract never updated** for `'next'` / `allowOutOfScope`.

Likely pre-existing / out of recorte-26 core path (still reported):

5. **HIGH — Archive `resolveInitialPersistedDependsOn` bypass** (`_partial-archive-hooks` D1).
6. **HIGH — ValidateArtifacts uses `permissiveSpecMetadataSchema`** (`_partial-rest` H1).
7. **HIGH — drift materialization requirement vs `FsChangeRepository`** (`_partial-rest` H2).
8. **HIGH — leftover CLI `change.spec.ts` + unmigrated drift tests** (`_partial-cli` D1/D2).

## Aggregate counts (from partials; some overlap)

| Batch          | Compliant reqs (approx)        | HIGH | MEDIUM | Notes                                |
| -------------- | ------------------------------ | ---- | ------ | ------------------------------------ |
| core-lifecycle | 52 / 61                        | 1    | 6      | D-3 is the new behavioural gap       |
| archive-hooks  | 61 / 71                        | 1    | 2      | spec-lock initial dependsOn          |
| cli            | 47 / 47                        | 2    | 1      | HIGHs are test layout, not CLI flags |
| rest           | 16 confirmed / 34 spot-checked | 3    | 6      | validate-artifacts / eslint          |

Partial files (source of truth for detail) remain in this directory:

- `_partial-core-lifecycle.md`
- `_partial-archive-hooks.md`
- `_partial-cli.md`
- `_partial-rest.md`

## Suggested next work (this change)

1. Reload `Change` in `TransitionChange` after refresh; add test (open file after refresh fails `implementing → verifying`).
2. Pass `peers` from composed `detectOverlap` into `formatOverlapMessage`.
3. Delta `Requirement: Input contract` for `to: ChangeState \| 'next'` and `allowOutOfScope`.
4. Composition test that `createGetStatus(config)` reports live overlap when archivable.
5. Migrate `artifact-drift` tests from `change.spec.ts` into `change/status.spec.ts`, then delete the leftover file.

---

## Detailed findings

The four partial reports follow verbatim.

# Simple verification — attempt 7

Result: **BLOCKED — artifact revision required**. This is not a successful verification declaration or a full compliance audit.

## Baseline and executed tests

`changes verification start versioned-approval-invalidation` created `verification-attempt-7` from `ready`, superseding attempt 6. The baseline contains 52 artifact files and 55 implementation files. Subsequent status successfully loaded the persisted attempt without changing lifecycle state.

Executed after starting this attempt:

`pnpm --filter @specd/core --filter @specd/cli --filter @specd/skills test`

- Core: 221 test files, 2742 tests passed.
- CLI: 82 test files, 945 tests passed.
- Skills: 9 test files, 61 tests passed.
- Aggregate command exit code: 0.

These passing suites do not establish that every merged scenario is correct or satisfied. Scenario review stopped on the artifact discrepancy below. Verification exit hooks and completion were not run, and no lifecycle transition was performed.

## Confirmed discrepancy: obsolete CLI policy flag in merged scenarios

Read through `changes spec-preview versioned-approval-invalidation cli:change-invalidate --artifact verify --format text`.

Three retained scenarios still invoke `--policy`:

1. `Scope-incompatible artifact-at-spec target is rejected` uses `--policy surgical` and requires a scope-incompatibility explanation.
2. `Downstream requires at least one target` uses `--policy downstream`.
3. `Global rejects explicit targets` uses `--policy global --target specs`.

The merged command-signature requirement and design.md:1158 instead declare `--artifact-policy` and `--workflow-policy`. The current CLI help exposes those flags, not `--policy`.

Safe reproduction using a nonexistent change name:

```text
node packages/cli/dist/index.js changes invalidate __verification_nonexistent__ --reason review --policy surgical --target design@core:change
error: unknown option '--policy'
exit: 1
```

Parsing fails before loading or mutating a change. The first scenario's required diagnostic is therefore not satisfied. The other two can superficially match exit code 1 for the wrong reason; they do not exercise policy-dependent target validation.

Recommendation: update all three examples to `--artifact-policy`, specify a valid existing fixture change and otherwise valid inputs, and assert the intended target-validation diagnostic as well as exit code 1. Keep the implementation and new command signature; restoring `--policy` is not required by the current design.

## Handoff

State remains `ready`, all artifacts are structurally complete, attempt 7 is active, and completed evidence 4 remains stale. Correct and revalidate the affected artifact, start a new baseline, and repeat verification before declaring success. The previous scope/reopening corrections are preserved; this remaining CLI scenario discrepancy was not fixed by that focused revision.

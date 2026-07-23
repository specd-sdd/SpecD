# Spec Compliance Audit: refactor-task-completion

## Scope

- Change specs: `core:count-tasks`, `core:get-status`, `core:transition-change`, `core:kernel`, and `core:schema-format`.
- Relevant direct dependencies and global architecture, conventions, testing, documentation, and ESLint constraints.

## Verification evidence

- Core test suite: 167 files and 2,242 tests passed.
- Core lint and build passed.
- Verification hooks ran the configured project test and lint commands successfully.

## Findings

### Medium: stale default-pattern verification scenario

`core:schema-format` retains an older scenario under `taskCompletionCheck` that states the default complete pattern is `^\s*-\s+\[x\]` while describing it as case-insensitive. The same merged spec adds the correct `^\s*-\s+\[[xX]\]` scenario. Runtime and focused tests implement the latter correctly. This is a specification inconsistency, not an implementation defect.

### Medium: missing direct multi-artifact aggregate test

`CountTasks` tests aggregate two files of one artifact type and verify the overall total, but do not directly exercise two distinct qualifying artifact types and assert that both appear in `byArtifact` and are summed into `total`. The implementation's loop supports this contract; a focused regression test is still needed.

## Conforming areas

- `CountTasks` uses materialized schema patterns with `safeRegex(..., 'gm')`, has no consumer fallback, and preserves zero-valued entries for unsafe patterns with non-empty content.
- `GetStatus` invokes `CountTasks` once and maps only `byArtifact` entries.
- `TransitionChange` preserves capability validation, delegates counting once for completion gates, and blocks only when incomplete counts are positive.
- Kernel and composition factories expose and wire `CountTasks` through resolver-backed dependencies.
- `buildSchema` materializes the uppercase-compatible complete pattern for task-capable artifacts and preserves explicit patterns.

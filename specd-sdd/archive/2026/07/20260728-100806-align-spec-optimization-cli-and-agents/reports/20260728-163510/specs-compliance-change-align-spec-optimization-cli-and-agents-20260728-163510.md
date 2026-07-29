# Specs Compliance Report

Change: `align-spec-optimization-cli-and-agents`

Mode: specific change

Generated: 2026-07-28 16:35:10 Europe/Madrid

## Executive Summary

The functional CLI, optimizer-template, workflow-guidance, and persisted mutation
behavior is implemented and all test, lint, and typecheck hooks pass.

The audit found one implementation/spec mismatch in the Core config-factory dependency
contract and one internal inconsistency in the merged workflow verification artifact.
The change should not advance to `done` until the reviewer decides whether the Core
contract should be implemented or revised and the workflow scenarios are aligned.

## Aggregate Results

- Change specs audited: 5
- Direct dependency specs reviewed: 12 unique
- Implementation mismatches: 1
- Spec-level inconsistencies: 1
- Test coverage gaps: 4
- Hook or test failures: 0

## Detailed Findings

# Spec Compliance Audit: align-spec-optimization-cli-and-agents

## Requirements Summary

Scope:

- `cli:spec-optimizations`
- `skills:agents`
- `skills:skill-templates-source`
- `skills:workflow-automation`
- `core:update-persisted-spec-optimizations`
- Direct dependencies at depth 1
- Applicable project-wide architecture, conventions, documentation, error handling, ESLint, logging, spec layout, and testing constraints

The audit used merged `changes spec-preview` content for all change specs, current
project context, graph-first implementation discovery, source inspection, and the
targeted plus workflow-hook test runs.

## Implementation Status

### cli:spec-optimizations

Status: conformant.

The command group exposes `get`, `set`, and `clear` under the plural `specs`
resource, rejects excess arguments, supports all output formats, validates mutually
exclusive input forms before resolving the Kernel, delegates each operation exactly
once, and routes typed errors through the shared error handler.

The text renderer handles uninitialized specs, missing fields, stale fields, and
staleness reasons. The structured renderer preserves the Core result fields.

### skills:agents

Status: conformant with a test coverage limitation.

Both optimizer templates use `specd project status --format toon` and the top-level
`llmOptimizedContext` gate. The spec optimizer uses direct
`specs optimizations set` options, permits a single-field update, forbids mixing
direct options with `--input`, and does not invoke metadata regeneration afterward.

The 50-70 percent output reduction remains a prompt-level behavioral target and is
not measured by an automated test.

### skills:skill-templates-source

Status: conformant for the changed requirements.

Shared guidance distinguishes `specs show`, `specs context`, and `specs metadata`
by intent. Archive guidance uses metadata only for diagnostics and uses the top-level
project status field for optimization decisions. Exact command contracts are asserted
in template tests.

### skills:workflow-automation

Status: implementation guidance is updated, but the merged spec contains an internal
contract inconsistency.

The shared template implements the new read-surface selection rules. However, older
verification scenarios retained singular command syntax and weaker JSON allowance
that conflict with requirements in the same merged spec.

### core:update-persisted-spec-optimizations

Status: functional mutation behavior is conformant; config-factory composition is
not conformant with the merged requirement.

Strict Zod validation occurs before repository or schema work. Set and clear behavior,
baseline capture, preservation of untouched fields, final-field removal, missing-state
clear, expected revisions, conflict propagation, result projection, and unknown-spec
handling are implemented and covered.

The composition dependency contract does not match the merged spec.

## Discrepancies

### Finding 1: Core composition resolver does not provide the specified dependency contract

Severity: Medium

Type: implementation/spec mismatch requiring a product decision.

Merged requirement:

`core:update-persisted-spec-optimizations` requires
`resolveUpdatePersistedSpecOptimizationsDeps(resolver)` to resolve:

- `specs: ReadonlyMap<string, SpecRepository>`
- an `initializePersistedSpecState` collaborator sufficient to invoke
  `resolveInitialPersistedDependsOn()` for first-state creation

Implementation evidence:

- `UpdatePersistedSpecOptimizationsDeps` exposes `specRepositories`,
  `getActiveSchema`, `parsers`, `extractorTransforms`, and `contentHasher` at
  `packages/core/src/composition/use-cases/update-persisted-spec-optimizations.ts:19`.
- The resolver returns those fields directly at
  `packages/core/src/composition/use-cases/update-persisted-spec-optimizations.ts:38`.
- No `initializePersistedSpecState` collaborator is resolved.
- The application use case invokes `resolveInitialPersistedDependsOn()` directly
  using lower-level dependencies.

Why code may be correct:

The current design still shares the same pure `resolveInitialPersistedDependsOn()`
service and avoids filesystem-shaped wiring in the public factory. The implemented
dependency shape may be the intended architecture, in which case the merged spec is
over-prescriptive and should be revised.

Why the spec may be correct:

The explicit collaborator requirement centralizes first-state initialization wiring
and prevents this use case from reconstructing another use case's dependency set.
If that is the intended boundary, the implementation and composition tests must change.

Verification impact:

The merged scenario
`createUpdatePersistedSpecOptimizations config form derives deps through the resolver`
fails as written.

### Finding 2: Workflow automation verification scenarios contradict canonical command requirements

Severity: Low

Type: spec-level inconsistency.

The merged `skills:workflow-automation` requirement says agent-authored workflow
examples must use canonical plural command groups and that structured extraction must
prefer TOON, with JSON used only when TOON is unavailable or explicitly requested.

Conflicting merged scenarios:

- `Agent chooses text format for status checks` requires
  `specd change status <name> --format text`, using the singular group as the primary
  example.
- `Agent chooses JSON for tool-call preparation` accepts JSON or TOON without the
  requirement's JSON exception.

The implementation guidance uses plural commands and prefers TOON, so changing code to
match these scenarios would violate the normative requirements. The verification
artifact should be updated to use `specd changes status` and to require TOON by default.

## Test Coverage

Executed successfully:

- CLI suite: 78 files, 855 tests
- Core suite: 195 files, 2355 tests
- Skills suite: 8 files, 44 tests
- OpenCode plugin suite: 2 files, 4 tests
- Verification pre-hooks: `pnpm test`, `pnpm lint`, and `pnpm typecheck`, all exit 0

The known `@specd/code-graph` `ERR_IPC_CHANNEL_CLOSED` unhandled-rejection diagnostic
appeared in cached hook output, but the package wrapper and the overall test hook
completed with exit 0. It is not caused by this change.

## Missing Tests

1. The Core composition smoke test only verifies construction. It does not assert the
   exact fields resolved by `resolveUpdatePersistedSpecOptimizationsDeps`, which allowed
   Finding 1 to pass.
2. No automated test measures the optimizer's required 50-70 percent token reduction.
3. CLI source implements stale text, uninitialized, and requested-missing output, but
   the change's command test file does not directly assert all three text branches.
4. No test validates the merged workflow verification examples against the canonical
   plural/TOON requirements, which allowed Finding 2.

## Spec Dependency Chain

- `cli:spec-optimizations` -> `cli:entrypoint`,
  `core:get-persisted-spec-optimizations`,
  `core:update-persisted-spec-optimizations`
- `skills:agents` -> `skills:skill`, `skills:workflow-automation`,
  `cli:spec-optimizations`
- `skills:skill-templates-source` -> `skills:skill`,
  `cli:spec-optimizations`, `skills:workflow-automation`
- `skills:workflow-automation` -> `cli:command-resource-naming`,
  `skills:agents`, `cli:spec-context`, `cli:spec-metadata`
- `core:update-persisted-spec-optimizations` ->
  `core:spec-optimization`, `core:spec-repository-port`,
  `core:spec-id-format`, `core:initialize-persisted-spec-state`

No contradiction with the applicable global architecture, TypeScript, ESM, error,
documentation, or testing constraints was found.

## Summary Counts

- Change specs audited: 5
- Direct dependency specs reviewed: 12 unique
- Implementation mismatches: 1
- Spec-level inconsistencies: 1
- Test coverage gaps: 4
- Hook or test failures: 0

## Audit Limitation

The required subagent was launched but remained blocked and produced no partial file,
including after an explicit finalize request. It was shut down and this five-spec audit
was completed inline, which is permitted for a scope of five or fewer specs.

# Spec Compliance Audit

- Change: `hook-live-progress`
- Mode: `--change`
- Timestamp: `20260715-115532`
- Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260714-164117-hook-live-progress`
- Graph stale: `false`

## Scope

- Change specs:
  - `core:hook-runner-port`
  - `core:run-step-hooks`
  - `cli:change-run-hooks`
  - `cli:change-transition`
- Project-wide specs reviewed for compatibility:
  - `default:_global/architecture`
  - `default:_global/conventions`
  - `default:_global/docs`
  - `default:_global/error-handling-conventions`
  - `default:_global/eslint`
  - `default:_global/logging`
  - `default:_global/spec-layout`
  - `default:_global/testing`

## Commands and Evidence

- `node packages/cli/dist/index.js graph stats --format json`
- `node packages/cli/dist/index.js changes status hook-live-progress --format toon`
- `node packages/cli/dist/index.js project context --format toon`
- `node packages/cli/dist/index.js changes context hook-live-progress verifying --include-change-specs --follow-deps --depth 1 --rules --constraints --scenarios --format text`
- `node packages/cli/dist/index.js changes spec-preview hook-live-progress core:hook-runner-port --format text`
- `node packages/cli/dist/index.js changes spec-preview hook-live-progress core:run-step-hooks --format text`
- `node packages/cli/dist/index.js changes spec-preview hook-live-progress cli:change-run-hooks --format text`
- `node packages/cli/dist/index.js changes spec-preview hook-live-progress cli:change-transition --format text`
- `pnpm test -- run-step-hooks.spec.ts hook-runner.spec.ts transition-change.spec.ts archive-change.spec.ts archive-change-batch-restore.spec.ts` in `packages/core`
- `pnpm test -- change-run-hooks.spec.ts change-transition.spec.ts _hook-progress-presenter.spec.ts formatter.spec.ts change.spec.ts` in `packages/cli`

## Summary

- Specs audited: `4`
- Findings: `2`
- Implementation drift findings: `0`
- Spec consistency findings: `2`
- Relevant test status:
  - `packages/core`: `155` files passed, `2141` tests passed
  - `packages/cli`: `73` files passed, `807` tests passed

## Findings

### 1. `core:run-step-hooks` merged spec still mixes `failedHook` and `failedHooks`

Severity: `medium`

Evidence from merged preview:

- The merged `spec.md` still says:
  - `If no matching entry exists ... the use case returns { hooks: [], success: true, failedHook: null }`
- The merged `verify.md` still says:
  - `result.failedHook identifies the test hook`
  - `result.failedHook is null`
- But the same merged spec also defines the final result shape as:
  - `failedHooks (array) — the subset of executed hook results whose success is false`

Implementation reality:

- `packages/core/src/application/use-cases/run-step-hooks.ts` returns `failedHooks: readonly RunStepHookEntry[]`
- CLI structured output also exposes `failedHooks`
- Targeted tests cover `failedHooks` ordering and shape

Assessment:

- The implementation and tests are aligned to the plural-array contract.
- The merged spec is internally inconsistent and still carries stale singular-contract language in several scenarios.
- This is a spec-level issue, not an implementation bug.

Recommended action:

- Update the change artifacts for `core:run-step-hooks` so every merged requirement and scenario uses `failedHooks` consistently.

### 2. `core:run-step-hooks` constructor requirement is stale relative to the external-runner contract

Severity: `medium`

Evidence from merged preview:

- The merged `verify.md` says:
  - `RunStepHooks` receives `ChangeRepository`, `ArchiveRepository`, `HookRunner`, and `SchemaProvider`
- The same merged spec also requires explicit external hook dispatch support.

Implementation reality:

- `packages/core/src/application/use-cases/run-step-hooks.ts` constructor currently receives:
  - `ChangeRepository`
  - `ArchiveRepository`
  - `HookRunner`
  - `ReadonlyMap<string, ExternalHookRunner>`
  - `SchemaProvider`

Assessment:

- The implementation is coherent with the external-hook requirement.
- The constructor requirement/scenario in the merged spec omits the external runner registry, so the spec no longer fully describes the implemented dependency contract.
- This is another spec-level inconsistency rather than a code defect.

Recommended action:

- Update the `Ports and constructor` requirement and verification scenario for `core:run-step-hooks` to include the external hook runner registry explicitly.

## No Additional Compliance Issues Found

- `core:hook-runner-port` is aligned with the implementation:
  - `HookRunner` remains an interface.
  - `NodeHookRunner` relays stdout/stderr output and heartbeat progress.
  - Final `HookResult` remains complete after progress events.
- `cli:change-run-hooks` is aligned with the implementation:
  - Text mode streams progress on `stderr` and writes the final summary on `stdout`.
  - Structured formats emit newline-delimited stream records on `stdout`.
  - Terminal structured record exposes `failedHooks`.
- `cli:change-transition` is aligned with the implementation:
  - Uses the shared presenter.
  - Emits hook progress as structured stream records.
  - Preserves final completion records on stdout in structured modes.
- No architecture-layer violations were found in the touched code paths.
- Test coverage for the changed behavior is strong in both `core` and `cli`.

## Conclusion

The live hook progress implementation is compliant in code and tests, but the change is not fully spec-compliant yet because the merged `core:run-step-hooks` artifacts still contain stale contract language. The next step should be a spec correction pass rather than additional implementation work.

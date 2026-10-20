# Specs compliance report: schema-workflow-skippable-states

## Result

**FAIL — implementation quality gates are blocking.** Runtime scenarios and package tests pass, and the implementation substantially realizes the proposal while preserving the archived `custom-checks-and-resilient-hooks` contract. Nevertheless, `pnpm lint` reports 40 errors and `pnpm typecheck` fails in `@specd/core`.

## Verification baseline

- Delegated attempt: `verification-attempt-4`
- Change state: `verifying`
- Specs audited: 21 merged change specs plus global constraints and direct dependencies
- Merged scenarios inventoried: 848
- Core tests: 2,970 passed
- CLI tests: 1,101 passed
- Skills tests: 62 passed
- Schema-std test command: passed

## Intent review

The implementation reflects the proposal's intended outcomes: schema-defined optional/disabled steps, a centralized workflow topology, distinct transition and step-skip checks, dynamic schema bindings, topology-aware validity/guidance/archive behavior, sovereign change-schema authority, and CLI/skill support. The earlier archived change remains the architectural base rather than being contradicted: open namespaced predicates, monotonic governance, cascaded config, structured failures, and the checks-versus-hooks boundary remain intact.

## Blocking findings

1. Core protocol-edge approvals are not type-safe under `exactOptionalPropertyTypes`.
2. Several changed tests use invalid or missing types (`HookEntry.run`, missing `RunStepHooks`, missing `SchemaProvider`, narrowed lifecycle tuples, and obsolete `onFailure: "warn"`).
3. Lint reports unused legacy topology code, redundant types/assertions, incomplete JSDoc, and an unsafe test argument.
4. The unused `VALID_TRANSITIONS`/`isStepPermitted` remnants weaken the proposal's claim that topology assumptions were fully centralized, even though tests currently pass.

## Decision classification

Most findings are implementation/test-quality defects and should route to implementation. The three `onFailure: "warn"` fixtures deserve a brief artifact-intent check against the archived resilient-hook semantics; if `warn` is intentionally still supported, specs/types need revision. If it is obsolete, the fixtures should be fixed.

## Detailed findings

See the retained partial reports in this directory:

- `_partial-topology-checks.md`
- `_partial-lifecycle-usecases.md`
- `_partial-delivery-context.md`

The outer verification attempt was intentionally left active and was not completed.

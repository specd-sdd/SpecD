# Lifecycle and use-case audit

## Scope

`core:lifecycle-engine`, `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, and `core:approve-signoff`.

## Requirements and implementation

- Merged scenarios cover topology-aware verification boundaries, forward guidance when verification is disabled, dynamic legal targets, implementation tracking across bypasses, sovereign-schema resolution, hook behavior, archive preflight, approval gates, preview, and status projections.
- The proposal's intent to eliminate hardcoded verification boundaries and rigid next-hop loops is represented in both specs and executable tests.
- The archived check/hook separation remains visible in status/transition/archive behavior, including predicate-first execution and resilient post-persist hook handling.

## Test coverage

- The full Core suite passed 2,970 tests, including extensive archive, lifecycle verdict, status, approvals, validation, hooks, and preview cases.

## Findings

### Blocking: lifecycle code does not pass repository lint/typecheck

- `lifecycle-verdict.ts` retains unused `VALID_TRANSITIONS` and `isStepPermitted`, evidence that the hardcoded topology migration is incomplete at source-quality level even though runtime tests pass.
- `change.ts` has incomplete public JSDoc for the new schema/approval-aware API.
- `get-artifact-instruction.spec.ts` lacks the `SchemaProvider` type/import and also triggers an unsafe-argument lint error.

These defects violate the global TypeScript, ESLint, and documentation specs. They are implementation-only unless the team intends to restore an older API shape.

## Summary

Behavioral coverage is strong and no proposal contradiction was identified, but quality gates prevent a clean compliance result.

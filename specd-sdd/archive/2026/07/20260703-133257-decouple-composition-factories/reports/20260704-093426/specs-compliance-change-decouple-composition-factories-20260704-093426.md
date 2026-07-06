# Spec Compliance Audit

- Mode: `--change decouple-composition-factories`
- Generated: `2026-07-04 09:34:26`
- Change: `decouple-composition-factories`

## Scope

- Change specs for composition/kernel/resolver refactor
- Public composition surface in `@specd/core` and `@specd/sdk`
- Supporting tests and host-facing CLI coverage relevant to the change

## Verification Evidence

- `pnpm --filter @specd/core test`
  - Result: passed
  - Coverage signal: includes `composition-resolver`, `kernel`, `kernel-builder`, `shared-repository-wiring`, public barrel coverage, fs repositories, implementation-tracking composition factories
- `pnpm --filter @specd/core build`
  - Result: passed
- `pnpm --filter @specd/sdk build`
  - Result: passed
- `pnpm --filter @specd/cli build`
  - Result: passed
- `pnpm --filter @specd/cli test -- --run packages/cli/test/commands/change-implementation.spec.ts packages/cli/test/commands/change-implementation-tracking.spec.ts`
  - Result: passed
  - Note: current CLI test invocation still executed the broader CLI suite in this environment; suite passed

## Findings

### 1. Spec inconsistency inside `core:composition` merged verification artifact

- Severity: medium
- Type: spec-level inconsistency

#### Evidence

The merged `core:composition` content states in `spec.md`:

- public root **MUST** export repository factories on `"."`
- integrators **MUST** be able to call `createSpecRepository('fs', ...)` without `createKernel`

The merged `verify.md` for the same spec still contains a contradictory scenario:

- `Scenario: Repository factories not in public exports`
- expectation: `createSpecRepository`, `createChangeRepository`, and `createArchiveRepository` are **not** present

That contradicts both:

- the merged `spec.md`
- the current implementation

#### Implementation confirmation

- `packages/core/src/public.ts`
  - exports `createSchemaRepository`
  - exports `createSpecRepository`
  - exports `createChangeRepository`
  - exports `createArchiveRepository`
- `packages/core/test/barrel.spec.ts`
  - asserts repository factories exist on the public barrel
- `packages/core/test/barrel-kernel-coverage.spec.ts`
  - asserts repository factories exist on the public barrel

#### Assessment

- Code appears consistent with the intended contract.
- The verification artifact appears stale or partially migrated.
- Most likely fix path: update the `core:composition` verify delta so the contradictory scenario is removed or rewritten.

## Overall Assessment

- Implementation status: strong
- Test status: strong
- Public API status: aligned with the intended refactor
- Compliance status: **issues found**

The main issue found in this audit is not a code defect but a spec/verify inconsistency within `core:composition`.

## Recommended Next Action

- Use `/specd-design decouple-composition-factories` if you want to fix the spec artifact inconsistency now.
- Use `/specd-implement decouple-composition-factories` only if you decide the code should change instead of the spec, which current evidence does not suggest.

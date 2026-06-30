# Tasks: 09-core-approval-gates-baked

## 1. Core types and use cases

- [x] 1.1 Add `ApprovalGates` type
      `packages/core/src/application/use-cases/transition-change.ts`
      (Req: Approval gates baked at construction)

- [x] 1.2 Slim `TransitionChangeInput` — remove approval fields
      `packages/core/src/application/use-cases/transition-change.ts`
      (Req: Input contract)

- [x] 1.3 Bake approvals in `TransitionChange` constructor
      `packages/core/src/application/use-cases/transition-change.ts`
      (Req: Approval gates baked at construction)

- [x] 1.4 Slim approve inputs; bake gates in constructors
      `approve-spec.ts`, `approve-signoff.ts`
      (Req: Input contract, Approval gate baked at construction)

## 2. Kernel relocation

- [x] 2.1 Move `approveSpec`/`approveSignoff` on `Kernel` interface
      `packages/core/src/composition/kernel.ts` — from `specs` to `changes`
      (Req: Kernel entry mapping)

- [x] 2.2 Move wiring in `createKernel`
      `packages/core/src/composition/kernel.ts` — instantiate under `changes` block
      (Req: Kernel entry mapping)

- [x] 2.3 Pass `config.approvals` in approve factories
      `composition/use-cases/approve-spec.ts`, `approve-signoff.ts`, `transition-change.ts`
      (Req: Factory passes config.approvals)

## 3. CLI integration

- [x] 3.1 Transition command — drop approval flags
      `packages/cli/src/commands/change/transition.ts`
      (Req: Delegates gate state to kernel)

- [x] 3.2 Approve command — `kernel.changes.approve*` + drop flags
      `packages/cli/src/commands/change/approve.ts`
      (Req: Delegates gate state to kernel)

## 4. Tests

- [x] 4.1 Update `transition-change.spec.ts` — constructor baking
      (Req: core:transition-change verify)

- [x] 4.2 Update `approve-spec.spec.ts` / `approve-signoff.spec.ts`
      (Req: core:approve-\* verify)

- [x] 4.3 Update CLI test helpers — mocks under `kernel.changes`
      `packages/cli/test/commands/helpers.ts`
      (Req: cli:change-approve verify)

- [x] 4.4 Update `change-approve.spec.ts` — path assertions
      (Req: cli:change-approve verify)

- [x] 4.5 Update `change-transition.spec.ts` — no approval flags on execute
      (Req: cli:change-transition verify)

- [x] 4.6 Kernel composition smoke — approve under `changes`
      `packages/core/test/composition/kernel-get-config.spec.ts`
      (Req: core:kernel verify)

## 5. Build verification

- [x] 5.1 Typecheck; grep no remaining `kernel.specs.approve`
      `pnpm --filter @specd/core test` + `pnpm --filter @specd/cli test`
      (Req: implementation matches specs)

## 6. Audit follow-up (compliance 2026-06-27)

- [x] 6.1 Fix `core:kernel` Purpose bullet — approve under `changes`
      `deltas/core/kernel/spec.md.delta.yaml`
      (Req: Kernel interface groups use cases by domain area)

- [x] 6.2 Gate guard sequence + `SchemaMismatchError` in `ApproveSpec`
      `packages/core/src/application/use-cases/approve-spec.ts`
      (Req: Gate guard)

- [x] 6.3 Gate guard sequence + `SchemaMismatchError` in `ApproveSignoff`
      `packages/core/src/application/use-cases/approve-signoff.ts`
      (Req: Gate guard)

- [x] 6.4 Tests — schema mismatch + disabled gate no repo access
      `approve-spec.spec.ts`, `approve-signoff.spec.ts`
      (Req: core:approve-\* verify)

- [x] 6.5 CLI tests — execute call shape via `kernel.changes.approve*`
      `packages/cli/test/commands/change-approve.spec.ts`
      (Req: cli:change-approve verify)

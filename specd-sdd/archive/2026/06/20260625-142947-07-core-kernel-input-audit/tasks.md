# Tasks: 07-core-kernel-input-audit

## 1. Documentation cleanup

- [x] 1.1 Remove skills-manifest rows from core overview table
      `docs/core/overview.md`: delete `RecordSkillInstall` and `GetSkillsManifest` table rows
      Approach: remove the two markdown table lines; keep adjacent `GetProjectContext` row intact
      (Req: Skills manifest use cases are not a kernel use case)

- [x] 1.2 Remove skills-manifest use case sections from core use-cases doc
      `docs/core/use-cases.md`: delete `### GetSkillsManifest` and `### RecordSkillInstall` sections including constructor/input blocks
      Approach: remove full sections; ensure following `GetProjectContext` section remains correctly headed
      (Req: Skills manifest use cases are not a kernel use case)

## 2. Conformance tests

- [x] 2.1 Assert kernel.project excludes skills-manifest entries
      `packages/core/test/composition/kernel-get-config.spec.ts`: add test after existing getConfig coverage
      Approach: `createKernel(makeConfig())` then expect `'recordSkillInstall' in kernel.project` and `'getSkillsManifest' in kernel.project` both false
      (Req: Skills manifest use cases are not a kernel use case, scenario: kernel.project does not expose skills manifest entries)

- [x] 2.2 Assert retired skills-manifest symbols are not public exports
      `packages/core/test/composition/kernel-get-config.spec.ts` or new `packages/core/test/composition/kernel-retired-surface.spec.ts`
      Approach: import `* as Core from '../../src/index.js'` (or package entry) and assert `RecordSkillInstall`, `GetSkillsManifest`, `createRecordSkillInstall`, `createGetSkillsManifest` are `undefined`
      (Req: Skills manifest use cases are not a kernel use case, scenario: Skills manifest use cases are not exported)

- [x] 2.3 Assert context inputs lack config field
      `packages/core/test/application/use-cases/compile-context.spec.ts` or dedicated `kernel-input-boundary.spec.ts`
      Approach: type-level test using `keyof CompileContextInput` and `keyof GetProjectContextInput` — assert neither includes `'config'`
      (Req: Kernel use case execute inputs must not re-pass construction-time config)

## 3. Audit verification (no code change)

- [x] 3.1 Confirm approval violations remain documented only
      `packages/core/src/application/use-cases/transition-change.ts`, `approve-spec.ts`, `approve-signoff.ts`
      Approach: read `*Input` types; confirm `approvalsSpec` / `approvalsSignoff` still present; do **not** modify — out of scope until `09-core-approval-gates-baked` archives
      (Req: Kernel use case execute inputs must not re-pass construction-time config — deferred violations)

- [x] 3.2 Run manual audit grep
      repository root via shell
      Approach: `rg 'config.*SpecdConfig' packages/core/src/application/use-cases/*Input` and `rg 'readonly config' packages/core/src/application/use-cases` on `*Input` interfaces; record zero `config` fields on execute inputs in design notes if helpful
      (Req: Allowed runtime override inputs)

## 4. Validation

- [x] 4.1 Run core test suite
      `packages/core`
      Approach: `pnpm --filter @specd/core test`
      (Req: all new verify scenarios)

- [x] 4.2 Preview merged specs before archive
      change `07-core-kernel-input-audit`
      Approach: `node packages/cli/dist/index.js changes spec-preview 07-core-kernel-input-audit core:kernel --format text` and same for `default:_global/architecture`
      (Req: specs + verify deltas)

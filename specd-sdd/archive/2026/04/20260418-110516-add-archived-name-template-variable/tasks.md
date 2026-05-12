# Tasks: add-archived-name-template-variable

This change is a **spec alignment** — the implementation already exists in code. The tasks confirm alignment coverage.

## 1. Spec Alignment

- [x] 1.1 Confirm RunStepHooks builds archivedName for archived fallback path
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      `_buildHookVariables()` — builds from `archived.archivedName` when archived change is used
      Approach: Already implemented - code at line 143 builds the variable from `ArchivedChange.archivedName`

- [x] 1.2 Confirm TemplateExpander supports change.archivedName
      `packages/core/src/application/template-expander.ts`:
      Pattern expansion — variable is available in template expansion
      Approach: Already implemented - pattern format `{{change.archivedName}}` is supported

- [x] 1.3 Confirm ArchivedChange entity exposes archivedName
      `packages/core/src/domain/entities/archived-change.ts`:
      `ArchivedChange.archivedName` — getter returns the stored value
      Approach: Already implemented - entity has `archivedName` property

## 2. Verification Coverage

- [x] 2.1 Confirm test coverage for archivedName in hook variables
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      Test at line 703 — verifies archivedName in variable map
      Approach: Already covered - test confirms variable is built correctly

- [x] 2.2 Confirm test coverage for changeDirName format
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`:
      Test at line 154 — verifies directory naming
      Approach: Already covered - test confirms `YYYYMMDD-HHmmss-<name>` format

## 3. Spec Delta Validation

- [x] 3.1 RunStepHooks spec delta is complete
      Deltas document archivedName in HookVariables construction requirement
      Approach: Delta already applied in change deltas

- [x] 3.2 TemplateVariables spec delta is complete
      Deltas add archivedName to contextual namespace table and examples
      Approach: Delta already applied in change deltas

- [x] 3.3 Verify scenarios cover new requirements
      Added scenarios for archived post-phase and active context edge cases
      Approach: Delta already applied in change deltas

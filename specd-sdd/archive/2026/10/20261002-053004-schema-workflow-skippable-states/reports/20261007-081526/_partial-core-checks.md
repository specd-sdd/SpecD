# Compliance Audit Partial: Checks, Governance & Sovereign Resolution

## Scope

- `core:check-registry`
- `core:transition-checks`
- `core:validate-artifacts`
- `core:run-step-hooks`
- `core:preview-spec`
- `core:get-status`
- `core:archive-change`
- `core:approve-spec`
- `core:approve-signoff`
- `core:compile-context`
- `core:get-artifact-instruction`
- `core:get-hook-instructions`

## Requirements Summary & Implementation Status

### 1. `core:check-registry`

- **Built-in Checks Injection**: Injected at construction; rejects external registration of unprefixed built-ins. Implemented in `CheckRegistry`.
- **Governance Locks**:
  - Category A (`protocol.edge`, `approval.*`, `verification.*`): Locked governance (`allowBindingOverride: false`, `allowDisable: false`).
  - Category B (`workflow.requires`, `impl.*`): Locked binding overrides, controlled disablement.
  - Category C (`spec.overlap`, etc.): Open governance.
- **Step-Skip Bindings**: Validates step coordinates (`from`, `to`, `along`) and prevents duplicate bindings.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified by 17 unit tests in `packages/core/test/domain/services/check-registry.spec.ts` and 9 tests in `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`.

### 2. `core:transition-checks`

- **Step-Skip Check Execution**:
  - Step-skip checks for `workflow.tasksEmpty` and implementation tracking (`impl.filesResolved`, `impl.linksInScope`) execute during bypass.
  - Skippable vs Non-skippable: Core protocol edges remain strict; skippable checks can be bypassed when configured.
  - Progress bus event emission: Canonical labels emitted during check evaluation.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified by 115 unit tests in `packages/core/test/application/use-cases/transition-change.spec.ts`.

### 3. Sovereign Schema Resolution across Core Use Cases

- `ValidateArtifacts`: Resolves change schema rather than workspace default.
- `RunStepHooks` & `GetHookInstructions`: Dispatches hooks based on sovereign schema definitions.
- `PreviewSpec`: Resolves artifact templates and rules from sovereign schema.
- `GetStatus`: Graceful degradation on missing schema; uses sovereign schema for transition and step computation.
- `ArchiveChange`: Enforces archival checks and metadata sync against sovereign change schema.
- `ApproveSpec` & `ApproveSignoff`: Enforces approval gate rules according to sovereign schema configuration.
- `CompileContext`: Resolves contextual dependencies according to sovereign schema.
- `GetArtifactInstruction`: Fetches composition rules and templates from sovereign schema.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified in respective use case test suites across `packages/core/test/application/use-cases/` and `packages/core/test/composition/use-cases/`.

## Discrepancies

- None detected.

## Test Coverage

- Comprehensive coverage across all modified use cases. All tests passing cleanly.

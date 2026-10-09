# Design: core-validate-change-batch

## Overview

This design extracts the batch change validation orchestration (`change validate --all`) from the CLI command helper (`executeBatch` in `packages/cli/src/commands/change/validate.ts`) into a canonical application use case in `@specd/core`: `ValidateChangeBatch`. External hosts (such as SpecD Studio HTTP API, Desktop IPC, LSP, and third-party tools) and the CLI will consume the same batch orchestration through `kernel.changes.validateBatch.execute()`.

## Architecture & Patterns

The design strictly follows Hexagonal Architecture and DDD principles:

1. **Application Layer**:
   - `ValidateChangeBatch` resides in `packages/core/src/application/use-cases/validate-change-batch.ts`.
   - It depends strictly on application ports and use cases: `ChangeRepository`, `SchemaProvider`, and `ValidateArtifacts`.
   - It performs pure workflow coordination: loading the change aggregate, verifying schema identity, querying the schema's `ArtifactDag`, scheduling steps in topological order, delegating each step to `ValidateArtifacts`, and aggregating outcomes.
2. **Domain Invariants**:
   - Change existence guard: `ChangeRepository.get(name)` must return a non-null `Change`, or `ChangeNotFoundError` is thrown.
   - Schema identity guard: `schema.name() === change.schemaName` is strictly enforced. If mismatched, `SchemaMismatchError` is thrown before any step execution.
   - Empty scope short-circuit: When `change.specIds` is empty, `{ passed: true, total: 0, results: [] }` is returned immediately without invoking `ValidateArtifacts`.
   - DAG ordering: Traversal follows `schema.artifactDag().topologicalOrder()`.
   - Fault tolerance: All scheduled steps are executed regardless of whether prior steps pass or fail.
3. **Composition Layer**:
   - Standard use-case factory `createValidateChangeBatch` in `packages/core/src/composition/use-cases/validate-change-batch.ts`.
   - Dependency resolver function `resolveValidateChangeBatchDeps(resolver)`.
   - Wired into `createKernel` as `kernel.changes.validateBatch`.
4. **Adapter Layer**:
   - `packages/cli/src/commands/change/validate.ts`: `executeBatch` is simplified to delegate to `kernel.changes.validateBatch.execute({ name, artifact: opts.artifact })`, then formats the aggregated result for text or JSON/TOON output.

## Affected areas

- `packages/core/src/application/use-cases/validate-change-batch.ts` (new use case and types)
- `packages/core/src/application/use-cases/index.ts` (use case export)
- `packages/core/src/composition/use-cases/validate-change-batch.ts` (new composition factory)
- `packages/core/src/composition/kernel.ts` (`Kernel.changes.validateBatch` interface and instance wiring)
- `packages/core/src/public.ts` and `packages/core/src/index.ts` (public barrel exports)
- `packages/sdk/src/core-reexports.ts` and `packages/sdk/src/index.ts` (SDK surface re-exports)
- `packages/cli/src/commands/change/validate.ts` (CLI command adapter delegation)

## New constructs

### 1. `ValidateChangeBatch` Use Case

```typescript
// packages/core/src/application/use-cases/validate-change-batch.ts

export interface ValidateChangeBatchInput {
  readonly name: string
  readonly artifactId?: string
}

export interface ValidateChangeBatchStepResult {
  readonly spec: string | null
  readonly artifact: string
  readonly passed: boolean
  readonly failures: readonly ValidationFailure[]
  readonly warnings: readonly ValidationWarning[]
  readonly files: readonly ValidationFileResult[]
}

export interface ValidateChangeBatchResult {
  readonly passed: boolean
  readonly total: number
  readonly results: readonly ValidateChangeBatchStepResult[]
}

export class ValidateChangeBatch {
  constructor(
    private readonly _changes: ChangeRepository,
    private readonly _schemaProvider: SchemaProvider,
    private readonly _validateArtifacts: ValidateArtifacts,
  ) {}

  async execute(input: ValidateChangeBatchInput): Promise<ValidateChangeBatchResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const schema = await this._schemaProvider.get()
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    if (change.specIds.length === 0) {
      return { passed: true, total: 0, results: [] }
    }

    const dag = schema.artifactDag()
    const results: ValidateChangeBatchStepResult[] = []

    for (const artifactId of dag.topologicalOrder()) {
      if (input.artifactId !== undefined && artifactId !== input.artifactId) {
        continue
      }

      const artifactType = schema.artifact(artifactId)
      if (artifactType === null) {
        continue
      }

      if (artifactType.scope === 'change') {
        const stepResult = await this._validateArtifacts.execute({
          name: input.name,
          artifactId,
        })
        results.push({
          spec: null,
          artifact: artifactId,
          passed: stepResult.failures.length === 0,
          failures: stepResult.failures,
          warnings: stepResult.warnings,
          files: stepResult.files,
        })
        continue
      }

      for (const specId of change.specIds) {
        const stepResult = await this._validateArtifacts.execute({
          name: input.name,
          specPath: specId,
          artifactId,
        })
        results.push({
          spec: specId,
          artifact: artifactId,
          passed: stepResult.failures.length === 0,
          failures: stepResult.failures,
          warnings: stepResult.warnings,
          files: stepResult.files,
        })
      }
    }

    const allPassed = results.every((r) => r.passed)
    return {
      passed: allPassed,
      total: results.length,
      results,
    }
  }
}
```

### 2. Composition Factory

```typescript
// packages/core/src/composition/use-cases/validate-change-batch.ts

export interface ValidateChangeBatchDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
  readonly validateArtifacts: ValidateArtifacts
}

export function resolveValidateChangeBatchDeps(
  resolver: CompositionResolver,
  options?: { readonly validateArtifacts?: ValidateArtifacts },
): ValidateChangeBatchDeps

export function createValidateChangeBatch(deps: ValidateChangeBatchDeps): ValidateChangeBatch
export function createValidateChangeBatch(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateChangeBatch
```

### 3. Kernel Interface & Assembly

In `packages/core/src/composition/kernel.ts`:

- Extend `Kernel['changes']` with `validateBatch: ValidateChangeBatch`.
- In `createKernel`, construct `validateBatch = createValidateChangeBatch({ changes: changesRepo, schemaProvider: resolver.getSchemaProvider(), validateArtifacts: validate })`.

## Data models & Contracts

The input and return payloads remain fully typed:

- `ValidateChangeBatchInput`:
  - `name: string`: change identifier.
  - `artifactId?: string`: optional filter for specific artifact DAG nodes.
- `ValidateChangeBatchResult`:
  - `passed: boolean`: true if all scheduled steps passed.
  - `total: number`: count of scheduled steps executed.
  - `results: readonly ValidateChangeBatchStepResult[]`: array of per-step results preserving execution order.
- Each `ValidateChangeBatchStepResult`:
  - `spec: string | null` (`null` when change-scoped, otherwise fully-qualified specId)
  - `artifact: string` (e.g. `proposal`, `specs`, `verify`)
  - `passed: boolean`
  - `failures: readonly ValidationFailure[]`
  - `warnings: readonly ValidationWarning[]`
  - `files: readonly ValidationFileResult[]`

## Testing

Unit, composition, and integration tests cover all scenarios in `verify.md`:

1. `packages/core/test/application/use-cases/validate-change-batch.spec.ts`:
   - `Constructor and dependencies`: correctly accepts dependencies and executes.
   - `Nonexistent change`: throws `ChangeNotFoundError`.
   - `Incompatible schema`: throws `SchemaMismatchError`.
   - `Empty specIds`: returns `{ passed: true, total: 0, results: [] }` without calling `ValidateArtifacts`.
   - `Topological DAG walk`: runs change-scoped once without `specPath`, spec-scoped once per `specId`.
   - `Artifact filter`: runs only matching artifact steps.
   - `Fault tolerance`: executes all steps even when intermediate steps fail, aggregating failures.
2. `packages/core/test/composition/use-cases/validate-change-batch.spec.ts`:
   - Tests factory creation via explicit deps and config resolver.
   - Tests `kernel.changes.validateBatch` integration.
3. `packages/cli/test/commands/change-validate.spec.ts`:
   - Verifies `--all` delegates to `validateBatch` and formats text / JSON output correctly.

## Documentation

- Ensure full JSDoc comments on `ValidateChangeBatch`, `ValidateChangeBatchInput`, `ValidateChangeBatchResult`, and `createValidateChangeBatch`.
- Update API reference in `packages/core/README.md` or docs if use-case catalogues are listed.

## Open questions

None. The design is completely aligned with project conventions and requirements.

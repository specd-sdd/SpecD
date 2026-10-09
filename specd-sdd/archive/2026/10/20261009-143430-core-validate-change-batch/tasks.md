# Tasks: core-validate-change-batch

## 1. Domain and Application Use Case

- [x] 1.1 Define input, step result, and aggregated result interfaces
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatchInput`, `ValidateChangeBatchStepResult`, `ValidateChangeBatchResult` — define public contracts for batch change validation
      Approach: define readonly interfaces matching design.md; `ValidateChangeBatchInput` with `name` and optional `artifactId`, `ValidateChangeBatchStepResult` with `spec`, `artifact`, `passed`, `failures`, `warnings`, `files`, and `ValidateChangeBatchResult` with `passed`, `total`, `results`
      (Req: Input, Aggregated result)
- [x] 1.2 Implement `ValidateChangeBatch` class with dependency injection
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch` — implement constructor receiving dependencies
      Approach: accept `ChangeRepository`, `SchemaProvider`, and `ValidateArtifacts` via constructor parameters as private readonly fields
      (Req: Constructor and dependencies)
- [x] 1.3 Implement change existence check and schema identity guard
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — load change and verify schema identity before scheduling steps
      Approach: call `this._changes.get(input.name)` and throw `ChangeNotFoundError` if null; resolve schema via `this._schemaProvider.get()` and throw `SchemaMismatchError(change.name, change.schemaName, schema.name())` when `schema.name() !== change.schemaName`
      (Req: Change existence and schema compatibility guard)
- [x] 1.4 Implement empty scope short-circuit
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — return empty success result when change has no spec IDs
      Approach: check `if (change.specIds.length === 0)` immediately after schema validation; return `{ passed: true, total: 0, results: [] }` without calling `ValidateArtifacts`
      (Req: Empty scope)
- [x] 1.5 Implement topological DAG traversal and artifact filtering
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — iterate schema DAG in topological order and filter by `artifactId`
      Approach: query `dag = schema.artifactDag()`, loop `for (const artifactId of dag.topologicalOrder())`, skip if `input.artifactId !== undefined && artifactId !== input.artifactId`, lookup `artifactType = schema.artifact(artifactId)` and skip if null
      (Req: DAG walk)
- [x] 1.6 Implement change-scoped step execution and result mapping
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — execute single validation step for change-scoped artifacts
      Approach: when `artifactType.scope === 'change'`, invoke `this._validateArtifacts.execute({ name: input.name, artifactId })` without `specPath`; push step result with `spec: null`, `artifact: artifactId`, `passed: stepResult.failures.length === 0`, `failures`, `warnings`, `files`
      (Req: DAG walk, Aggregated result)
- [x] 1.7 Implement spec-scoped step execution across `specIds`
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — loop `change.specIds` for spec-scoped artifacts without early termination
      Approach: when `artifactType.scope !== 'change'`, loop `for (const specId of change.specIds)`, invoke `this._validateArtifacts.execute({ name: input.name, specPath: specId, artifactId })`, and push per-spec step result. Continue loop across all failures
      (Req: DAG walk, Aggregated result)
- [x] 1.8 Implement batch outcome aggregation and final return value
      `packages/core/src/application/use-cases/validate-change-batch.ts`: `ValidateChangeBatch.execute()` — aggregate step outcomes into final result
      Approach: compute `allPassed = results.every(r => r.passed)`, and return `{ passed: allPassed, total: results.length, results }`
      (Req: Aggregated result, Not a substitute for ValidateSpecs)
- [x] 1.9 Export `ValidateChangeBatch` and types from application use cases barrel
      `packages/core/src/application/use-cases/index.ts`: export statements — expose use case and types to internal and public consumers
      Approach: add named exports for `ValidateChangeBatch`, `ValidateChangeBatchInput`, `ValidateChangeBatchStepResult`, `ValidateChangeBatchResult` from `./validate-change-batch.js`
      (Req: Constructor and dependencies, Input, Aggregated result)

## 2. Composition and Kernel Wiring

- [x] 2.1 Implement `resolveValidateChangeBatchDeps` helper
      `packages/core/src/composition/use-cases/validate-change-batch.ts`: `resolveValidateChangeBatchDeps` — resolve dependencies from `CompositionResolver`
      Approach: extract `changes` from `resolver.getChangeRepository()`, `schemaProvider` from `resolver.getSchemaProvider()`, and `validateArtifacts` from `options?.validateArtifacts ?? createValidateArtifacts(resolveValidateArtifactsDeps(resolver))`
      (Req: Constructor and dependencies)
- [x] 2.2 Implement `createValidateChangeBatch` factory overloads
      `packages/core/src/composition/use-cases/validate-change-batch.ts`: `createValidateChangeBatch` — instantiate use case from explicit deps or `SpecdConfig`
      Approach: implement overloaded factory using `normalizeCompositionFactoryArgs` following the `createValidateArtifacts` pattern; instantiate `new ValidateChangeBatch(deps.changes, deps.schemaProvider, deps.validateArtifacts)`
      (Req: Constructor and dependencies)
- [x] 2.3 Export factory and deps interface from composition use cases barrel
      `packages/core/src/composition/use-cases/index.ts`: export statements — expose factory and dependencies type
      Approach: add `export { createValidateChangeBatch, type ValidateChangeBatchDeps, resolveValidateChangeBatchDeps } from './validate-change-batch.js'`
      (Req: Constructor and dependencies)
- [x] 2.4 Extend `Kernel` interface with `validateBatch` in `kernel.ts`
      `packages/core/src/composition/kernel.ts`: `Kernel.changes` — add `validateBatch: ValidateChangeBatch` property to interface
      Approach: import `ValidateChangeBatch` from `../application/use-cases/validate-change-batch.js` and add `validateBatch: ValidateChangeBatch` to `Kernel['changes']`
      (Req: Constructor and dependencies)
- [x] 2.5 Wire `validateBatch` instance into `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel` — instantiate and register `validateBatch` in `kernel.changes`
      Approach: construct `validateBatch = createValidateChangeBatch({ changes: changesRepo, schemaProvider: resolver.getSchemaProvider(), validateArtifacts: validate })` and attach to `changes` object in returned kernel
      (Req: Constructor and dependencies)
- [x] 2.6 Export use case and factory in `@specd/core` public barrels
      `packages/core/src/public.ts`: barrel exports — expose `ValidateChangeBatch` and `createValidateChangeBatch` in public API
      Approach: re-export `ValidateChangeBatch`, `ValidateChangeBatchInput`, `ValidateChangeBatchStepResult`, `ValidateChangeBatchResult`, `createValidateChangeBatch`, `ValidateChangeBatchDeps` from `./application/use-cases/index.js` and `./composition/use-cases/index.js`
      (Req: Constructor and dependencies, Input, Aggregated result)
- [x] 2.7 Re-export use case and factory in `@specd/sdk`
      `packages/sdk/src/core-reexports.ts`: barrel re-exports — re-export use case and factory from `@specd/core`
      Approach: add `ValidateChangeBatch`, `ValidateChangeBatchInput`, `ValidateChangeBatchStepResult`, `ValidateChangeBatchResult`, `createValidateChangeBatch`, `ValidateChangeBatchDeps` to `@specd/core` import/export lists
      (Req: Constructor and dependencies, Input, Aggregated result)

## 3. CLI Command Adapter Refactor

- [x] 3.1 Refactor `executeBatch` to delegate to `kernel.changes.validateBatch`
      `packages/cli/src/commands/change/validate.ts`: `executeBatch()` — replace internal loop with `kernel.changes.validateBatch.execute()`
      Approach: call `const batchResult = await kernel.changes.validateBatch.execute({ name, artifactId: opts.artifact })` instead of manual DAG traversal and per-spec looping
      (Req: Behaviour, Batch mode (--all))
- [x] 3.2 Update text and JSON output rendering in `executeBatch`
      `packages/cli/src/commands/change/validate.ts`: `executeBatch()` — consume `ValidateChangeBatchResult` for formatting
      Approach: for text mode with `batchResult.total === 0`, output `${name}: no specIds declared`; otherwise render each step in `batchResult.results` and summary line `validated ${passedSteps}/${batchResult.total} steps`. For JSON/TOON output, output `batchResult` directly and set `process.exitCode = 1` if `!batchResult.passed`
      (Req: Batch mode (--all))
- [x] 3.3 Verify CLI spec dependency registration and options handling
      `packages/cli/src/commands/change/validate.ts`: command options and validation checks — preserve mutual exclusivity between `--all` and `<specPath>`
      Approach: retain existing option guards and error reporting while ensuring `--all` solely flows into the delegated batch execution
      (Req: Batch mode (--all), Spec Dependencies)

## 4. Automated Testing

- [x] 4.1 Unit tests: constructor, deps, and change existence guard
      `packages/core/test/application/use-cases/validate-change-batch.spec.ts`: test suite — verify initialization and `ChangeNotFoundError`
      Approach: mock `ChangeRepository` to return null; assert `execute({ name: 'missing' })` rejects with `ChangeNotFoundError`
      (Req: Constructor and dependencies, Change existence and schema compatibility guard)
- [x] 4.2 Unit tests: schema mismatch guard
      `packages/core/test/application/use-cases/validate-change-batch.spec.ts`: test suite — verify `SchemaMismatchError` when change schema differs from active schema
      Approach: setup change with `schemaName: 'schema-std'` and schema with `name(): 'schema-custom'`; assert `execute()` rejects with `SchemaMismatchError`
      (Req: Change existence and schema compatibility guard)
- [x] 4.3 Unit tests: empty `specIds` short-circuit
      `packages/core/test/application/use-cases/validate-change-batch.spec.ts`: test suite — verify zero-step success when change has no specs
      Approach: setup change with `specIds: []`; assert result equals `{ passed: true, total: 0, results: [] }` and `ValidateArtifacts.execute` is never called
      (Req: Empty scope)
- [x] 4.4 Unit tests: topological DAG order and scope handling
      `packages/core/test/application/use-cases/validate-change-batch.spec.ts`: test suite — verify change-scoped artifacts run once without `specPath` and spec-scoped run once per `specId`
      Approach: configure schema DAG with `proposal` (change) -> `specs` (spec); assert calls to `ValidateArtifacts` follow topological order and correct arguments
      (Req: DAG walk, Aggregated result)
- [x] 4.5 Unit tests: artifact filtering and fault tolerance
      `packages/core/test/application/use-cases/validate-change-batch.spec.ts`: test suite — verify `artifactId` filter and execution continuation across failures
      Approach: test with `artifactId: 'proposal'` (only proposal steps run); test scenario where first step fails and assert remaining steps execute, returning `passed: false` with aggregated failures
      (Req: Input, DAG walk, Aggregated result)
- [x] 4.6 Composition factory tests
      `packages/core/test/composition/use-cases/validate-change-batch.spec.ts`: test suite — verify factory instantiation via explicit deps and config resolver
      Approach: test `createValidateChangeBatch(deps)` and `createValidateChangeBatch(config)` using `setupCompositionFactoryConfig`; assert valid instance returned and wired into `createKernel`
      (Req: Constructor and dependencies)
- [x] 4.7 CLI integration tests for batch validation
      `packages/cli/test/commands/change-validate.spec.ts`: test suite — verify CLI `--all` command delegates to batch use case and renders output correctly
      Approach: test CLI `change validate --all` in text and JSON formats against fixture change, verifying exit code and structured output
      (Req: Behaviour, Batch mode (--all))

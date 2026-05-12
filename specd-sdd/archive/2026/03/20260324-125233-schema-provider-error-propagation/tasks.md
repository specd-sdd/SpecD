# Tasks: schema-provider-error-propagation

## 1. Port and provider

- [x] 1.1 Change `SchemaProvider.get()` return type to `Promise<Schema>`
      `packages/core/src/application/ports/schema-provider.ts`: `SchemaProvider` interface
      Approach: change return type, update JSDoc to document throws
      (Req: kernel — createKernel constructs shared adapters once)

- [x] 1.2 Remove error swallowing in `LazySchemaProvider`
      `packages/core/src/composition/lazy-schema-provider.ts`: `get()` method
      Approach: remove `try/catch`, change `_cached` type from `Schema | null | undefined` to `Schema | undefined`, propagate errors directly
      (Req: kernel — createKernel constructs shared adapters once)

## 2. Use case null guard removal

- [x] 2.1 Remove null guard from `CompileContext`
      `packages/core/src/application/use-cases/compile-context.ts`: remove `if (schema === null)` and `SchemaNotFoundError` import
      (Req: kernel)

- [x] 2.2 Remove null guard from `GetArtifactInstruction`
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`: same pattern
      (Req: kernel)

- [x] 2.3 Remove null guards from `RunStepHooks`
      `packages/core/src/application/use-cases/run-step-hooks.ts`: two null guards, remove import
      (Req: kernel)

- [x] 2.4 Remove null guard from `ValidateSpecs`
      `packages/core/src/application/use-cases/validate-specs.ts`: remove guard and import
      (Req: validate-specs — Resolve the active schema)

- [x] 2.5 Remove null guard from `ValidateArtifacts`
      `packages/core/src/application/use-cases/validate-artifacts.ts`: remove guard and import
      (Req: kernel)

- [x] 2.6 Remove null guard from `GetProjectContext`
      `packages/core/src/application/use-cases/get-project-context.ts`: remove guard and import
      (Req: get-project-context — Resolves schema before processing)

- [x] 2.7 Remove null guard from `ArchiveChange`
      `packages/core/src/application/use-cases/archive-change.ts`: remove guard and import
      (Req: kernel)

- [x] 2.8 Remove null guard from `GenerateSpecMetadata`
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: remove guard and import
      (Req: generate-metadata — Schema resolution)

- [x] 2.9 Remove null guard from `GetHookInstructions`
      `packages/core/src/application/use-cases/get-hook-instructions.ts`: remove guard and import
      (Req: kernel)

## 3. Simplify best-effort callers

- [x] 3.1 Simplify `TransitionChange` schema access
      `packages/core/src/application/use-cases/transition-change.ts`: change `schema?.workflowStep()` to `schema.workflowStep()`, update comment
      (Req: kernel)

- [x] 3.2 Simplify `ApproveSignoff` hash computation
      `packages/core/src/application/use-cases/approve-signoff.ts`: replace ternary with direct `buildCleanupMap(schema)` call
      (Req: approve-signoff — Gate guard)

- [x] 3.3 Simplify `ApproveSpec` hash computation
      `packages/core/src/application/use-cases/approve-spec.ts`: same as approve-signoff
      (Req: approve-spec — Gate guard)

- [x] 3.4 Fix `GetStatus` type annotation
      `packages/core/src/application/use-cases/get-status.ts`: change type from `Awaited<ReturnType<SchemaProvider['get']>>` to `Schema | null`, add `Schema` import, keep try/catch
      (Req: get-status — Graceful degradation when schema resolution fails)

## 4. Error attribution in ResolveSchema

- [x] 4.1 Validate base schema before merge
      `packages/core/src/application/use-cases/resolve-schema.ts`: when layers are present, call `buildSchema(schemaRef, inheritedData, templates)` before the merge; call `buildSchema("<schemaRef> (resolved)", mergedData, templates)` for the merged result
      (Req: resolve-schema — Resolution pipeline)

## 5. Tests

- [x] 5.1 Update `LazySchemaProvider` tests
      `packages/core/test/composition/lazy-schema-provider.spec.ts`: replace null-caching tests with error-propagation and retry tests
      (Req: kernel)

- [x] 5.2 Update `makeSchemaProvider` test helper
      `packages/core/test/application/use-cases/helpers.ts`: throw `SchemaNotFoundError` when null is passed
      (Req: kernel)

- [x] 5.3 Update `compile-context` test helper and scenario
      `packages/core/test/application/use-cases/compile-context.spec.ts`: update `makeStubSchemaProvider` to throw on null
      (Req: kernel)

- [x] 5.4 Update `transition-change` test defaults and scenario
      `packages/core/test/application/use-cases/transition-change.spec.ts`: default to `makeSchema()`, update "schema cannot be resolved" test
      (Req: kernel)

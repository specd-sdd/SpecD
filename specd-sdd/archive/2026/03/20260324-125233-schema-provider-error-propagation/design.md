# Design: schema-provider-error-propagation

## Affected areas

- `packages/core/src/application/ports/schema-provider.ts`: `SchemaProvider` interface — change `get()` return type from `Promise<Schema | null>` to `Promise<Schema>`
- `packages/core/src/composition/lazy-schema-provider.ts`: `LazySchemaProvider` — remove `catch {}` that swallows errors, remove `null` caching
- `packages/core/src/application/use-cases/resolve-schema.ts`: `ResolveSchema.execute()` — add base validation before merge, use `(resolved)` ref for merged schema
- `packages/core/src/application/use-cases/compile-context.ts`: remove null guard and `SchemaNotFoundError` import
- `packages/core/src/application/use-cases/get-artifact-instruction.ts`: remove null guard and import
- `packages/core/src/application/use-cases/run-step-hooks.ts`: remove two null guards and import
- `packages/core/src/application/use-cases/validate-specs.ts`: remove null guard and import
- `packages/core/src/application/use-cases/validate-artifacts.ts`: remove null guard and import
- `packages/core/src/application/use-cases/get-project-context.ts`: remove null guard and import
- `packages/core/src/application/use-cases/archive-change.ts`: remove null guard and import
- `packages/core/src/application/use-cases/generate-spec-metadata.ts`: remove null guard and import
- `packages/core/src/application/use-cases/get-hook-instructions.ts`: remove null guard and import
- `packages/core/src/application/use-cases/transition-change.ts`: remove optional chaining on `schema?.workflowStep()`, change comment from "best-effort" to direct
- `packages/core/src/application/use-cases/approve-signoff.ts`: simplify `_computeArtifactHashes` — call `buildCleanupMap(schema)` directly instead of ternary
- `packages/core/src/application/use-cases/approve-spec.ts`: same simplification as approve-signoff
- `packages/core/src/application/use-cases/get-status.ts`: change type annotation from `Awaited<ReturnType<SchemaProvider['get']>>` to `Schema | null`, add `Schema` import, keep existing `try/catch` for graceful degradation

## New constructs

_None._ This is a simplification — no new types, classes, or functions.

## Approach

1. **Change the port contract**: `SchemaProvider.get()` returns `Promise<Schema>`. Errors are communicated via exceptions (`SchemaNotFoundError`, `SchemaValidationError`), not via `null` return.

2. **Simplify `LazySchemaProvider`**: Remove the `try/catch` that converts errors to `null`. Cache type changes from `Schema | null | undefined` to `Schema | undefined`. When `execute()` throws, `_cached` stays `undefined`, allowing retries on subsequent calls.

3. **Remove null guards in use cases**: The 9 use cases that did `if (schema === null) throw new SchemaNotFoundError('(provider)')` no longer need this check — `get()` throws directly. Remove the guard and the now-unused `SchemaNotFoundError` import.

4. **Simplify best-effort callers**: `transition-change` used `schema?.workflowStep()` — now uses `schema.workflowStep()` directly. `approve-signoff` and `approve-spec` used a ternary for `cleanupMap` — now call `buildCleanupMap(schema)` directly.

5. **Preserve graceful degradation in `GetStatus`**: Keep the existing `try/catch` around `get()` but fix the type annotation. This is the only use case that intentionally handles schema failures.

6. **Base-then-merged validation in `ResolveSchema`**: When plugins or overrides are present, call `buildSchema(schemaRef, inheritedData, templates)` on the pre-merge data first. If the base is invalid, the error is attributed to the base ref. Then call `buildSchema("<schemaRef> (resolved)", mergedData, templates)` on the merged data. Errors introduced by layers are attributed to the resolved ref.
   (Req: Resolution pipeline — steps 7 and 8)

## Key decisions

**Decision** → Remove `null` from the return type entirely rather than keeping it for backwards compatibility.
**Alternatives rejected** → Keeping `Schema | null` and just fixing `LazySchemaProvider` to not swallow errors would still leave callers with dead null-guard code that can never execute. A clean contract is clearer.

**Decision** → Do not cache failures in `LazySchemaProvider` (allow retries).
**Alternatives rejected** → Caching the error and rethrowing on subsequent calls would prevent retries, which is unnecessarily restrictive for transient failures.

**Decision** → Validate base schema before merge in `ResolveSchema`.
**Alternatives rejected** → Passing the layer source through to `buildSchema` would require changing the `buildSchema` signature and threading context through validation. Validating in two passes is simpler and sufficient.

## Testing

### Automated tests

- `packages/core/test/composition/lazy-schema-provider.spec.ts`: update "caches null when throws" to "propagates errors from ResolveSchema"; add "retries resolution after error" test
- `packages/core/test/application/use-cases/helpers.ts`: update `makeSchemaProvider` to throw `SchemaNotFoundError` when `null` is passed instead of returning `null`; update `makeStubSchemaProvider` in compile-context similarly
- `packages/core/test/application/use-cases/transition-change.spec.ts`: update `makeUseCase` default to use `makeSchema()` instead of `null`; update "skips requires when schema cannot be resolved" to "throws when schema cannot be resolved"
- `packages/core/test/application/use-cases/compile-context.spec.ts`: update `makeStubSchemaProvider` to throw on `null`; existing "throws SchemaNotFoundError" test now verifies the error propagates from the provider

### Manual / E2E verification

- Introduce a duplicate hook ID in `specd.yaml` overrides → run `specd schema show` → verify the error says `@specd/schema-std (resolved)` with the real validation message
- Introduce a duplicate hook ID in the base schema YAML → run `specd schema show` → verify the error says `@specd/schema-std` (no `(resolved)`)
- With a valid schema, run `specd change context <name> <step>` → verify it works normally

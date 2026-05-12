# Proposal: schema-provider-error-propagation

## Motivation

`LazySchemaProvider.get()` silently swallows all exceptions — including `SchemaValidationError` — and returns `null`. Callers then throw a generic `SchemaNotFoundError('(provider)')` that hides the real error. When a schema is structurally invalid (e.g. duplicate hook IDs introduced by `schemaOverrides`), the user sees "Schema '(provider)' not found" instead of the actual validation failure.

## Current behaviour

- `SchemaProvider.get()` returns `Promise<Schema | null>`. The `null` case is documented as "schema cannot be resolved".
- `LazySchemaProvider` wraps `ResolveSchema.execute()` in a bare `catch {}` that converts every exception to `null` and caches it permanently.
- All use cases that need a schema call `get()`, check for `null`, and throw `SchemaNotFoundError('(provider)')` — losing the original error context.
- `schema` is a required field in `specd.yaml`. A missing schema is a `ConfigValidationError` caught during config loading, before `SchemaProvider` is ever called. There is no legitimate case where `get()` should return `null`.
- When `ResolveSchema` applies plugins or overrides and then calls `buildSchema`, validation errors are attributed to the base schema ref even when the error was introduced by a merge layer.

## Proposed solution

1. Change `SchemaProvider.get()` contract from `Promise<Schema | null>` to `Promise<Schema>`. Errors propagate as exceptions.
2. Remove the `catch {}` in `LazySchemaProvider` — let `SchemaNotFoundError` and `SchemaValidationError` propagate directly. Do not cache failures (allow retries).
3. Remove the `if (schema === null) throw new SchemaNotFoundError('(provider)')` guards from all use cases — they are dead code once `get()` never returns `null`.
4. In `ResolveSchema.execute()`, validate the base schema before the merge so that errors in the base are attributed to the base ref, and errors introduced by plugins/overrides are attributed to the resolved ref.
5. Use cases that need graceful degradation (`GetStatus`) keep their own `try/catch` around the `get()` call.

## Specs affected

### New specs

_None._

### Modified specs

- `core:core/kernel`: update `SchemaProvider` contract description — `get()` returns `Schema` (not `Schema | null`), throws on failure
- `core:core/validate-specs`: remove "returns `null`" language from schema resolution requirement and verify scenario
- `core:core/generate-metadata`: remove "returns `null`" language from schema resolution requirement and verify scenario
- `core:core/approve-signoff`: remove "returns `null`" language from schema resolution step and verify scenario
- `core:core/approve-spec`: remove "returns `null`" language from schema resolution step and verify scenario
- `core:core/get-status`: update to say `get()` throws (not returns `null`) — graceful degradation via catch
- `core:core/get-project-context`: remove "returns `null`" language from schema resolution requirement and verify scenario
- `core:core/resolve-schema`: add requirement for base-then-merged validation to attribute errors correctly

## Impact

- **Port contract**: `SchemaProvider` interface changes return type — all implementations and mocks must update
- **Use cases**: 9 use cases lose their null-guard boilerplate; `GetStatus` keeps its own try/catch
- **Composition**: `LazySchemaProvider` simplifies — no more error swallowing or null caching
- **Tests**: mock helpers and test scenarios that rely on `null` return must update
- **No runtime behaviour change** for valid schemas — only error reporting improves for invalid ones

## Open questions

_None._

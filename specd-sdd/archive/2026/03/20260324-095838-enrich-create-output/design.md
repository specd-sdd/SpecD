# Design: enrich-create-output

## Non-goals

- **Changing the text output** — `created change <name>` stays the same
- **Adding workspace info** — agents discover workspaces via `spec list`

## Affected areas

### Core: `CreateChange`

**File:** `packages/core/src/application/use-cases/create-change.ts`

Change return type from `Promise<Change>` to `Promise<CreateChangeResult>` where:

```typescript
export interface CreateChangeResult {
  readonly change: Change
  readonly changePath: string
}
```

After `save` and `scaffold`, call `this._changes.changePath(change)` and return both.

### CLI: `change create`

**File:** `packages/cli/src/commands/change/create.ts`

Destructure the result as `{ change, changePath }` instead of bare `change`. Add `changePath` to the JSON output object.

### Tests

- `packages/core/test/application/use-cases/create-change.spec.ts` — update result assertions
- `packages/cli/test/commands/change-create.spec.ts` — update mock return value shape, verify `changePath` in JSON output

## Approach

1. Add `CreateChangeResult` interface to `create-change.ts`
2. Change `execute` return type
3. Call `this._changes.changePath(change)` and return `{ change, changePath }`
4. Update CLI to destructure and include `changePath` in JSON output
5. Update tests

## Key decisions

**Decision: new result type, not modifying Change entity** → `changePath` is a storage concern, not a domain property. It belongs in the use case result, not on the entity.

# Design: fix-schema-fork-resolution

## Overview

Fix `schema fork` and `schema extend` to use the kernel's `SchemaRegistry` instead of building their own, add `--output` option (mutually exclusive with `--workspace`), and change the default `schemasPath` from `specd/schemas` to `.specd/schemas`.

## Approach

### 1. Expose `SchemaRegistry` on the `Kernel` interface

**File:** `packages/core/src/composition/kernel.ts`

Add a top-level `schemas` field to the `Kernel` interface:

```typescript
export interface Kernel {
  /** The schema registry for resolving arbitrary schema references. */
  schemas: SchemaRegistry
  changes: { ... }
  specs: { ... }
  project: { ... }
}
```

In `createKernel()`, wire it from `KernelInternals`:

```typescript
return {
  schemas: i.schemas,
  changes: { ... },
  ...
}
```

This follows the same pattern as `specs.repos: ReadonlyMap<string, SpecRepository>` — exposing a port directly on the kernel for operations that don't map to a use case.

**Exports:** `SchemaRegistry` type and `SchemaRawResult` are already importable from `@specd/core` via `application/ports/schema-registry.ts`. Verify they are re-exported from the application index; if not, add the re-export.

### 2. Rewrite `schema fork` command

**File:** `packages/cli/src/commands/schema/fork.ts`

**Remove:** `buildSchemaRegistry()` and `buildSchemaRepositories()` helper functions (lines 18–47). Remove unused imports (`createSchemaRegistry`, `createSchemaRepository`).

**Change action handler:**

```typescript
const { config, kernel } = await resolveCliContext({ configPath: opts.config })

// Mutual exclusion check
if (opts.workspace !== undefined && opts.output !== undefined) {
  cliError('--workspace and --output are mutually exclusive', undefined, 1, 'CLI_ERROR')
}

// Resolve source schema via kernel registry
const raw = await kernel.schemas.resolveRaw(ref)
if (raw === null) {
  cliError(`schema '${ref}' not found`, undefined, 3, 'SCHEMA_NOT_FOUND')
}

// Determine target directory
let targetDir: string
if (opts.output !== undefined) {
  targetDir = path.resolve(opts.output)
} else {
  const wsName = opts.workspace ?? 'default'
  const targetWs = config.workspaces.find((ws) => ws.name === wsName)
  const schemasPath = targetWs?.schemasPath ?? undefined
  if (schemasPath === undefined) {
    cliError(`workspace '${wsName}' has no schemas directory configured`, undefined, 1, 'CLI_ERROR')
  }
  const schemaName = opts.name ?? raw.data.name
  targetDir = path.join(schemasPath, schemaName)
}
```

**Add `--output` option** to Commander:

```typescript
.option('--output <path>', 'target directory (mutually exclusive with --workspace)')
```

**Note on `--workspace`:** Currently `--workspace` defaults to `'default'` via Commander's default value. With the mutual exclusion check, we need both `--workspace` and `--output` to be `undefined` when not provided by the user. Change `--workspace` to have no default, and handle the default (`'default'`) in the action handler when neither option is given.

**Create target directory recursively** when using `--output`:

```typescript
await fs.mkdir(targetDir, { recursive: true })
```

For workspace-derived paths, the parent (`schemasPath`) should already exist, but `mkdir` with `recursive: true` before `cp` is safe.

### 3. Rewrite `schema extend` command

**File:** `packages/cli/src/commands/schema/extend.ts`

Same changes as fork:

- Remove `buildSchemaRegistry()` and `buildSchemaRepositories()`
- Use `kernel.schemas.resolveRaw(ref)` instead
- Add `--output` option, mutually exclusive with `--workspace`
- Remove Commander default for `--workspace`, handle in action handler
- Create target directory recursively with `fs.mkdir(targetDir, { recursive: true })`

### 4. Change default `schemasPath`

**File:** `packages/core/src/infrastructure/fs/config-loader.ts` (line 418)

Change:

```typescript
? path.resolve(configDir, 'specd/schemas')
```

To:

```typescript
? path.resolve(configDir, '.specd/schemas')
```

This aligns with the `.specd/` directory convention used by all other storage paths (changes, drafts, archive, metadata).

## Affected areas

| Area             | File                                                   | Change                                                     |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Kernel interface | `packages/core/src/composition/kernel.ts`              | Add `schemas: SchemaRegistry` field                        |
| Kernel wiring    | `packages/core/src/composition/kernel.ts`              | Wire `i.schemas` in `createKernel()`                       |
| Core exports     | `packages/core/src/application/index.ts`               | Re-export `SchemaRegistry` and `SchemaRawResult` if needed |
| Fork command     | `packages/cli/src/commands/schema/fork.ts`             | Remove helpers, use kernel, add `--output`                 |
| Extend command   | `packages/cli/src/commands/schema/extend.ts`           | Remove helpers, use kernel, add `--output`                 |
| Config loader    | `packages/core/src/infrastructure/fs/config-loader.ts` | Default `.specd/schemas`                                   |

## New constructs

- `Kernel.schemas: SchemaRegistry` — direct access to the schema registry port from the kernel

## Testing

| Scenario                                           | Test approach                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fork resolves in pnpm monorepo                     | Integration test: verify `schema fork` succeeds when schema only exists in CLI's `node_modules`                 |
| Fork with `--output`                               | Integration test: verify schema is copied to the specified path and directory is created                        |
| Fork with `--output` to nested non-existent path   | Integration test: verify recursive directory creation                                                           |
| Fork `--workspace` + `--output` mutual exclusion   | Unit test: verify exit code 1                                                                                   |
| Extend resolves in pnpm monorepo                   | Integration test: same as fork                                                                                  |
| Extend with `--output`                             | Integration test: verify schema.yaml is written to specified path                                               |
| Extend `--workspace` + `--output` mutual exclusion | Unit test: verify exit code 1                                                                                   |
| Default `schemasPath` is `.specd/schemas`          | Config-loader unit test: load config without `schemas` section, assert `schemasPath` ends with `.specd/schemas` |

Existing tests for `schema fork` and `schema extend` in the CLI test suite should continue to pass after updating any hardcoded `specd/schemas` references to `.specd/schemas`.

## Documentation

No changes to `docs/` are needed — these are internal CLI commands and the config spec update captures the default path change.

## Open questions

None.

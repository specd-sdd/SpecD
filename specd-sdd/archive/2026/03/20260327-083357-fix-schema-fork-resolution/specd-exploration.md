Generated: 2026-03-27

# Exploration: fix-schema-fork-resolution

## Problem statement

GitHub issue #50: `specd schema fork` (and `specd schema extend`) fail to resolve schemas
in a pnpm monorepo. Both commands build their own `SchemaRegistry` with hardcoded
`node_modules` paths instead of using the kernel's properly-wired resolution pipeline.
Two sub-problems:

1. **Wrong schema resolution:** Both commands call `buildSchemaRegistry(config)` which
   creates a registry with `nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')]`.
   In a pnpm monorepo, `@specd/schema-std` is symlinked into `packages/cli/node_modules/`,
   not the project root's `node_modules/`. The kernel (via `createCliKernel` in
   `packages/cli/src/kernel.ts`) already handles this correctly by passing the CLI
   package's own `node_modules` paths as `extraNodeModulesPaths`.

2. **Missing default schemasPath:** Both commands read `targetWs?.schemasPath` which is
   `null` when the workspace doesn't explicitly configure a `schemas` section. Per the
   config spec (`core:core/config`), the `default` workspace should default to
   `specd/schemas` relative to `specd.yaml`. The config loader already applies this
   default to `SpecdConfig`, but the workspace config's `schemasPath` field is `null`
   when not explicitly set — the commands should use the resolved default.

## Affected files

- `packages/cli/src/commands/schema/fork.ts` — lines 18-47: `buildSchemaRegistry` and
  `buildSchemaRepositories` helper functions that duplicate (incorrectly) what the kernel does
- `packages/cli/src/commands/schema/extend.ts` — lines 18-47: exact same duplicated helpers

## How the kernel does it correctly

- `packages/cli/src/kernel.ts`: `createCliKernel` calls `createKernel(config, { extraNodeModulesPaths: [_cliPackageNodeModules, _cliSiblingNodeModules] })`
- `_cliPackageNodeModules` = `path.resolve(_cliDir, '../node_modules')` — the CLI package's own node_modules
- `_cliSiblingNodeModules` = `path.resolve(_cliDir, '../../..')` — for global installs
- `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext` already creates the kernel — both commands already call it on line 65 but only use `config`, ignoring `kernel`

## Fix approach

1. **Remove** `buildSchemaRegistry` and `buildSchemaRepositories` from both `fork.ts` and `extend.ts`
2. **Use the kernel** from `resolveCliContext()` — destructure `{ config, kernel }` instead of just `{ config }`
3. **For schema resolution:** Use the kernel's SchemaRegistry port. The kernel doesn't
   directly expose the registry, but it does expose use cases. We need `resolveRaw` which
   is on the `SchemaRegistry` port. Options:
   - Expose the registry on the kernel (cleanest but wider change)
   - Use `createSchemaRegistry` but with the same options the kernel uses (via `createCliKernel` internals)
   - The kernel already has `kernel.specs.getActiveSchema` but that resolves the project's
     active schema, not an arbitrary ref. We need `resolveRaw(ref)` for an arbitrary ref.
   - **Best approach:** Check if `createKernelInternals` or the composition layer exposes
     the registry. If not, the simplest correct fix is to reuse the same `createSchemaRegistry`
     call but with the correct `nodeModulesPaths` from the CLI kernel setup.
4. **For target schemasPath:** The config spec says default workspace defaults to
   `specd/schemas`. Need to check how `SpecdConfig` resolves this — if `schemasPath` is
   already resolved in `SpecdConfig.workspaces[].schemasPath` or if it's `null` and needs
   manual fallback.

## Specs in the change

- `cli:cli/schema-fork` — existing spec, describes correct behavior. Implementation doesn't match.
  Delta should be `no-op` (spec is correct, code is wrong).
- `cli:cli/schema-extend` — same situation, same `no-op` delta expected.

## Key observations

- Both `fork.ts` and `extend.ts` have identical `buildSchemaRegistry` / `buildSchemaRepositories`
  functions — clear copy-paste duplication
- Both already import and call `resolveCliContext` but discard the `kernel`
- The `SchemaRegistry` port interface (`packages/core/src/application/ports/schema-registry.ts`)
  has `resolveRaw(ref)` which returns `SchemaRawResult | null` — exactly what both commands need
- The `Kernel` interface doesn't directly expose the `SchemaRegistry` — it's an internal
  used by use cases. Need to investigate the composition layer to find the right access pattern.
- `schema show` works fine because it goes through the kernel properly

## Config spec on default schemasPath

From `core:core/config` spec:

> For the `default` workspace, if [schemas] omitted, defaults to `adapter: fs` with
> `fs.path: specd/schemas`.

Need to verify whether the config loader applies this default to `schemasPath` in
`SpecdConfig` or if it remains `null`. Current config output shows `schemasPath: null`
for `default` workspace's `schemasPath` field when not configured — confirming the
commands need a fallback.

Actually, checking the `config show` output from the session:

```json
{ "name": "default", "schemasPath": null }
```

But the config spec says there IS a default. So either:

- The config loader doesn't apply the default (bug in config loader too?)
- Or `schemasPath` on the workspace object is intentionally null and the default is
  only applied at the `SchemaRegistry`/`SchemaRepository` level

This needs investigation during design/implementation.

## User notes

- User explicitly pointed out that `schema extend` has the same problem (same duplicated
  `buildSchemaRegistry` pattern). Added `cli:cli/schema-extend` to the change scope.
- This is a bug fix — specs already describe correct behavior.

## Open questions

- How to access the `SchemaRegistry` from the kernel or composition layer? The kernel
  doesn't expose it directly. May need to either:
  (a) expose it on the Kernel interface, or
  (b) use the same factory (`createSchemaRegistry`) with correct params
- Is the `schemasPath: null` for default workspace a config loader bug or by-design?
  The fix may need to handle both the commands and potentially the config loader.

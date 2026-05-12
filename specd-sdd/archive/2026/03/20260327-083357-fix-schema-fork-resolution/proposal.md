# Proposal: fix-schema-fork-resolution

## Motivation

`specd schema fork` and `specd schema extend` fail with `fatal: schema '@specd/schema-std' not found` in pnpm monorepos because they build their own `SchemaRegistry` with hardcoded `node_modules` paths instead of using the kernel's properly-wired resolution pipeline (GitHub issue #50). Additionally, the default `schemasPath` for the `default` workspace uses the wrong directory (`specd/schemas` instead of `.specd/schemas`), and both commands lack a `--output` option for specifying a custom target directory.

## Current behaviour

Both `fork.ts` and `extend.ts` contain duplicated `buildSchemaRegistry` / `buildSchemaRepositories` helper functions that construct a `SchemaRegistry` with `nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')]`. In a pnpm monorepo, npm-scoped schemas like `@specd/schema-std` are symlinked into the CLI package's own `node_modules/` (e.g. `packages/cli/node_modules/@specd/schema-std`), not the project root's `node_modules/`. This causes resolution to fail.

Meanwhile, `schema show` and all other kernel-based commands work correctly because they go through `resolveCliContext` → `createCliKernel`, which passes the CLI's own `node_modules` paths via `extraNodeModulesPaths`.

Both commands already call `resolveCliContext()` but destructure only `{ config }`, discarding the `kernel`.

The config loader defaults `schemasPath` for the `default` workspace to `specd/schemas` relative to the config directory, but the correct default should be `.specd/schemas`.

Neither command supports a `--output` option — the target directory is always derived from the workspace's `schemasPath`, with no override possible.

## Proposed solution

Three fixes in this change:

1. **Use the kernel's `SchemaRegistry`:** Remove the duplicated `buildSchemaRegistry` / `buildSchemaRepositories` helpers from both commands and use the kernel's properly-wired registry instead. This requires exposing the `SchemaRegistry` on the `Kernel` interface since it is currently internal to `KernelInternals`. The `Kernel` will gain a `schemas` field giving CLI commands direct access to the registry for operations like `resolveRaw(ref)`.

2. **Fix default `schemasPath`:** Change the config loader's default from `specd/schemas` to `.specd/schemas` for the `default` workspace when no explicit `schemas` section is configured.

3. **Add `--output` option:** Both `schema fork` and `schema extend` gain a `--output <path>` option that specifies an explicit target directory. `--output` and `--workspace` are mutually exclusive — if both are provided, the command exits with code 1. When `--output` is provided, the schema is written to the specified path instead of deriving it from a workspace's `schemasPath`. The directory is created recursively if it doesn't exist.

Fork continues to copy the full schema directory including templates. Extend continues to create only a minimal `schema.yaml` with an `extends` reference (no templates).

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/schema-fork`: add `--output` option to command signature; clarify that fork copies templates alongside `schema.yaml`.
  - Depends on (added): none

- `cli:cli/schema-extend`: add `--output` option to command signature; clarify that extend creates only the minimal `schema.yaml` (no templates).
  - Depends on (added): none

- `core:core/config`: change default `schemasPath` for the `default` workspace from `specd/schemas` to `.specd/schemas`.
  - Depends on (added): none

## Impact

- **`packages/cli/src/commands/schema/fork.ts`** — remove ~30 lines of duplicated helpers, use kernel registry, add `--output` option
- **`packages/cli/src/commands/schema/extend.ts`** — same removal and fix, add `--output` option
- **`packages/core/src/composition/kernel.ts`** — expose `SchemaRegistry` on the `Kernel` interface and wire it in `createKernel`
- **`packages/core/src/infrastructure/fs/config-loader.ts`** — change default from `specd/schemas` to `.specd/schemas`
- **Tests** — update any tests that assert the old default path

## Technical context

- `KernelInternals` (in `kernel-internals.ts`) already holds `schemas: SchemaRegistry` — the registry is built once with correct `nodeModulesPaths` including CLI-provided `extraNodeModulesPaths`.
- The `Kernel` interface groups use cases under `changes`, `specs`, and `project`. The registry is a port, not a use case, but exposing it follows the same pattern as `specs.repos: ReadonlyMap<string, SpecRepository>` which already exposes a port directly.
- The config loader at `packages/core/src/infrastructure/fs/config-loader.ts:417-418` currently defaults to `path.resolve(configDir, 'specd/schemas')` — changing to `.specd/schemas` aligns it with the `.specd/` directory convention used by other storage paths (changes, drafts, archive, metadata all live under `.specd/`).
- `--output` and `--workspace` are mutually exclusive. Both resolve the target directory but by different means: `--workspace` looks up a workspace's `schemasPath`, while `--output` uses a literal path. Passing both is an error (exit code 1).

## Open questions

None.

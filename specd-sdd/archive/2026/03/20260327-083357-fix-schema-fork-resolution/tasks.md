# Tasks: fix-schema-fork-resolution

## 1. Expose SchemaRegistry on Kernel

- [x] 1.1 Add `schemas` field to `Kernel` interface
      `packages/core/src/composition/kernel.ts`: `Kernel` interface —
      add `schemas: SchemaRegistry` as a top-level field
      Approach: import `SchemaRegistry` from `../application/ports/schema-registry.js`,
      add field before `changes` group
      (Req: Fork behaviour, Extend behaviour)

- [x] 1.2 Wire `schemas` in `createKernel()`
      `packages/core/src/composition/kernel.ts`: `createKernel()` —
      add `schemas: i.schemas` to the returned object
      Approach: add alongside existing `changes`, `specs`, `project` groups
      (Req: Fork behaviour, Extend behaviour)

- [x] 1.3 Ensure `SchemaRegistry` and `SchemaRawResult` are re-exported
      `packages/core/src/application/index.ts` — verify types are importable
      from `@specd/core`; add re-exports if missing
      Approach: check if `schema-registry.ts` port types are already re-exported;
      if not, add `export type { SchemaRegistry, SchemaRawResult } from './ports/schema-registry.js'`
      (Req: Fork behaviour, Extend behaviour)

## 2. Fix schema fork command

- [x] 2.1 Remove duplicated helpers from `fork.ts`
      `packages/cli/src/commands/schema/fork.ts`: `buildSchemaRegistry()`,
      `buildSchemaRepositories()` — delete both functions and unused imports
      (`createSchemaRegistry`, `createSchemaRepository`, `SpecdConfig`)
      Approach: remove lines 13–47 and clean up import block
      (Req: Fork behaviour)

- [x] 2.2 Add `--output` option and remove `--workspace` default
      `packages/cli/src/commands/schema/fork.ts`: Commander chain —
      add `.option('--output <path>', 'target directory (mutually exclusive with --workspace)')`,
      remove default value `'default'` from `--workspace`
      Approach: change `--workspace` to `.option('--workspace <workspace>', 'target workspace')`
      without third arg; handle `'default'` fallback in action handler
      (Req: Command signature)

- [x] 2.3 Rewrite action handler to use kernel registry
      `packages/cli/src/commands/schema/fork.ts`: action handler —
      destructure `{ config, kernel }` from `resolveCliContext()`;
      add mutual exclusion check for `--workspace`/`--output`;
      resolve schema via `kernel.schemas.resolveRaw(ref)`;
      compute target dir from `--output` or workspace `schemasPath`;
      create target dir with `fs.mkdir(targetDir, { recursive: true })`
      Approach: follow the code structure in design.md section 2
      (Req: Fork behaviour, Error cases)

## 3. Fix schema extend command

- [x] 3.1 Remove duplicated helpers from `extend.ts`
      `packages/cli/src/commands/schema/extend.ts`: `buildSchemaRegistry()`,
      `buildSchemaRepositories()` — delete both functions and unused imports
      Approach: same as 2.1
      (Req: Extend behaviour)

- [x] 3.2 Add `--output` option and remove `--workspace` default
      `packages/cli/src/commands/schema/extend.ts`: Commander chain —
      same changes as 2.2
      Approach: same as 2.2
      (Req: Command signature)

- [x] 3.3 Rewrite action handler to use kernel registry
      `packages/cli/src/commands/schema/extend.ts`: action handler —
      same pattern as 2.3, preserving the `kind: schema-plugin` check
      Approach: follow the code structure in design.md section 3
      (Req: Extend behaviour, Error cases)

## 4. Change default schemasPath

- [x] 4.1 Update config loader default
      `packages/core/src/infrastructure/fs/config-loader.ts`: line 418 —
      change `path.resolve(configDir, 'specd/schemas')` to
      `path.resolve(configDir, '.specd/schemas')`
      Approach: single-line change
      (Req: Workspaces)

## 5. Tests

- [x] 5.1 Add config-loader test for default schemasPath
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` —
      new test: load config without `schemas` section, assert default workspace's
      `schemasPath` ends with `.specd/schemas`
      Approach: write minimal `specd.yaml` without `schemas`, load via
      `loadConfig()`, check `config.workspaces[0].schemasPath`
      (Req: Workspaces)

- [x] 5.2 Add/update fork integration tests
      `packages/cli/test/commands/schema/fork.spec.ts` —
      test pnpm resolution, `--output`, `--output` with nested path,
      `--workspace` + `--output` mutual exclusion
      Approach: use temp dirs; for pnpm test, verify the kernel registry
      resolves correctly; for `--output`, assert directory creation and
      schema copy; for mutual exclusion, assert exit code 1
      (Req: Fork behaviour, Error cases)

- [x] 5.3 Add/update extend integration tests
      `packages/cli/test/commands/schema/extend.spec.ts` —
      same scenarios as 5.2 adapted for extend (no template copy,
      minimal schema.yaml, schema-plugin rejection)
      Approach: same pattern as 5.2
      (Req: Extend behaviour, Error cases)

## 6. Build and verify

- [x] 6.1 Rebuild and run full test suite
      Run `pnpm build && pnpm test && pnpm lint` to verify no regressions
      Approach: fix any type errors from the Kernel interface change,
      update any tests that hardcode `specd/schemas` as default path

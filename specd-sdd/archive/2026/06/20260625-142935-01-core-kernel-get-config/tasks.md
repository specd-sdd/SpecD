# Tasks: 01-core-kernel-get-config

## 1. GetConfig use case

- [x] 1.1 Add `GetConfig` application use case
      `packages/core/src/application/use-cases/get-config.ts`: `GetConfig` — new class
      Approach: constructor accepts `SpecdConfig`, assigns `this._snapshot = structuredClone(config)`; `execute(): Readonly<SpecdConfig>` returns `_snapshot`; full JSDoc on class, constructor, `execute`
      (Req: Constructor captures construction-time config, execute returns a parameterless host snapshot, No disk I/O)

- [x] 1.2 Export `GetConfig` from application barrel
      `packages/core/src/application/use-cases/index.ts`: exports — add `GetConfig` type export
      Approach: follow neighbouring use case export pattern (`export { GetConfig } from './get-config.js'`)
      (Req: Standalone factory — enables factory import)

## 2. Composition factory

- [x] 2.1 Add `createGetConfig` factory
      `packages/core/src/composition/use-cases/get-config.ts`: `createGetConfig`, `GetConfigOptions` — new file
      Approach: dual overload `(config: SpecdConfig)` and `(options: GetConfigOptions)`; use `isSpecdConfig` to disambiguate; return `new GetConfig(config)`
      (Req: Standalone factory)

- [x] 2.2 Export factory from composition barrel
      `packages/core/src/composition/use-cases/index.ts`: exports — add `createGetConfig`, `GetConfigOptions`
      Approach: re-export from `./get-config.js`
      (Req: Standalone factory)

- [x] 2.3 Export from package entry
      `packages/core/src/index.ts`: public exports — add `GetConfig`, `createGetConfig`
      Approach: match existing use case export lines
      (Req: Standalone factory)

## 3. Kernel wiring

- [x] 3.1 Extend `Kernel` interface
      `packages/core/src/composition/kernel.ts`: `Kernel.project` — add `getConfig: GetConfig`
      Approach: import `GetConfig`; add property alongside `getProjectContext`
      (Req: kernel.project.getConfig — Kernel entry mapping)

- [x] 3.2 Wire `getConfig` in `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel` return object `project` group — add `getConfig: new GetConfig(config)`
      Approach: pass the same `config` argument; cloning stays inside `GetConfig` constructor
      (Req: Constructor captures construction-time config, Kernel entry mapping)

## 4. Tests

- [x] 4.1 Unit tests for `GetConfig`
      `packages/core/test/application/use-cases/get-config.spec.ts`: new describe blocks
      Approach: test clone (`!==` input, deep equal); stable `execute()` reference; `createGetConfig` factory; no fs/network mocks
      (Req: all GetConfig verify scenarios)

- [x] 4.2 Kernel wiring integration test
      `packages/core/test/composition/kernel-get-config.spec.ts` (or extend existing kernel test): `createKernel`
      Approach: after `createKernel(config)`, assert `kernel.project.getConfig.execute()` deep-equals `config` and `!== config`; mutate returned nested field, assert `listWorkspaces.execute()` unchanged and second `getConfig.execute()` deep-equal to original
      (Req: Host mutation does not affect kernel wiring, Returned snapshot is not the live wiring reference)

## 5. Documentation

- [x] 5.1 Add core docs for GetConfig
      `docs/core/get-config.md`: new page
      Approach: document `kernel.project.getConfig.execute()`, readonly host contract, yaml edits via `ConfigWriter` factories, recreate kernel when disk yaml changes
      (Req: Host read path only)

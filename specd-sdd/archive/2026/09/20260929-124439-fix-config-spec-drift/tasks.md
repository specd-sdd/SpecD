# Tasks: fix-config-spec-drift

## 1. Specification Alignment Verification

- [x] 1.1 Verify `ConfigWriter` port interface contract
      `packages/core/src/application/ports/config-writer.ts`: `ConfigWriter` — verify `initProject(options: InitProjectOptions)` single parameter and `listPlugins(configPath: string, type?: string)` optional type match updated specs
      Approach: Confirm TypeScript interface declarations match `deltas/core/config/spec.md.delta.yaml` and `deltas/core/config-writer-port/spec.md.delta.yaml`
      (Req: Config writer port, ListPlugins)
- [x] 1.2 Verify `FsConfigWriter` implementation
      `packages/core/src/infrastructure/fs/config-writer.ts`: `FsConfigWriter` — verify runtime implementations of `initProject` and `listPlugins` satisfy the updated port contract
      Approach: Ensure `initProject` reads `projectRoot` from `options` and `listPlugins` handles `type === undefined` by returning all plugins
      (Req: Config writer port, ListPlugins)
- [x] 1.3 Verify `ConfigLoader` schema override preservation
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` — verify config loader preserves raw `schemaOverrides` without transforming hooks
      Approach: Confirm loader does not map `{ run }` or `{ instruction }` hooks, aligning with the removal of obsolete verification scenarios in `core:config-loader`
      (Req: Schema plugins, schema overrides, and context entry mapping)

## 2. Test Execution & Compliance

- [x] 2.1 Run ConfigWriter unit tests
      `packages/core/test/infrastructure/fs/config-writer.spec.ts` — run tests covering `initProject`, `addPlugin`, `removePlugin`, and `listPlugins`
      Approach: Execute vitest for config-writer to verify all test cases pass cleanly
      (Req: Config writer port, ListPlugins)
- [x] 2.2 Run ConfigLoader unit tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` — run tests covering config loading and cascade merging
      Approach: Execute vitest for config-loader to ensure loader behavior is intact
      (Req: Schema plugins, schema overrides, and context entry mapping)
- [x] 2.3 Run full @specd/core test suite
      `packages/core` — execute entire test suite across use cases and adapters
      Approach: Run `pnpm --filter @specd/core test` and verify zero failures

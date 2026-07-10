# Tasks: generalize-repository-factories

## 1. Config Loader & Normalization

- [x] 1.1 Support specdPath and optional storage block in config-loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdYamlZodSchema`, `FsConfigLoader.load`, and `FsConfigLoader._buildConfig` — define `specdPath` as optional, make `storage` optional with default `fs` fallbacks under `specdPath`, and perform load-time directory existence checks.
      Approach: update YAML schema, resolve `specdPath` relative to `configDir`, compute `configPath` as `<specdPath>/config`, populate omitted storage bindings, and check that all resolved directories (`specdPath`, staging paths, workspace paths) exist on disk, throwing `StorageDirectoryNotFoundError` if any are missing.
      (Req: Storage configuration)
- [x] 1.2 Normalize adapter configs in config-loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: `resolveAdapterBinding` — normalize legacy shape `{ adapter, [adapter]: config }` and new shape `{ adapter: { type, config } }` in-memory.
      Approach: update `resolveAdapterBinding()` to return `{ type, config }` where config is a Record<string, unknown>, regardless of input layout, preserving backward compatibility.
      (Req: Storage configuration)
- [x] 1.3 Resolve relative metadataPath and path to absolute
      `packages/core/src/infrastructure/fs/config-loader.ts`: `resolveAdapterBinding` — resolve relative path options to absolute.
      Approach: if config contains `path` or `metadataPath` and it is relative, resolve it relative to the config directory (or `specdPath` for defaults) using `path.resolve(configDir, value)`.
      (Req: Storage configuration)
- [x] 1.4 Support specdPath in SpecdConfig and migrate codebase
      `packages/core/src/application/specd-config.ts` and codebase: add `specdPath` to `SpecdConfig`, replace `configPath` in `specd.yaml` validations, and remove hardcoded `'.specd'` strings.
      Approach: update `SpecdConfig` interface, `isSpecdConfig` type guard, and replace hardcoded `'.specd'` with `config.specdPath` in `CompositionResolver`, `KernelInternals`, etc.
      (Req: Storage configuration)

## 2. Infrastructure Repositories Zod Validation & Factories

- [x] 2.1 Validate options and define factory in FsChangeRepository
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository` constructor and new `createFsChangeStorageFactory` — validate options with Zod and export the storage factory creator.
      Approach: update constructor to accept `(context: ChangeRepositoryConfig, config: FsChangeRepositoryConfig)`. Parse `config` via Zod and check that active changes (`path`), drafts (`context.draftsPath`), and discarded changes (`context.discardedPath`) directories exist on disk using `fs.existsSync`, throwing `StorageDirectoryNotFoundError` if missing.
      (Req: Validate options at construction, Storage factory registration)
- [x] 2.2 Validate options and define factory in FsSpecRepository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository` constructor and new `createFsSpecStorageFactory` — validate options with Zod and export the storage factory creator.
      Approach: update constructor to accept `(context: SpecRepositoryConfig, config: FsSpecRepositoryConfig)`. Parse `config` via Zod and check that specs (`path`) and metadata (`metadataPath`) directories exist on disk using `fs.existsSync`, throwing `StorageDirectoryNotFoundError` if missing.
      (Req: Validate options at construction, Storage factory registration)
- [x] 2.3 Validate options and define factory in FsArchiveRepository
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `FsArchiveRepository` constructor and new `createFsArchiveStorageFactory` — validate options with Zod and export the storage factory creator.
      Approach: update constructor to accept `(context: ArchiveRepositoryConfig, config: FsArchiveRepositoryConfig)`. Parse `config` via Zod and check that archive (`path`), active changes (`context.changesPath`), and drafts (`context.draftsPath`) directories exist on disk using `fs.existsSync`, throwing `StorageDirectoryNotFoundError` if missing.
      (Req: Validate options at construction, Storage factory registration)
- [x] 2.4 Validate options and define factory in FsSchemaRepository
      `packages/core/src/infrastructure/fs/schema-repository.ts`: `FsSchemaRepository` constructor and new `createFsSchemaStorageFactory` — validate options with Zod and export the storage factory creator.
      Approach: update constructor to accept `(context: RepositoryConfig, config: FsSchemaRepositoryConfig)`. Parse `config` via Zod and check that schemas (`path`) directory exists on disk using `fs.existsSync`.
      (Req: Validate options at construction, Storage factory registration)

## 3. Composition Registries & Resolver

- [x] 3.1 Register default storage factories in registries
      `packages/core/src/composition/composition-registries.ts`: `createBuiltinCompositionRegistry` — import and register the four new `createFs*StorageFactory()` creators.
      Approach: delete `readStringOption`/`readRecordOption` and static `FS_*` constants; populate the registry maps with the factories returned by calling `createFs*StorageFactory()`.
      (Req: Storage factory registration)
- [x] 3.2 Update resolver option nesting for ChangeRepository
      `packages/core/src/composition/composition-resolver.ts`: `resolveChangeRepository` — assemble nested drafts and discarded config options.
      Approach: query the changes storage factory, then call `.create()` passing `context` (containing workspace context + runtime callbacks + draftsPath + discardedPath) and `config` (containing path) separately.
      (Req: Resolver exposes normalized shared dependencies)
- [x] 3.3 Update resolver option nesting for ArchiveRepository
      `packages/core/src/composition/composition-resolver.ts`: `resolveArchiveRepository` — assemble nested changes and drafts config options.
      Approach: query the archive storage factory, then call `.create()` passing `context` (containing workspace context + runtime paths: changesPath, draftsPath) and `config` (with path and pattern) separately.
      (Req: Resolver exposes normalized shared dependencies)

## 4. Public Facade Factories Generalization

- [x] 4.1 Update change-repository public facade
      `packages/core/src/composition/change-repository.ts`: `createChangeRepository` — query the registry to instantiate the repository.
      Approach: implement config-based and registry-based overloads, resolve factory by type, merge extra registries using `mergeNamedRegistry`, and delegate construction by passing `context` and `config` separately.
      (Req: Repository factories resolve adapter IDs through composition registries)
- [x] 4.2 Update spec-repository public facade
      `packages/core/src/composition/spec-repository.ts`: `createSpecRepository` — query the registry to instantiate the repository.
      Approach: implement config-based and registry-based overloads, resolve factory by type, merge extra registries using `mergeNamedRegistry`, and delegate construction by passing `context` and `config` separately.
      (Req: Repository factories resolve adapter IDs through composition registries)
- [x] 4.3 Update archive-repository public facade
      `packages/core/src/composition/archive-repository.ts`: `createArchiveRepository` — query the registry to instantiate the repository.
      Approach: implement config-based and registry-based overloads, resolve factory by type, merge extra registries using `mergeNamedRegistry`, and delegate construction by passing `context` and `config` separately.
      (Req: Repository factories resolve adapter IDs through composition registries)
- [x] 4.4 Update schema-repository public facade
      `packages/core/src/composition/schema-repository.ts`: `createSchemaRepository` — query the registry to instantiate the repository.
      Approach: implement config-based and registry-based overloads, resolve factory by type, merge extra registries using `mergeNamedRegistry`, and delegate construction by passing `context` and `config` separately.
      (Req: Repository factories resolve adapter IDs through composition registries)

## 5. Kernel & Builder Integration

- [x] 5.1 Accept repository overrides in KernelOptions
      `packages/core/src/composition/kernel.ts`: `createKernel`, `KernelOptions` — accept repositories overrides in options and inject them into use cases.
      Approach: extend `KernelOptions` interface and pass overrides into the `CompositionResolver` session constructor, returning them immediately on resolution.
      (Req: Repository overrides provided in KernelOptions)
- [x] 5.2 Support repository overrides in KernelBuilder
      `packages/core/src/composition/kernel-builder.ts`: `KernelBuilder` — add fluent setter for repository overrides.
      Approach: add a `withRepositoryOverrides` method to accumulate overrides and pass them to `createKernel()` on `build()`.
      (Req: Repository overrides in builder)

## 6. Automated & E2E Testing

- [x] 6.1 Add tests for repository option validation
      `packages/core/test/infrastructure/fs/change-repository.test.ts`, `packages/core/test/infrastructure/fs/spec-repository.test.ts`: describe blocks — assert constructor Zod schema parses correctly.
      Approach: write unit tests passing valid, invalid, and non-existent paths to verify expected Zod and existence-check errors.
      (Req: Options validated by Zod at construction)
- [x] 6.2 Add test for repository overrides in kernel
      `packages/core/test/composition/kernel.test.ts`: describe block — assert injected repositories are reused.
      Approach: write unit test passing mock change repository to `createKernel`, assert the returned kernel uses that instance.
      (Req: Repository overrides provided in KernelOptions)
- [x] 6.3 E2E test verification
      Manual validation: run `specd project status` and `specd config show` to verify layout output and command execution.
      Approach: verify that the CLI prints config paths correctly and boots.
      (Req: Output format)

## 7. Legacy Configuration Warnings

- [x] 7.1 Extend SpecdConfig interface
      `packages/core/src/application/specd-config.ts`: `SpecdConfig` — add optional `warnings` field.
      (Req: Legacy configuration warnings)
- [x] 7.2 Implement FsConfigLoader warnings collection
      `packages/core/src/infrastructure/fs/config-loader.ts`: `resolveAdapterBinding`, `_buildConfig` — collect and return warnings (must show that the legacy format will be removed in future versions).
      (Req: Legacy configuration warnings)
- [x] 7.3 Log warnings in CLI bootstrap
      `packages/cli/src/load-config.ts`, `packages/cli/src/helpers/cli-context.ts`: print warnings to stderr.
      (Req: Legacy configuration warnings)
- [x] 7.4 Add tests for legacy configuration warnings
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: assert config loader emits warnings for legacy format containing the future removal notice.
      (Req: Legacy configuration warnings)

## 8. Documentation Updates

- [x] 8.1 Update configuration reference documentation
      `docs/config/config-reference.md` — update storage and workspace adapter configuration descriptions and examples to reflect the new `{ type, config: { path } }` format, and document that the legacy string format is deprecated and will be removed in future versions.
      (Req: Documentation updates)
- [x] 8.2 Update configuration examples
      `docs/config/examples/` (including `approvals-and-workflow-hooks.md`, `multi-repo-coordinator.md`, `single-repo-local-schema.md`, `single-repo-minimal.md`) — rewrite all `specd.yaml` snippets to use the new generalized adapter configuration format.
      (Req: Documentation updates)

## 9. Project Initialization Fix

- [x] 9.1 Create workspace specs directory in initProject
      `packages/core/src/infrastructure/fs/config-writer.ts`: `FsConfigWriter.initProject` — create the default workspace's specs directory (resolved from `options.specsPath`) on disk.
      (Req: Fresh project initialisation creates default workspace specs directory)
- [x] 9.2 Add tests for specs directory creation in config-writer tests
      `packages/core/test/infrastructure/fs/config-writer.spec.ts`: assert that workspace specs directory is created during project initialization.
      (Req: Fresh project initialisation creates default workspace specs directory)

## 10. Storage Defaults & Path Resolution Fixes

- [x] 10.1 Generalized storage defaults in config-loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: update default storage settings when omitted in `specd.yaml` to use the new generalized adapter format so that no false-positive legacy configuration warnings are emitted.
- [x] 10.2 Normalized relative context file paths
      `packages/core/src/infrastructure/fs/config-loader.ts`: normalize relative file paths inside project-level `context` array and `remove.context` matchers to absolute paths relative to the loaded config file directory inside `parseCascadeLayer` so that cascade removal resolves matching absolute paths.
- [x] 10.3 Added tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: added test cases asserting no warnings are emitted when storage is omitted, and updated cascade removal assertions to expect absolute resolved paths.

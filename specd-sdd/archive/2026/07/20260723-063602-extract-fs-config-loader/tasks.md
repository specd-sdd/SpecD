# Tasks: extract-fs-config-loader

## 1. Domain Configuration Schema Isolation

- [x] 1.1 Create `config-schema.ts` and move Zod schemas and validation helpers
      `packages/core/src/application/ports/config-schema.ts`: `SpecdYamlZodSchema`, `validateContextPattern`, `validateContextPatterns` — define domain configuration schemas and syntax validation rules
      Approach: Move `SpecdYamlZodSchema`, `WorkspaceRawZodSchema`, `ProjectGraphZodSchema`, `WorkspaceGraphZodSchema`, `PrefixZodSchema`, `SchemaOverridesZodSchema`, `PluginEntryZodSchema`, `PluginsZodSchema`, `LoggingZodSchema`, `validateContextPattern`, `validateContextPatterns`, `formatZodPath`, and `deepMergeRawConfig` from config-loader.ts into this new file. Export all of them using named exports.
      (Req: YAML parsing and structural validation, contextIncludeSpecs and contextExcludeSpecs pattern validation)

- [x] 1.2 Export new config schema file from ports index
      `packages/core/src/application/ports/index.ts`: export new config-schema exports
      Approach: Add named exports for the Zod schema and helper functions from `./config-schema.js` to ensure application and infrastructure layers can resolve them properly.

## 2. Infrastructure FS Cascade Extraction

- [x] 2.1 Create `config-cascade.ts` and move cascade parsing and merging logic
      `packages/core/src/infrastructure/fs/config-cascade.ts`: `discoverCandidateFiles`, `resolveForcedCascade`, `resolveActiveChain`, `mergeActiveLayers` — extract filesystem-specific configuration cascade logic
      Approach: Move cascade Zod schemas, types, walking/discovery, resolution, removal helpers, and environment helpers to this new file.
      (Req: Discovery mode, Forced mode, Layer merge semantics, Native environment file support)

- [x] 2.2 Simplify `config-loader.ts` to only contain `FsConfigLoader`
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` — simplify the file-system config loader class adapter
      Approach: Delete moved helpers; import cascade + config-schema; keep class + adapter binding helpers.
      (Req: All errors are ConfigValidationError, Path probe, Default values for workspace fields)

## 3. Wiring and Verification

- [x] 3.1 Update composition config loader factory
      `packages/core/src/composition/config-loader.ts`: `createDefaultConfigLoader`
      Approach: Ensure imports resolve from simplified `config-loader.js`.

- [x] 3.2 Update and execute Vitest configuration loader tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`
      Approach: Adjust imports; run suite green.
      (Req: Testing)

## 4. Spec drift follow-up (compliance)

- [x] 4.1 Confirm default schemasPath remains `.specd/schemas` in loader
- [x] 4.2 Confirm absent metadataPath is not derived in `FsConfigLoader.load`
- [x] 4.3 Confirm public factory naming and port surface
- [x] 4.4 Re-run config-loader regression suite

## 5. Explicit metadataPath end-to-end (Both)

- [x] 5.1 Retain explicit `metadataPath` on fs adapter normalization
      `packages/core/src/infrastructure/fs/config-loader.ts`: `resolveAdapterBinding`
      Approach: In the `fs` branch, after resolving a relative `metadataPath` to absolute, copy it onto `normalizedConfig.metadataPath` (do not drop it when building `{ path, pattern? }`).
      (Req: Path resolution relative to config directory / Workspaces metadataPath)

- [x] 5.2 Prefer retained `metadataPath` in composition
      `packages/core/src/composition/composition-resolver.ts`: `resolveMetadataPathForWorkspace`
      Approach: If `workspace.specsAdapter.config.metadataPath` is a non-empty string, return it; otherwise keep existing VCS / fallback derivation. Ensure SpecRepository + validation-cache call sites keep using the helper.
      (Req: Spec repository metadataPath preference)
      Impact: CRITICAL dependents (kernel / SpecRepository factories) — absent path behaviour must stay identical.

- [x] 5.3 Tests for retain + prefer
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` (+ composition/resolver coverage as needed)
      Approach: Assert declared `metadataPath` survives `load()` on the specs adapter binding; assert composition wires SpecRepository with that path; assert absent still derives under VCS root.
      (Req: Testing / Explicit metadataPath scenarios)

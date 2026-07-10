# Proposal: generalize-repository-factories

## Motivation

Repository factories in `@specd/core` still hardcode builtin filesystem dispatch at the public factory boundary. That keeps repository composition behind the rest of the composition model and leaves no clean path for future repository adapter plugins.

This is worth addressing now because `specd.yaml` already models named storage adapters, and the current repository factory surface is the remaining place where extensibility is not carried through coherently.

## Current behaviour

### Hardcoded `'fs'` dispatch in createX

`createChangeRepository`, `createSpecRepository`, `createArchiveRepository`, and `createSchemaRepository` each carry a `switch(type)` that only handles `case 'fs':`. The adapter id `'fs'` is hardcoded in the implementation body, not just the call signature. Adding a new adapter means adding a new `case` branch to every factory — the opposite of open/closed.

```typescript
// Current — every factory has this pattern
function createChangeRepository(type: 'fs', config, options): ChangeRepository {
  switch (type) {              // hardcoded dispatch
    case 'fs':
      return new FsChangeRepository({ ... })
  }
}
```

Meanwhile, the composition resolver and storage factories (`*StorageFactory`) already implement a registry-backed dispatch model. The standalone public factories are the only path that still use switch dispatch instead of reusing the registry.

### Config shape mismatches what repositories expect

`SpecdAdapterBinding.config` is `Record<string, unknown>` — completely opaque. The storage factory (returned by `createFsChangeStorageFactory()`) extracts values manually with helper functions like `readStringOption(options, 'path')`. There is no type-level contract linking what YAML declares to what the repository constructor expects.

A concrete example of the nested-object problem:

```typescript
// composition-resolver.ts — resolver assembles options for change factory
changeRepository = factory.create(defaultContext, {
  ...config.storage.changesAdapter.config,      // { path: '/abs/changes' }
  drafts: config.storage.draftsAdapter.config,  // { path: '/abs/drafts' }
  discarded: config.storage.discardedAdapter.config, // { path: '/abs/discarded' }
  resolveArtifactTypes: async () => { ... },
})

// composition-registries.ts — change storage factory extracts nested
const drafts = readRecordOption(options, 'drafts')
const discarded = readRecordOption(options, 'discarded')
return createChangeRepository('fs', context, {
  changesPath: readStringOption(options, 'path'),
  draftsPath: readStringOption(drafts, 'path'),          // nested extract
  discardedPath: readStringOption(discarded, 'path'),    // nested extract
})
```

The drafts and discarded configs belong to separate storage bindings (`storage.drafts` and `storage.discarded`) but are stuffed into the change factory options as nested objects by the resolver. Neither the resolver nor the factory validates shape — if `path` is missing in YAML, the error is a runtime `TypeError`.

### Workspace options mixed with adapter options

For spec repositories, the resolver passes `workspace.prefix` (a workspace-level concept) mixed into the same options payload as `workspace.specsAdapter.config.path` (an adapter-level concept):

```typescript
factory.create(context, {
  ...workspace.specsAdapter.config, // { path: specsRoot }
  metadataPath, // computed by resolver
  ...(workspace.prefix !== undefined ? { prefix } : {}), // workspace-level!
})
```

The prefix has nothing to do with the filesystem adapter — it is a logical workspace property that happens to be needed by the spec repository. It should not travel through adapter options.

### SpecdStorageConfig keeps staging paths derived in memory

`SpecdStorageConfig` carries both direct staging paths (`changesPath`, `draftsPath`, `discardedPath`, `archivePath`) and their corresponding adapter bindings. Staging paths are derived at load-time from the adapter bindings (if the adapter is `fs`, by reading its config path option; otherwise, by falling back to defaults under `specdPath`). This keeps the consumer code simple and avoids polluting adapter-specific configs with staging keys.

### metadataPath computed in two places with duplicated fs logic

`metadataPath` does not exist in `specd.yaml`. It is computed at runtime in **two separate locations** with identical hardcoded `'fs'` branching:

```typescript
// Location 1: composition-resolver.ts:247 — resolveMetadataPathForWorkspace()
if (workspace.specsAdapter.adapter !== 'fs') {
  return path.join(config.projectRoot, '.specd', 'metadata')
}
// ... walk up from specsPath looking for .git

// Location 2: kernel-internals.ts:161 — inline
if (ws.specsAdapter.adapter === 'fs') {
  // find vcs root via VcsAdapter
} else {
  metadataPath = path.join(config.projectRoot, '.specd', 'metadata')
}
```

Both inject the computed path into factory options the same way:

```typescript
{ ...ws.specsAdapter.config, metadataPath, ...(ws.prefix ? { prefix } : {}) }
```

### No input validation in repositories

The `Fs*Repository` constructors receive pre-extracted typed options (e.g. `FsChangeRepositoryOptions.changesPath`). Validation happens downstream by TypeScript at compile time, but there is no runtime guard. When an adapter plugin provides malformed config, there is no structured validation error — only a `TypeError` from `readStringOption` or a cryptic construction failure.

## Proposed solution

### Storage factory dispatch without switch — registry-backed composition

The public `createX` signature keeps two call shapes:

```typescript
// 1. Direct — adapter-id form, no SpecdConfig needed, no switch
function createChangeRepository(
  type: string,
  config: ChangeRepositoryConfig,
  options: Record<string, unknown>,
  extra?: { changeStorageFactories?: Record<string, ChangeStorageFactory> },
): ChangeRepository

// 2. Config-based — uses resolver, accepts overrides
function createChangeRepository(
  config: SpecdConfig,
  options?: WorkspaceRepositoryFactoryOptions,
): ChangeRepository
```

The direct form imports the built-in registry statically (composition → composition, no cycle) and merges any runtime-provided factories from an optional `extra` parameter:

```typescript
// Proposed — no switch, delegates through registry
function createChangeRepository(
  type: string,
  config: ChangeRepositoryConfig,
  options: Record<string, unknown>,
  extra?: { changeStorageFactories?: Record<string, ChangeStorageFactory> },
): ChangeRepository {
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'changeStorageFactories',
    builtin.changeStorageFactories,
    extra?.changeStorageFactories,
  )
  const factory = merged.get(type)
  if (factory === undefined) throw new UnknownAdapterError(type, 'change')
  return factory.create(config, options)
}
```

This makes `'fs'` one adapter among equals. No switch, no hardcoded case — every adapter resolves through the registry. The optional `extra` lets callers provide custom factories in the direct path without needing `SpecdConfig`.

Crucially, the direct form keeps `context` and `options` as separate concerns — no mixing:

```typescript
createSpecRepository(
  'fs',
  { workspace: 'billing', ownership: 'shared', configPath: '...', prefix: 'billing-' }, // RepositoryConfig — workspace-level
  { path: '/specs/billing', metadataPath: '/metadata/billing' }, // adapter options
)
```

`SpecRepositoryConfig` (derived from `RepositoryConfig` for spec repositories only) is extended with `prefix?` to keep it spec-specific and avoid polluting the shared base repository context:

```typescript
interface RepositoryConfig {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly specdPath: string
  readonly configPath: string
}

interface SpecRepositoryConfig extends RepositoryConfig {
  readonly prefix?: string // ← workspace-level spec-id prefix
}
```

The storage factory is created by a constructor function defined in the concrete repository file (`infrastructure/fs/spec-repository.ts`), completely decoupling the composition layer from concrete construction:

```typescript
export function createFsSpecStorageFactory(): SpecStorageFactory {
  return {
    create(context, options): SpecRepository {
      return new FsSpecRepository({ ...context, ...FsSpecOptionsSchema.parse(options) })
    },
  }
}
```

The config-based path delegates to the resolver, which already has the merged registry (built-in + `CompositionResolutionOptions.changeStorageFactories`):

```typescript
function createChangeRepository(
  config: SpecdConfig,
  options?: WorkspaceRepositoryFactoryOptions,
): ChangeRepository {
  const resolver = createCompositionResolver(config, options)
  return resolver.getChangeRepository()
}
```

### CompositionResolutionOptions carries repository-instance overrides

New fields on `CompositionResolutionOptions` let integrators skip factory dispatch entirely:

```typescript
interface CompositionResolutionOptions {
  readonly changeRepository?: ChangeRepository
  readonly archiveRepository?: ArchiveRepository
  readonly specRepositories?:
    | Readonly<Record<string, SpecRepository>>
    | ReadonlyMap<string, SpecRepository>
  readonly schemaRepositories?:
    | Readonly<Record<string, SchemaRepository>>
    | ReadonlyMap<string, SchemaRepository>
}
```

When the resolver detects a pre-built instance for the requested capability, it returns it directly without calling any factory. This covers the advanced integrator case: "provide your own repository, skip the entire factory chain."

### WorkspaceRepositoryFactoryOptions — one options type for workspace-scoped factories

```typescript
export interface WorkspaceRepositoryFactoryOptions extends CompositionResolutionOptions {
  readonly workspace?: string
}
```

Used by `createSpecRepository(config, options?)` and `createSchemaRepository(config, options?)` to select which workspace to bind to. When omitted, defaults to the `default` workspace. The `workspace` field keeps the workspace selector at the call surface, not buried in adapter config.

### Options renamed to match YAML paths

Repository option interfaces align with what `specd.yaml` produces:

| Current         | Proposed        | YAML source                                     |
| --------------- | --------------- | ----------------------------------------------- |
| `changesPath`   | `path`          | `storage.changes.adapter.config.path`           |
| `draftsPath`    | `draftsPath`    | `storage.drafts.adapter.config.path`            |
| `discardedPath` | `discardedPath` | `storage.discarded.adapter.config.path`         |
| `archivePath`   | `path`          | `storage.archive.adapter.config.path`           |
| `specsPath`     | `path`          | `workspaces.<name>.specs.adapter.config.path`   |
| `schemasPath`   | `path`          | `workspaces.<name>.schemas.adapter.config.path` |

Since active changes, drafts, and discarded changes are separate storage bindings in `specd.yaml` but are logically managed by the single `ChangeRepository` port, the resolver extracts the configurations of drafts and discarded as external path dependencies, passing them within the `context` parameter to the changes storage factory. The factory then passes this context and changes config to the `FsChangeRepository` constructor.

### Clean separation of workspace context and adapter config

To prevent properties from being mixed inappropriately, concrete repository constructors accept exactly two distinct parameters:

1. **`context`**: The workspace/project-level context containing properties defined in the port's specific configuration interface (e.g., `ChangeRepositoryConfig` or `ArchiveRepositoryConfig`), which extends `RepositoryConfig`. This object contains both workspace metadata and runtime callbacks/paths required by the port contract.
2. **`config`**: The repository/adapter-specific configuration options that originate from `specd.yaml` for this specific repository.

```typescript
export interface ChangeRepositoryConfig extends RepositoryConfig {
  readonly draftsPath: string
  readonly discardedPath: string
  readonly activeSchema?: { name: string; version: number }
  readonly resolveArtifactTypes?: () => Promise<readonly ArtifactType[]>
  readonly resolveSpecExists?: (specId: string) => Promise<boolean>
}

export interface ArchiveRepositoryConfig extends RepositoryConfig {
  readonly changesPath: string
  readonly draftsPath: string
}
```

### Zod validation in Fs\*Repository constructors

The Zod schema lives in the `Fs*Repository` file and validates **only** the adapter configuration options that originate from `specd.yaml` for that adapter. This ensures that `specd.yaml` configuration is validated strictly, while runtime dependencies and external path properties remain strongly typed inside the `context` parameter but outside the Zod schema.

```typescript
// Zod schema only validates YAML-sourced config options for changes
const FsChangeOptionsSchema = z.object({
  path: z.string(),
})

export interface FsChangeRepositoryConfig extends z.infer<typeof FsChangeOptionsSchema> {}

export class FsChangeRepository extends ChangeRepository {
  constructor(context: ChangeRepositoryConfig, config: FsChangeRepositoryConfig) {
    super(context)
    const opts = FsChangeOptionsSchema.parse(config)

    // Strict directory existence validation at construction
    if (!fs.existsSync(opts.path)) {
      throw new StorageDirectoryNotFoundError(opts.path, 'Changes directory does not exist')
    }
    if (!fs.existsSync(context.draftsPath)) {
      throw new StorageDirectoryNotFoundError(context.draftsPath, 'Drafts directory does not exist')
    }
    if (!fs.existsSync(context.discardedPath)) {
      throw new StorageDirectoryNotFoundError(
        context.discardedPath,
        'Discarded directory does not exist',
      )
    }

    this._changesPath = opts.path
    this._draftsPath = context.draftsPath
    this._discardedPath = context.discardedPath
    this._activeSchema = context.activeSchema
    this._resolveArtifactTypes = context.resolveArtifactTypes
    this._resolveSpecExists = context.resolveSpecExists
    // ...
  }
}
```

The storage factory delegates parameter passing:

```typescript
export function createFsChangeStorageFactory(): ChangeStorageFactory {
  return {
    create(context, config): ChangeRepository {
      return new FsChangeRepository(context, config as FsChangeRepositoryConfig)
    },
  }
}
```

This eliminates `readStringOption`/`readRecordOption` helpers entirely. Each repository's adapter owns its own shape contract via Zod, and every instantiation path (factory, direct constructor call, test) is validated identically.

### Workspace-level options stay in SpecRepositoryConfig

`workspace.prefix` is part of `SpecRepositoryConfig`, not adapter options or base `RepositoryConfig`. Both the direct form and the resolver pass it in the context parameter of the spec repository factory:

```typescript
// Resolver — getSpecRepositories()
factory.create(
  {
    workspace: ws.name,
    ownership: ws.ownership,
    isExternal: ws.isExternal,
    configPath: config.configPath,
    ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
  },
  { ...ws.specsAdapter.config }, // only adapter config, no extras
)
```

````

### Adapter binding shape: `{ type, config }` nested under `adapter`

The current `specd.yaml` shape uses the adapter name as both the discriminator and the config key:

```yaml
# Current — adapter name is the config key (repetitive, magic key collision)
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
````

This is replaced by an explicit `adapter` object with `type` (discriminator) and `config` (adapter-owned opaque data):

```yaml
# Proposed — adapter object with type + config
workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs/
          metadataPath: .specd/metadata # optional, with default

storage:
  changes:
    adapter:
      type: fs
      config:
        path: specd/changes
```

**`config` is nested under `adapter`** — no ambiguity about whether `config` belongs to the spec, the workspace, or the adapter. `type` selects the factory; `config` is opaque and passes directly to the storage factory which validates it with Zod.

This eliminates:

- `raw.fs` lookup in `resolveAdapterBinding()` — reads `raw.config ?? {}` instead
- `raw[adapter]` lookup for non-fs adapters — reads `raw.config ?? {}` instead
- The implicit switch between `raw.fs` and `raw[adapter]`

### Adapter binding shape — source impact

The `{ adapter: fs, fs: { path } }` → `adapter: { type: fs, config: { path } }` change affects:

**Source (8 locations across 2 files):**

| File               | Line             | Change                                                                                                           |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `specd-config.ts`  | 105-110          | `SpecdAdapterBinding.adapter` → `SpecdAdapterBinding.type`                                                       |
| `config-loader.ts` | 40               | `AdapterBindingRawZodSchema`: `{ adapter: z.string() }` → `{ type: z.string(), config?: z.record(z.unknown()) }` |
| `config-loader.ts` | 896-938          | `resolveAdapterBinding()`: remove `raw.fs` and `raw[adapter]`, read `raw.config` directly                        |
| `config-loader.ts` | 1131             | inline `{ adapter: 'fs', config }` → `{ type: 'fs', config }`                                                    |
| `config-loader.ts` | 1147             | `.adapter === 'fs'` → `.type === 'fs'`                                                                           |
| `config-loader.ts` | 1225             | `.adapter !== 'fs'` → `.type !== 'fs'`                                                                           |
| `config-writer.ts` | 48               | `({ adapter: 'fs', fs: { path: p } })` → `({ type: 'fs', config: { path: p } })`                                 |
| `config-writer.ts` | init YAML output | all write sites use the new shape                                                                                |

**Tests:** ~80+ occurrences of `{ adapter: 'fs', config: { path } }` across ~20 files — rename `adapter` → `type`.

**Simplified parsing in `resolveAdapterBinding()`:**

```typescript
// Before: switch(adapter) + raw.fs + raw[adapter]
const adapter = raw.adapter
if (adapter === 'fs') {
  const fsBlock = raw.fs // magic key
  // ...
}
const adapterBlock = raw[adapter] // dynamic magic key

// After: direct, no magic keys
const type = raw.type
const config = isRecord(raw.config) ? raw.config : {}
return { binding: { type, config }, legacyPath: config.path ?? fallbackLegacyPath }
```

### metadataPath added to fs adapter config

`metadataPath` becomes an explicit option of the `fs` storage adapter in `specd.yaml` (inside `adapter.config`):

```yaml
workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs/
          metadataPath: .specd/metadata # optional, with default
```

The `FsSpecRepository` Zod schema applies a sensible default if omitted. The resolver no longer computes `metadataPath` — it passes `workspace.specsAdapter.config` as-is. Both `resolveMetadataPathForWorkspace()` and the duplicated block in `kernel-internals.ts` are removed.

`resolveAdapterBinding()` in `config-loader.ts` will resolve `metadataPath` to an absolute path relative to the config directory if it is provided and is a relative path (following the same resolution behavior as `path`). This ensures the concrete repository constructor always receives an absolute path.

### specdPath replaces configPath in specd.yaml & Optional storage block

`configPath` is removed from `specd.yaml`. It is replaced by `specdPath` (optional, defaults to `.specd`), representing the absolute path to the specd workspace folder.
In memory, `SpecdConfig` is extended with:

- `specdPath: string` (absolute path to data directory, e.g. `<projectRoot>/.specd`)
- `configPath: string` (absolute path to config directory, e.g. `<specdPath>/config`)

The `storage` section in `specd.yaml` becomes completely optional.
If `storage` or any of its individual repository bindings is omitted, the `ConfigLoader` automatically resolves them to their default `fs` adapter bindings:

- `storage.changes` -> type `fs` with path `<specdPath>/changes`
- `storage.drafts` -> type `fs` with path `<specdPath>/drafts`
- `storage.discarded` -> type `fs` with path `<specdPath>/discarded`
- `storage.archive` -> type `fs` with path `<specdPath>/archive`

### SpecdStorageConfig derives staging paths in memory

Keep `changesPath`, `draftsPath`, `discardedPath`, and `archivePath` in `SpecdStorageConfig` as absolute local staging paths. In `specd.yaml`, the user only configures `specdPath` and adapter bindings (no direct paths are exposed in the file). During load time, `FsConfigLoader` derives these fields dynamically:

- If `adapter.type === 'fs'`, resolve its path using `adapter.config.path`.
- Otherwise (for external adapters like `db`), fallback to the standard staging path `<specdPath>/<storage-type>` (e.g., `<specdPath>/changes`).

This ensures that the core always has local filesystem staging directories, prevents adapter option conflicts, and maintains full backward compatibility for all consumer code.

Furthermore, `FsConfigLoader.load()` will perform a central existence check (`fs.existsSync`) on all absolute directory paths resolved in `SpecdConfig` (including `specdPath`, all staging paths, and workspace paths: `specsPath`, `schemasPath`, `codeRoot`), throwing a `StorageDirectoryNotFoundError` early at boot time if any directory is missing.

### Legacy configuration warnings

To encourage migration to the new generalized configuration format while keeping full backward compatibility, the `ConfigLoader` MUST collect a warning whenever a legacy configuration block (e.g. `adapter: fs` with a co-located `fs: { path: ... }` block) is resolved.

The warnings MUST:

- Be returned inside `SpecdConfig` as an optional array: `readonly warnings?: readonly string[]`
- Describe the exact path where the legacy configuration was found, for example: `"Legacy configuration format detected at 'workspaces.default.specs'. Please migrate to 'adapter: { type: \"fs\", config: ... }' (the legacy format will be removed in future versions)."`
- Be checked and printed by delivery hosts (e.g. CLI bootstrap helper `resolveCliContext` and CLI loader `loadConfig`) to standard error (`console.warn`) so they are visible to users.

## Specs affected

### New specs

- `core:fs-change-repository`: Full spec for `FsChangeRepository` — Zod schema for constructor options (`path`, `drafts.path`, `discarded.path`, workspace context fields), all public methods inherited/overridden from `ChangeRepository` port, behavior (change directory naming, listing order, artifact status derivation, drift detection, change locking, internal paths).
  - Depends on (added): `core:change-repository-port`, `core:storage`
  - Depends on (removed): none
- `core:fs-spec-repository`: Full spec for `FsSpecRepository` — Zod schema for constructor options (`path`, `metadataPath` with default, `prefix` via `RepositoryConfig`), specs path resolution, spec listing and search behavior, metadata persistence.
  - Depends on (added): `core:spec-repository-port`
  - Depends on (removed): none
- `core:fs-archive-repository`: Full spec for `FsArchiveRepository` — Zod schema for constructor options (`path`, `changes.path`, `drafts.path`, `pattern`), archive index (`index.jsonl`), archive/restore behavior, runtime gitignore hygiene, path confinement.
  - Depends on (added): `core:archive-repository-port`, `core:storage`
  - Depends on (removed): none
- `core:fs-schema-repository`: Full spec for `FsSchemaRepository` — Zod schema for constructor options (`path`), schema file discovery and loading behavior.
  - Depends on (added): `core:schema-repository-port`
  - Depends on (removed): none

### Modified specs

- `core:composition`: Update repository composition requirements so public repository factories resolve adapter ids through composition registries instead of switch dispatch, accept `Record<string, unknown>` options with Zod validation owned by each repository, and support the renamed option contract (`path` instead of `*Path`).
  - Depends on (added): `core:config`
  - Depends on (removed): none
- `core:composition-resolver`: Update resolver wiring to assemble the nested options object for drafts and discarded configurations from their separate YAML configs, forwarding the unified options object to the storage factory, and remove the helper functions like `readStringOption`/`readRecordOption` from the registries.
  - Depends on (added): `core:config`
  - Depends on (removed): none
- `core:kernel`: Extend the kernel contract so `KernelOptions` and `createKernel(config, options?)` explicitly accept additive repository overrides and reuse matching injected repository instances instead of reconstructing them.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel-builder`: Keep builder semantics aligned with the expanded `KernelOptions` surface if repository overrides become part of the additive public composition contract.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: Keep `changesPath`, `draftsPath`, `discardedPath`, and `archivePath` in `SpecdStorageConfig` in memory, but make them derived fields from `specdPath` and adapter bindings. Add `metadataPath` as optional field in the `fs` spec storage adapter config.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:composition`: Keep the curated SDK re-export surface aligned with whatever repository factory and composition-option contracts remain public in `@specd/core`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-writer-port`: Update YAML output format from `{ adapter: fs, fs: { path } }` to `adapter: { type: fs, config: { path } }` in `initProject()` and all plugin mutation methods. The `ConfigWriter` port interface itself is unchanged.
  - Depends on (added): `core:config`
  - Depends on (removed): none
- `cli:config-show`: Update `config show` handler to display adapter bindings generically instead of reading removed legacy `config.storage.changesPath` fields. Must not assume any adapter-specific config key — prints the raw binding shape (`type` + `config` keys) so it works with any adapter.
  - Depends on (added): `core:config`
  - Depends on (removed): none

## Impact

- `@specd/core`:
  - `packages/core/src/composition/change-repository.ts` — remove switch, delegate to registry
  - `packages/core/src/composition/spec-repository.ts` — same
  - `packages/core/src/composition/archive-repository.ts` — same
  - `packages/core/src/composition/schema-repository.ts` — same
  - `packages/core/src/composition/composition-registries.ts` — remove `readStringOption`/`readRecordOption` helpers, registers default storage factories by calling `createFs*StorageFactory()` imported from infrastructure
  - `packages/core/src/composition/composition-resolver.ts` — adapt options assembly to pass drafts and discarded configurations nested under the changes factory call
  - `packages/core/src/composition/shared-repository-wiring.ts` — adapt to new resolver surface
  - `packages/core/src/composition/repository-factory-options.ts` — new file, `WorkspaceRepositoryFactoryOptions`
  - `packages/core/src/composition/change-storage-factory.ts` — type unchanged
  - `packages/core/src/composition/spec-storage-factory.ts` — type unchanged
  - `packages/core/src/composition/archive-storage-factory.ts` — type unchanged
  - `packages/core/src/composition/schema-storage-factory.ts` — type unchanged
  - `packages/core/src/infrastructure/fs/change-repository.ts` — add Zod validation, rename options, export `createFsChangeStorageFactory()`
  - `packages/core/src/infrastructure/fs/spec-repository.ts` — same, export `createFsSpecStorageFactory()`
  - `packages/core/src/infrastructure/fs/archive-repository.ts` — same, export `createFsArchiveStorageFactory()`
  - `packages/core/src/infrastructure/fs/schema-repository.ts` — same, export `createFsSchemaStorageFactory()`
  - `packages/core/src/application/specd-config.ts` — keep path fields in `SpecdStorageConfig` and update `isSpecdConfig` shape guard to validate them as strings (since they are resolved and populated at load time).
  - `packages/core/src/composition/kernel-internals.ts` — remove duplicated metadataPath block, use resolver
  - `packages/core/src/composition/kernel.ts` — adapt to new resolver
  - `packages/core/src/composition/kernel-builder.ts` — adapt to new resolver
- `@specd/sdk`:
  - `packages/sdk/src/core-reexports.ts` — verify type alignments
- `@specd/cli`:
  - `packages/cli/src/commands/config/show.ts:23-26` — replace `config.storage.changesPath` with generic adapter binding display (no `path` assumption)
  - `packages/core/src/infrastructure/fs/config-writer.ts` — YAML output shape changed
- Tests:
  - All repository factory tests updated for new option names
  - Fs\*Repository Zod validation tests added
  - Config validation tests for removed legacy fields
  - Composition resolver tests reflect simplified wiring

The graph impact for the current repository factory files is `CRITICAL`, so this is a cross-cutting composition refactor rather than an isolated factory cleanup.

## Documentation

### Files that reference the old `{ adapter: fs, fs: { path } }` YAML shape

Every documentation file with YAML config examples MUST be updated to the new `adapter: { type: fs, config: { path } }` form:

**Markdown docs:**

| File                                                   | Scope                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `README.md`                                            | Workspace/storage config example (~15 lines)                                                         |
| `packages/specd/README.md`                             | Same example (copy)                                                                                  |
| `docs/config/config-reference.md`                      | Full config reference — `specs.adapter`, `specs.fs`, `schemas.fs`, storage adapter spec, error table |
| `docs/guide/configuration.md`                          | Multiple examples, validation error "`adapter: fs` declared but `fs.path` missing"                   |
| `docs/config/examples/single-repo-minimal.md`          | Example YAML                                                                                         |
| `docs/config/examples/single-repo-local-schema.md`     | Example YAML + note about defaults                                                                   |
| `docs/config/examples/multi-repo-coordinator.md`       | Multi-repo example YAML                                                                              |
| `docs/config/examples/approvals-and-workflow-hooks.md` | Example YAML                                                                                         |

**Spec files (modified, via deltas):**

| File                          | Scope                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- |
| `specs/core/config/spec.md`   | All examples and inline descriptions use old shape                      |
| `specs/core/config/verify.md` | WHEN/THEN scenarios referencing `specs.adapter: fs` and `specs.fs.path` |

**Spec files (new):**

| File                                         | Scope                                                               |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `specs/core/fs-change-repository/spec.md`    | Full spec for `FsChangeRepository` — Zod schema, methods, behavior  |
| `specs/core/fs-change-repository/verify.md`  | Scenarios for change CRUD, drift, locking                           |
| `specs/core/fs-spec-repository/spec.md`      | Full spec for `FsSpecRepository` — Zod schema, methods, behavior    |
| `specs/core/fs-spec-repository/verify.md`    | Scenarios for spec CRUD, search, metadata                           |
| `specs/core/fs-archive-repository/spec.md`   | Full spec for `FsArchiveRepository` — Zod schema, methods, behavior |
| `specs/core/fs-archive-repository/verify.md` | Scenarios for archive/restore, index, gitignore                     |
| `specs/core/fs-schema-repository/spec.md`    | Full spec for `FsSchemaRepository` — Zod schema, methods, behavior  |
| `specs/core/fs-schema-repository/verify.md`  | Scenarios for schema discovery                                      |

### API documentation for refactored factory signatures

The factory API surface changes:

- `createChangeRepository(type, config, options, extra?)` — registry dispatch instead of switch
- `createSpecRepository(type, config, options, extra?)` — same
- `createArchiveRepository(type, config, options, extra?)` — same
- `createSchemaRepository(type, config, options, extra?)` — same
- New `CompositionResolutionOptions` with repository-instance overrides
- New `WorkspaceRepositoryFactoryOptions` with workspace selector
- Config-based overloads: `createX(config, options?)` — now delegate through resolver
- Optional `extra` parameter for runtime factory injection

**Existing docs that need updating:**

| File                                          | What to update                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/core/overview.md`                       | Factory descriptions (lines 247-248), repository factory table, add reference to new `repository-factories.md` |
| `docs/adr/0015-use-case-level-composition.md` | May need architecture alignment if factory dispatch model changed                                              |
| `docs/core/examples/implementing-a-port.md`   | Constructor pattern example may need `prefix` in `RepositoryConfig`                                            |

**New file: `docs/core/examples/repository-factories.md`.** This file documents the
refactored factory API surface with runnable-style examples:

| Topic                            | Example                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Direct form                      | `createChangeRepository('fs', context, { path, drafts, discarded })` — dispatch through registry, no switch |
| Config-based form                | `createSpecRepository(config, { workspace: 'billing' })` — delegates to resolver                            |
| Adapter options with Zod         | Showing that `Record<string, unknown>` options are validated at construct time                              |
| Registry injection               | `createChangeRepository('custom', ctx, opts, { changeStorageFactories: { custom: myFactory } })`            |
| Pre-built overrides              | `createSpecRepository(config, { specRepositories: { billing: myRepo } })` — skips factory entirely          |
| `prefix` via `RepositoryConfig`  | Showing workspace-level prefix passed through context, not adapter options                                  |
| `metadataPath` in adapter config | Showing explicit optional field with fallback default                                                       |

This file lives at `docs/core/examples/repository-factories.md` and is referenced from
`docs/core/overview.md`.

### JSDoc comments that reference old signatures

The following JSDoc comments in composition files reference the hardcoded `'fs'` adapter id
in the factory call pattern `createX('fs', ...)` and MUST be updated:

| File                                                   | Line | Current text                                                                              |
| ------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------- |
| `packages/core/src/composition/spec-repository.ts`     | 16   | `/** Filesystem adapter options for \`createSpecRepository('fs', ...)\`. \*/`             |
| `packages/core/src/composition/change-repository.ts`   | 17   | `/** Filesystem adapter options for \`createChangeRepository('fs', ...)\`. \*/`           |
| `packages/core/src/composition/archive-repository.ts`  | 16   | `/** Filesystem adapter options for \`createArchiveRepository('fs', ...)\`. \*/`          |
| `packages/core/src/composition/schema-repository.ts`   | 16   | `/** Filesystem adapter options for \`createSchemaRepository('fs', ...)\`. \*/`           |
| `packages/core/src/composition/schema-registry.ts`     | 6    | `/** Filesystem adapter options for \`createSchemaRegistry('fs', ...)\`. \*/`             |
| `packages/core/src/infrastructure/fs/config-loader.ts` | 891  | `@param fallbackLegacyPath - Compatibility-only path used when the adapter is not \`fs\`` |

These become generic descriptions since the factories accept any registered adapter type.

### Live `specd.yaml` (project config)

The project's own `specd.yaml` at repo root uses the old format in all 19 workspace and storage
entries. It MUST be updated to the new `adapter: { type: fs, config: { path } }` shape as part
of this change. The change overlaps with active development — this config is loaded every time
specd runs — so the config loader must support both shapes during a transition window, or the
`specd.yaml` update must be the first change applied.

## Technical context

- `specd.yaml` already models named storage adapters and adapter-owned configuration for workspace storage, so configuration semantics for extensible repository selection already exist in `core:config`.
- `core:composition` already requires repository factories on the public root and future extensible adapter ids through `*StorageFactory` registration.
- The current gap is not the public concept, but the implementation boundary: repository factories still special-case filesystem creation instead of flowing through registry-backed composition.
- The goal of this change is to use the necessary repository-factory refactor to improve the long-term extensibility of `@specd/core` without committing yet to the final contract for repository plugin packages.
- Direct repository instance injection was discussed as an advanced integrator capability for implementers using `@specd/core` outside the default kernel-driven path, not as the primary path for normal host composition.
- Option names (`path`, `drafts.path`, `discarded.path`) mirror the YAML nesting structure exactly. This means the storage factory for `'fs'` receives the same nested shape as what `specd.yaml` produces — the resolver handles the grouping of separate storage bindings into this nested structure.
- `prefix` is a workspace-level concept and will be handled by the resolver or spec-repository-specific wiring, not passed through adapter config.
- The four `readStringOption`/`readRecordOption` helpers in `composition-registries.ts` will be deleted. Each `Fs*Repository` validates its own config via Zod.
- The path fields in `SpecdStorageConfig` are retained as derived memory fields to avoid breaking consumers and to provide a consistent local staging directory contract.
- The resolver currently assembles nested `drafts`/`discarded` objects for the change factory and `changes`/`drafts` objects for the archive factory. With the new approach, the resolver continues to perform this assembly, ensuring the storage factories receive the expected nested configuration from the separate YAML config blocks.
- `metadataPath` is currently computed in two places with identical `if adapter === 'fs'` branching: `resolveMetadataPathForWorkspace()` in `composition-resolver.ts` and an inline block in `kernel-internals.ts`. Both are removed when `metadataPath` becomes an explicit config option.

## Open questions

- The exact external plugin authoring contract for repository adapters is intentionally deferred. This proposal only prepares the public composition boundary so future adapter plugins can be introduced without reopening hardcoded filesystem assumptions.

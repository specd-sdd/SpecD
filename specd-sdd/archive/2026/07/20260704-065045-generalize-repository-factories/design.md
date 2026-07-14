# Design: Generalize Repository Factories

## Purpose and Scope

This document serves as the formal technical contract for the implementation of the `generalize-repository-factories` change. The goal is to eliminate hardcoded switch statements in public repository factories (`createChangeRepository`, `createSpecRepository`, etc.) and route instantiation dynamically through a registry-backed composition layer.

Additionally, this change:

1. Breaks a static import cycle between `composition-registries.ts` and public factories by defining storage factories in their respective infrastructure files.
2. Formally validates repository configuration options via Zod schemas inside the concrete repository constructors, keeping them completely separate from workspace-level context properties and runtime dependencies.
3. Decouples option namespaces so adapter-specific configuration (like `metadataPath` or directory paths) is separated from shared workspace metadata (`prefix`, `ownership`, etc.).
4. Supports repository instance overrides within `KernelOptions` and `KernelBuilder`.

---

## 1. Interface & Zod Schema Specifications

Each repository adapter in `infrastructure/fs` will validate its options at construction time using a dedicated Zod schema.
All workspace context properties, external config paths, and core runtime dependencies/callbacks are grouped inside the port's specific context interface (which extends `RepositoryConfig`) and are passed separately as the `context` parameter. They are NOT validated by the Zod schema, ensuring `specd.yaml` configuration is validated strictly.

### 1.1 FsChangeRepository

#### Port Context and Options Types (`packages/core/src/infrastructure/fs/change-repository.ts`)

```typescript
import { z } from 'zod'
import { type RepositoryConfig } from '../../application/ports/repository.js'
import { type ArtifactType } from '../../domain/value-objects/artifact-type.js'

export interface ChangeRepositoryConfig extends RepositoryConfig {
  readonly draftsPath: string // External path resolved from drafts storage binding
  readonly discardedPath: string // External path resolved from discarded storage binding
  readonly activeSchema?: { name: string; version: number }
  readonly resolveArtifactTypes?: () => Promise<readonly ArtifactType[]>
  readonly resolveSpecExists?: (specId: string) => Promise<boolean>
}

export interface FsChangeRepositoryConfig {
  readonly path: string
}
```

#### Zod Validation Schema

```typescript
export const FsChangeOptionsSchema = z.object({
  path: z.string(),
})
```

---

### 1.2 FsSpecRepository

#### Port Context and Options Types (`packages/core/src/infrastructure/fs/spec-repository.ts`)

```typescript
import { z } from 'zod'
import { type RepositoryConfig } from '../../application/ports/repository.js'

export interface SpecRepositoryConfig extends RepositoryConfig {
  readonly prefix?: string // Logical spec-id prefix for the workspace, residing in context
}

export interface FsSpecRepositoryConfig {
  readonly path: string
  readonly metadataPath: string
}
```

#### Zod Validation Schema

```typescript
export const FsSpecOptionsSchema = z.object({
  path: z.string(),
  metadataPath: z.string(),
})
```

---

### 1.3 FsArchiveRepository

#### Port Context and Options Types (`packages/core/src/infrastructure/fs/archive-repository.ts`)

```typescript
import { z } from 'zod'
import { type RepositoryConfig } from '../../application/ports/repository.js'

export interface ArchiveRepositoryConfig extends RepositoryConfig {
  readonly changesPath: string
  readonly draftsPath: string
}

export interface FsArchiveRepositoryConfig {
  readonly path: string
  readonly pattern?: string
}
```

#### Zod Validation Schema

```typescript
export const FsArchiveOptionsSchema = z.object({
  path: z.string(),
  pattern: z.string().optional(),
})
```

---

### 1.4 FsSchemaRepository

#### Port Context and Options Types (`packages/core/src/infrastructure/fs/schema-repository.ts`)

```typescript
import { z } from 'zod'
import { type RepositoryConfig } from '../../application/ports/repository.js'

export interface FsSchemaRepositoryConfig {
  readonly path: string
}
```

#### Zod Validation Schema

```typescript
export const FsSchemaOptionsSchema = z.object({
  path: z.string(),
})
```

---

## 2. Infrastructure Storage Creator Functions and Constructors

Concrete constructors accept exactly two parameters: `context` and `config`. To satisfy strict filesystem sync architecture requirements, constructors verify that all physical directories exist on disk (via `fs.existsSync`), throwing a `StorageDirectoryNotFoundError` if any directory is missing.

### 2.1 FsChangeRepository Constructor & Factory

```typescript
export class FsChangeRepository extends ChangeRepository {
  private readonly _resolveArtifactTypes: (() => Promise<readonly ArtifactType[]>) | undefined
  private readonly _resolveSpecExists: ((specId: string) => Promise<boolean>) | undefined

  constructor(context: ChangeRepositoryConfig, config: FsChangeRepositoryConfig) {
    super(context)
    const parsed = FsChangeOptionsSchema.parse(config)

    // Verify paths exist on disk
    if (!fs.existsSync(parsed.path)) {
      throw new StorageDirectoryNotFoundError(parsed.path, 'Changes directory does not exist')
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

    this._changesPath = parsed.path
    this._draftsPath = context.draftsPath
    this._discardedPath = context.discardedPath
    this._locksPath = path.join(context.configPath, 'tmp', 'change-locks')
    this._activeSchema = context.activeSchema
    this._resolveArtifactTypes = context.resolveArtifactTypes
    this._resolveSpecExists = context.resolveSpecExists
    this._artifactTypes = []
    this._artifactTypesResolved = false
  }
}

export function createFsChangeStorageFactory(): ChangeStorageFactory {
  return {
    create(context: ChangeRepositoryConfig, config: Record<string, unknown>): ChangeRepository {
      return new FsChangeRepository(context, config as unknown as FsChangeRepositoryConfig)
    },
  }
}
```

### 2.2 FsSpecRepository Constructor & Factory

```typescript
export class FsSpecRepository extends SpecRepository {
  constructor(context: SpecRepositoryConfig, config: FsSpecRepositoryConfig) {
    super(context)
    const parsed = FsSpecOptionsSchema.parse(config)

    // Verify paths exist on disk
    if (!fs.existsSync(parsed.path)) {
      throw new StorageDirectoryNotFoundError(parsed.path, 'Specs directory does not exist')
    }
    if (!fs.existsSync(parsed.metadataPath)) {
      throw new StorageDirectoryNotFoundError(
        parsed.metadataPath,
        'Metadata directory does not exist',
      )
    }

    this._specsPath = parsed.path
    this._metadataPath = parsed.metadataPath
    this._prefixSegments =
      context.prefix !== undefined ? context.prefix.split('/').filter((s) => s.length > 0) : []
  }
}

export function createFsSpecStorageFactory(): SpecStorageFactory {
  return {
    create(context: SpecRepositoryConfig, config: Record<string, unknown>): SpecRepository {
      return new FsSpecRepository(context, config as unknown as FsSpecRepositoryConfig)
    },
  }
}
```

### 2.3 FsArchiveRepository Constructor & Factory

```typescript
export class FsArchiveRepository extends ArchiveRepository {
  constructor(context: ArchiveRepositoryConfig, config: FsArchiveRepositoryConfig) {
    super(context)
    const parsed = FsArchiveOptionsSchema.parse(config)

    // Verify paths exist on disk
    if (!fs.existsSync(parsed.path)) {
      throw new StorageDirectoryNotFoundError(parsed.path, 'Archive directory does not exist')
    }
    if (!fs.existsSync(context.changesPath)) {
      throw new StorageDirectoryNotFoundError(
        context.changesPath,
        'Changes directory does not exist',
      )
    }
    if (!fs.existsSync(context.draftsPath)) {
      throw new StorageDirectoryNotFoundError(context.draftsPath, 'Drafts directory does not exist')
    }

    this._archivePath = parsed.path
    this._changesPath = context.changesPath
    this._draftsPath = context.draftsPath
    this._pattern = parsed.pattern ?? DEFAULT_PATTERN
  }
}

export function createFsArchiveStorageFactory(): ArchiveStorageFactory {
  return {
    create(context: ArchiveRepositoryConfig, config: Record<string, unknown>): ArchiveRepository {
      return new FsArchiveRepository(context, config as unknown as FsArchiveRepositoryConfig)
    },
  }
}
```

### 2.4 FsSchemaRepository Constructor & Factory

```typescript
export class FsSchemaRepository extends SchemaRepository {
  constructor(context: RepositoryConfig, config: FsSchemaRepositoryConfig) {
    super(context)
    const parsed = FsSchemaOptionsSchema.parse(config)

    // Verify paths exist on disk
    if (!fs.existsSync(parsed.path)) {
      throw new StorageDirectoryNotFoundError(parsed.path, 'Schemas directory does not exist')
    }

    this._schemasPath = parsed.path
  }
}

export function createFsSchemaStorageFactory(): SchemaStorageFactory {
  return {
    create(context: RepositoryConfig, config: Record<string, unknown>): SchemaRepository {
      return new FsSchemaRepository(context, config as unknown as FsSchemaRepositoryConfig)
    },
  }
}
```

### 2.5 Fresh Project Initialisation and Directory Creation

To prevent immediate `StorageDirectoryNotFoundError` crashes when a newly initialised project is loaded (since workspace `specsPath` must physically exist on disk), `FsConfigWriter.initProject` MUST create the workspace specs directory on disk during project creation.

Specifically:

- It creates the specs directory (resolved from `options.specsPath` relative to the project root).
- It creates the required storage folders (`.specd/changes/`, `.specd/drafts/`, `.specd/discarded/`, `.specd/archive/`).

---

## 3. Config Loader Normalization (`packages/core/src/infrastructure/fs/config-loader.ts`)

### 3.1 specdPath and Optional Storage Normalization

In `SpecdYamlZodSchema`, `specdPath` is defined as an optional string. The `storage` block is also optional, and its individual members (`changes`, `drafts`, `discarded`, `archive`) are optional.

Inside `FsConfigLoader._buildConfig`:

```typescript
const specdPath = path.resolve(configDir, data.specdPath ?? '.specd')
const configPath = path.join(specdPath, 'config')

// Default storage config if omitted
const storageRaw = data.storage ?? {}
const changesRaw = storageRaw.changes ?? { adapter: 'fs', fs: { path: 'changes' } }
const draftsRaw = storageRaw.drafts ?? { adapter: 'fs', fs: { path: 'drafts' } }
const discardedRaw = storageRaw.discarded ?? { adapter: 'fs', fs: { path: 'discarded' } }
const archiveRaw = storageRaw.archive ?? { adapter: 'fs', fs: { path: 'archive' } }
```

During binding resolution via `resolveAdapterBinding()`, default filesystem paths resolve relative to `specdPath` instead of `configDir` when utilizing standard defaults.

Once the adapter bindings are resolved (`changesAdapter`, `draftsAdapter`, `discardedAdapter`, `archiveAdapter`), `FsConfigLoader` derives the top-level staging paths for `SpecdStorageConfig` in memory:

```typescript
const changesPath =
  changesAdapter.type === 'fs'
    ? (changesAdapter.config.path as string)
    : path.join(specdPath, 'changes')

const draftsPath =
  draftsAdapter.type === 'fs'
    ? (draftsAdapter.config.path as string)
    : path.join(specdPath, 'drafts')

const discardedPath =
  discardedAdapter.type === 'fs'
    ? (discardedAdapter.config.path as string)
    : path.join(specdPath, 'discarded')

const archivePath =
  archiveAdapter.type === 'fs'
    ? (archiveAdapter.config.path as string)
    : path.join(specdPath, 'archive')
```

This prevents key conflicts with non-filesystem adapters while ensuring that local staging directories are always cleanly defined.

### 3.2 Legacy & New Config Normalization

```typescript
// inside resolveAdapterBinding()
const raw = inputBinding // might be string (legacy) or object { type, config } (new)

let type: string
let config: Record<string, unknown> = {}

if (typeof raw === 'string') {
  type = raw
  // Read legacy sibling object of name `type` (e.g. if type is 'fs', config is rawObj.fs)
  const legacyConfig = rawParent[type]
  if (legacyConfig && typeof legacyConfig === 'object') {
    config = { ...legacyConfig }
  }
} else if (raw && typeof raw === 'object' && 'type' in raw) {
  type = String(raw.type)
  config = raw.config && typeof raw.config === 'object' ? { ...raw.config } : {}
} else {
  throw new ConfigValidationError('Invalid adapter binding structure')
}

// Normalize relative path in config
if (typeof config.path === 'string' && !path.isAbsolute(config.path)) {
  config = { ...config, path: path.resolve(configDir, config.path) }
}

// Normalize relative metadataPath (spec specific) to absolute
if (typeof config.metadataPath === 'string' && !path.isAbsolute(config.metadataPath)) {
  config = { ...config, metadataPath: path.resolve(configDir, config.metadataPath) }
}

return { type, config }
```

### 3.3 Physical Directory Existence Checks

To ensure early detection of missing or corrupted project state directories, `FsConfigLoader.load()` will perform synchronous existence checks (`fs.existsSync`) on all resolved absolute directory paths in the compiled `SpecdConfig` before returning it.

If any of the following directories do not exist on disk, the loader throws a `StorageDirectoryNotFoundError`:

- `specdPath` (the `.specd` data folder)
- `storage.changesPath` (the changes staging folder)
- `storage.draftsPath` (the drafts staging folder)
- `storage.discardedPath` (the discarded changes staging folder)
- `storage.archivePath` (the archive root staging folder)
- Each workspace's `specsPath` (the specs folder)
- Each workspace's `schemasPath` (the schemas folder, when not `null`)
- Each workspace's `codeRoot` (the codebase source folder)

This centralizes path existence checks at boot time, validating the workspace structure immediately during initialization.

---

## 4. Option Nesting in Composition Resolver (`packages/core/src/composition/composition-resolver.ts`)

The resolver acts as the composition orchestrator. It will read separate YAML settings and group them into the structure expected by `FsChangeRepository` and `FsArchiveRepository`.

### 4.1 Change Repository Resolution

```typescript
// inside CompositionResolver.getChangeRepository()
const activeBinding = this.config.storage.changesAdapter

const factory = resolveStorageFactory(
  this.config.configPath,
  'storage.changes',
  this.registry.storages.changes,
  activeBinding.type,
)

const context: ChangeRepositoryConfig = {
  workspace: 'default',
  ownership: 'owned',
  isExternal: false,
  specdPath: this.config.specdPath,
  configPath: this.config.configPath,
  draftsPath: this.config.storage.draftsPath,
  discardedPath: this.config.storage.discardedPath,
  activeSchema: this.config.activeSchema,
  resolveArtifactTypes: async () => this.resolveArtifactTypes(),
  resolveSpecExists: async (specId) => this.resolveSpecExists(specId),
}

const config = {
  path: this.config.storage.changesPath,
}

return factory.create(context, config)
```

### 4.2 Archive Repository Resolution

```typescript
// inside CompositionResolver.getArchiveRepository()
const archiveBinding = this.config.storage.archiveAdapter

const factory = resolveStorageFactory(
  this.config.configPath,
  'storage.archive',
  this.registry.storages.archive,
  archiveBinding.type,
)

const context: ArchiveRepositoryConfig = {
  workspace: 'default',
  ownership: 'owned',
  isExternal: false,
  specdPath: this.config.specdPath,
  configPath: this.config.configPath,
  changesPath: this.config.storage.changesPath,
  draftsPath: this.config.storage.draftsPath,
}

const config = {
  path: this.config.storage.archivePath,
  pattern: archiveBinding.config.pattern,
}

return factory.create(context, config)
```

---

## 5. Generalized Public Facade Factories

The public factories (`createChangeRepository`, `createSpecRepository`, `createArchiveRepository`, and `createSchemaRepository`) located in `packages/core/src/composition/` will be updated to drop hardcoded switch blocks and query the registry.

### 5.1 Signature & Overloads (`packages/core/src/composition/change-repository.ts`)

```typescript
export function createChangeRepository(
  config: SpecdConfig,
  options?: WorkspaceRepositoryFactoryOptions,
): ChangeRepository

export function createChangeRepository(
  type: string,
  context: ChangeRepositoryConfig,
  config: Record<string, unknown>,
  extra?: { changeStorageFactories?: Record<string, ChangeStorageFactory> },
): ChangeRepository

export function createChangeRepository(...args: any[]): ChangeRepository {
  if (
    args.length === 1 ||
    (args.length === 2 && typeof args[0] === 'object' && !('workspace' in args[0]))
  ) {
    // Config-based: delegates to CompositionResolver
    const [config, options] = args
    const resolver = new CompositionResolver(config, options)
    return resolver.getChangeRepository()
  }

  // Direct / Registry-based lookup
  const [type, context, config, extra] = args
  const builtin = createBuiltinCompositionRegistry()
  const merged = mergeNamedRegistry(
    'changeStorageFactories',
    builtin.storages.changes,
    extra?.changeStorageFactories,
  )

  const factory = merged.get(type)
  if (!factory) {
    throw new UnknownAdapterError(type, 'change')
  }

  return factory.create(context, config)
}
```

_Note: Equivalent patterns will be applied to `spec-repository.ts`, `archive-repository.ts`, and `schema-repository.ts`._

---

## 6. Repository Overrides in Kernel & Builder

### 6.1 Kernel Options Interface (`packages/core/src/composition/kernel.ts`)

```typescript
export interface KernelOptions {
  readonly extraNodeModulesPaths?: readonly string[]
  readonly repositories?: {
    readonly changes?: ChangeRepository
    readonly archive?: ArchiveRepository
    readonly specs?: ReadonlyMap<string, SpecRepository>
    readonly schemas?: ReadonlyMap<string, SchemaRepository>
  }
  readonly specStorageFactories?: Record<string, SpecStorageFactory>
  readonly schemaStorageFactories?: Record<string, SchemaStorageFactory>
  readonly changeStorageFactories?: Record<string, ChangeStorageFactory>
  readonly archiveStorageFactories?: Record<string, ArchiveStorageFactory>
  // ...other options
}
```

### 6.2 Resolver Integration

Modify `CompositionResolver` constructor to receive the override repository instances and return them immediately when requested, bypassing the factory resolution.

### 6.3 KernelBuilder API (`packages/core/src/composition/kernel-builder.ts`)

```typescript
export class KernelBuilder {
  private _repositories: KernelOptions['repositories'] = {}

  withRepositoryOverrides(repositories: NonNullable<KernelOptions['repositories']>): this {
    this._repositories = { ...this._repositories, ...repositories }
    return this
  }

  // Modify build() to merge this._repositories into the created KernelOptions
}
```

---

## 7. Testing Strategy

### 7.1 Automated Tests

1. **FsChangeRepository Validation:** Verify that instantiating `FsChangeRepository` with invalid options (like missing path) throws Zod validation errors, while passing callbacks in context does not trigger Zod failures.
2. **FsSpecRepository Path Resolution:** Verify that relative `metadataPath` strings are resolved relative to the config file path correctly during validation.
3. **Circular Dependency Check:** Assert that the build/compile runs without ESM circular import errors when requiring `@specd/core`.
4. **Mock Repository Override:** Instantiate a `Kernel` with mock repositories, and assert that the kernel's use cases use the mock instances instead of instantiating new ones.

## 8. Legacy Configuration Warning Design

### 8.1 SpecdConfig warning field

Extend `SpecdConfig` interface in `packages/core/src/application/specd-config.ts` to include:

```typescript
  /** Warnings generated during configuration loading (e.g. legacy adapter declarations). */
  readonly warnings?: readonly string[]
```

### 8.2 FsConfigLoader warnings collection

Modify `resolveAdapterBinding` in `packages/core/src/infrastructure/fs/config-loader.ts` to accept an optional `warnings: string[]` parameter.
If `raw.adapter` is resolved as a string (meaning the configuration is declared in the legacy format), push a warning:

```typescript
if (typeof adapterVal === 'string') {
  // ...
  const legacyConfig = raw[type]
  if (legacyConfig !== undefined) {
    // ...
    if (warnings !== undefined) {
      warnings.push(
        `Legacy configuration format detected at '${fieldPath}'. Please migrate to 'adapter: { type: "${type}", config: ... }' (the legacy format will be removed in future versions).`,
      )
    }
  }
}
```

In `_buildConfig`, initialize a `const warnings: string[] = []` array and pass it to all `resolveAdapterBinding` invocations:

- workspaces specs configuration
- workspaces schemas configuration
- storage changes, drafts, discarded, and archive configurations

Then, return the warnings inside the constructed `SpecdConfig` object:

```typescript
return {
  // ...other fields
  ...(warnings.length > 0 ? { warnings } : {}),
}
```

### 8.3 CLI Warning Logging

Modify the CLI bootstrap functions in `packages/cli/src/load-config.ts` and `packages/cli/src/helpers/cli-context.ts` to inspect `config.warnings` and log each entry to `console.warn`:

```typescript
if (config.warnings && config.warnings.length > 0) {
  for (const warning of config.warnings) {
    console.warn(`warning: ${warning}`)
  }
}
```

This ensures configuration warnings are visible to users immediately upon command execution.

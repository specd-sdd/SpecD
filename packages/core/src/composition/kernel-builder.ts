import { type ArtifactParser } from '../application/ports/artifact-parser.js'
import { RegistryConflictError } from '../application/errors/registry-conflict-error.js'
import { type ExternalHookRunner } from '../application/ports/external-hook-runner.js'
import { type SpecdConfig } from '../application/specd-config.js'
import { createBuiltinKernelRegistry } from './kernel-internals.js'
import {
  createKernelRegistryView,
  type ActorProvider,
  type ArchiveStorageFactory,
  type ChangeStorageFactory,
  type GraphStoreFactory,
  type SchemaStorageFactory,
  type SpecStorageFactory,
  type VcsProvider,
} from './kernel-registries.js'
import { createKernel, type Kernel, type KernelOptions } from './kernel.js'

/**
 * Mutable working state used internally by {@link createKernelBuilder}.
 */
interface KernelBuilderState {
  readonly extraNodeModulesPaths?: string[]
  graphStoreId?: string
  readonly specStorageFactories: Record<string, SpecStorageFactory>
  readonly schemaStorageFactories: Record<string, SchemaStorageFactory>
  readonly changeStorageFactories: Record<string, ChangeStorageFactory>
  readonly archiveStorageFactories: Record<string, ArchiveStorageFactory>
  readonly graphStoreFactories: Record<string, GraphStoreFactory>
  readonly parsers: Record<string, ArtifactParser>
  readonly vcsProviders: VcsProvider[]
  readonly actorProviders: ActorProvider[]
  readonly externalHookRunners: ExternalHookRunner[]
}

/**
 * Fluent pre-construction builder for additive kernel registrations.
 */
export interface KernelBuilder {
  /**
   * Registers a named spec storage factory.
   *
   * @param adapter - Adapter name to register
   * @param factory - Factory implementation for that adapter
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the adapter name already exists
   */
  registerSpecStorage(adapter: string, factory: SpecStorageFactory): this

  /**
   * Registers a named schema storage factory.
   *
   * @param adapter - Adapter name to register
   * @param factory - Factory implementation for that adapter
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the adapter name already exists
   */
  registerSchemaStorage(adapter: string, factory: SchemaStorageFactory): this

  /**
   * Registers a named change storage factory.
   *
   * @param adapter - Adapter name to register
   * @param factory - Factory implementation for that adapter
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the adapter name already exists
   */
  registerChangeStorage(adapter: string, factory: ChangeStorageFactory): this

  /**
   * Registers a named archive storage factory.
   *
   * @param adapter - Adapter name to register
   * @param factory - Factory implementation for that adapter
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the adapter name already exists
   */
  registerArchiveStorage(adapter: string, factory: ArchiveStorageFactory): this

  /**
   * Registers a named graph-store factory.
   *
   * @param id - Stable backend id to register
   * @param factory - Factory implementation for that backend
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the backend id already exists
   */
  registerGraphStore(id: string, factory: GraphStoreFactory): this

  /**
   * Selects the active graph-store backend id for the kernel being built.
   *
   * @param id - Registered graph-store backend id to select
   * @returns The same builder for fluent chaining
   * @throws {Error} When the backend id is not registered
   */
  useGraphStore(id: string): this

  /**
   * Registers an artifact parser for a named format.
   *
   * @param format - Artifact format name
   * @param parser - Parser implementation for that format
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When the format already exists
   */
  registerParser(format: string, parser: ArtifactParser): this

  /**
   * Registers an additional VCS detection provider.
   *
   * @param provider - Provider to append ahead of built-ins
   * @returns The same builder for fluent chaining
   */
  registerVcsProvider(provider: VcsProvider): this

  /**
   * Registers an additional actor detection provider.
   *
   * @param provider - Provider to append ahead of built-ins
   * @returns The same builder for fluent chaining
   */
  registerActorProvider(provider: ActorProvider): this

  /**
   * Registers an external hook runner.
   *
   * @param name - Caller-facing registration label
   * @param runner - Runner implementation declaring accepted external types
   * @returns The same builder for fluent chaining
   * @throws {@link RegistryConflictError} When any accepted type already exists
   */
  registerExternalHookRunner(name: string, runner: ExternalHookRunner): this

  /**
   * Builds the final kernel using the accumulated additive registrations.
   *
   * @returns A kernel equivalent to `createKernel(config, accumulatedOptions)`
   */
  build(): Promise<Kernel>
}

/**
 * Normalizes parser inputs into a mutable record.
 *
 * @param parsers - Parser registry input from base options
 * @returns A mutable record keyed by parser format
 */
function normalizeParsers(parsers: KernelOptions['parsers']): Record<string, ArtifactParser> {
  if (parsers === undefined) return {}
  return parsers instanceof Map
    ? (Object.fromEntries(parsers) as Record<string, ArtifactParser>)
    : ({ ...parsers } as Record<string, ArtifactParser>)
}

/**
 * Clones additive kernel options into the builder's mutable working state.
 *
 * @param base - Optional base registration state
 * @returns A mutable options object safe for incremental updates
 */
function cloneOptions(base?: Partial<KernelOptions>): KernelBuilderState {
  return {
    ...(base?.extraNodeModulesPaths !== undefined
      ? { extraNodeModulesPaths: [...base.extraNodeModulesPaths] }
      : {}),
    ...(base?.graphStoreId !== undefined ? { graphStoreId: base.graphStoreId } : {}),
    specStorageFactories: { ...(base?.specStorageFactories ?? {}) },
    schemaStorageFactories: { ...(base?.schemaStorageFactories ?? {}) },
    changeStorageFactories: { ...(base?.changeStorageFactories ?? {}) },
    archiveStorageFactories: { ...(base?.archiveStorageFactories ?? {}) },
    graphStoreFactories: { ...(base?.graphStoreFactories ?? {}) },
    parsers: normalizeParsers(base?.parsers),
    vcsProviders: [...(base?.vcsProviders ?? [])],
    actorProviders: [...(base?.actorProviders ?? [])],
    externalHookRunners: [...(base?.externalHookRunners ?? [])],
  }
}

/**
 * Converts mutable builder state into the public immutable `KernelOptions` shape.
 *
 * @param state - Current mutable builder state
 * @returns Immutable kernel options derived from the state
 */
function toKernelOptions(state: KernelBuilderState): KernelOptions {
  return {
    ...(state.extraNodeModulesPaths !== undefined
      ? { extraNodeModulesPaths: [...state.extraNodeModulesPaths] }
      : {}),
    ...(state.graphStoreId !== undefined ? { graphStoreId: state.graphStoreId } : {}),
    ...(Object.keys(state.specStorageFactories).length > 0
      ? { specStorageFactories: { ...state.specStorageFactories } }
      : {}),
    ...(Object.keys(state.schemaStorageFactories).length > 0
      ? { schemaStorageFactories: { ...state.schemaStorageFactories } }
      : {}),
    ...(Object.keys(state.changeStorageFactories).length > 0
      ? { changeStorageFactories: { ...state.changeStorageFactories } }
      : {}),
    ...(Object.keys(state.archiveStorageFactories).length > 0
      ? { archiveStorageFactories: { ...state.archiveStorageFactories } }
      : {}),
    ...(Object.keys(state.graphStoreFactories).length > 0
      ? { graphStoreFactories: { ...state.graphStoreFactories } }
      : {}),
    ...(Object.keys(state.parsers).length > 0 ? { parsers: { ...state.parsers } } : {}),
    ...(state.vcsProviders.length > 0 ? { vcsProviders: [...state.vcsProviders] } : {}),
    ...(state.actorProviders.length > 0 ? { actorProviders: [...state.actorProviders] } : {}),
    ...(state.externalHookRunners.length > 0
      ? { externalHookRunners: [...state.externalHookRunners] }
      : {}),
  }
}

/**
 * Returns the merged registry for the current builder state.
 *
 * @param state - Current accumulated builder state
 * @returns The merged registry view
 */
function currentRegistry(state: KernelBuilderState) {
  return createKernelRegistryView(createBuiltinKernelRegistry(), toKernelOptions(state))
}

/**
 * Creates a fluent kernel builder over additive registry registrations.
 *
 * @param config - The resolved project configuration
 * @param base - Optional base registration state
 * @returns A fluent builder that delegates final construction to `createKernel`
 */
export function createKernelBuilder(
  config: SpecdConfig,
  base?: Partial<KernelOptions>,
): KernelBuilder {
  const options = cloneOptions(base)

  const builder: KernelBuilder = {
    registerSpecStorage(adapter: string, factory: SpecStorageFactory): KernelBuilder {
      if (currentRegistry(options).storages.specs.has(adapter)) {
        throw new RegistryConflictError('specStorageFactories', adapter)
      }
      options.specStorageFactories[adapter] = factory
      return builder
    },

    registerSchemaStorage(adapter: string, factory: SchemaStorageFactory): KernelBuilder {
      if (currentRegistry(options).storages.schemas.has(adapter)) {
        throw new RegistryConflictError('schemaStorageFactories', adapter)
      }
      options.schemaStorageFactories[adapter] = factory
      return builder
    },

    registerChangeStorage(adapter: string, factory: ChangeStorageFactory): KernelBuilder {
      if (currentRegistry(options).storages.changes.has(adapter)) {
        throw new RegistryConflictError('changeStorageFactories', adapter)
      }
      options.changeStorageFactories[adapter] = factory
      return builder
    },

    registerArchiveStorage(adapter: string, factory: ArchiveStorageFactory): KernelBuilder {
      if (currentRegistry(options).storages.archive.has(adapter)) {
        throw new RegistryConflictError('archiveStorageFactories', adapter)
      }
      options.archiveStorageFactories[adapter] = factory
      return builder
    },

    registerGraphStore(id: string, factory: GraphStoreFactory): KernelBuilder {
      if (currentRegistry(options).graphStores.has(id)) {
        throw new RegistryConflictError('graphStoreFactories', id)
      }
      options.graphStoreFactories[id] = factory
      return builder
    },

    useGraphStore(id: string): KernelBuilder {
      if (!currentRegistry(options).graphStores.has(id)) {
        throw new Error(`graph store '${id}' is not registered`)
      }
      options.graphStoreId = id
      return builder
    },

    registerParser(format: string, parser: ArtifactParser): KernelBuilder {
      if (currentRegistry(options).parsers.has(format)) {
        throw new RegistryConflictError('parsers', format)
      }
      options.parsers[format] = parser
      return builder
    },

    registerVcsProvider(provider: VcsProvider): KernelBuilder {
      options.vcsProviders.push(provider)
      return builder
    },

    registerActorProvider(provider: ActorProvider): KernelBuilder {
      options.actorProviders.push(provider)
      return builder
    },

    registerExternalHookRunner(_name: string, runner: ExternalHookRunner): KernelBuilder {
      const registry = currentRegistry(options)
      for (const acceptedType of runner.acceptedTypes) {
        if (registry.externalHookRunners.has(acceptedType)) {
          throw new RegistryConflictError('externalHookRunners', acceptedType)
        }
      }
      options.externalHookRunners.push(runner)
      return builder
    },

    build(): Promise<Kernel> {
      return createKernel(config, toKernelOptions(options))
    },
  }

  return builder
}

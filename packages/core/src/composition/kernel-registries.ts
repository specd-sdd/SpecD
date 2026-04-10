import { RegistryConflictError } from '../application/errors/registry-conflict-error.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
} from '../application/ports/artifact-parser.js'
import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ExternalHookRunner } from '../application/ports/external-hook-runner.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import {
  type ExtractorTransform,
  type ExtractorTransformRegistry,
} from '../domain/services/content-extraction.js'
import { type ArchiveRepositoryContext } from './archive-repository.js'
import { type ChangeRepositoryContext } from './change-repository.js'
import { type SchemaRepositoryContext } from './schema-repository.js'
import { type SpecRepositoryContext } from './spec-repository.js'

/**
 * Factory for workspace spec repositories registered under a named adapter key.
 */
export interface SpecStorageFactory {
  /**
   * Creates a spec repository for the given workspace context.
   *
   * @param context - Shared repository context for the target workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed spec repository implementation
   */
  create(context: SpecRepositoryContext, options: Readonly<Record<string, unknown>>): SpecRepository
}

/**
 * Factory for workspace schema repositories registered under a named adapter key.
 */
export interface SchemaStorageFactory {
  /**
   * Creates a schema repository for the given workspace context.
   *
   * @param context - Shared repository context for the target workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed schema repository implementation
   */
  create(
    context: SchemaRepositoryContext,
    options: Readonly<Record<string, unknown>>,
  ): SchemaRepository
}

/**
 * Factory for change repositories registered under a named adapter key.
 */
export interface ChangeStorageFactory {
  /**
   * Creates a change repository for the default workspace context.
   *
   * @param context - Shared repository context for the default workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed change repository implementation
   */
  create(
    context: ChangeRepositoryContext,
    options: Readonly<Record<string, unknown>>,
  ): ChangeRepository
}

/**
 * Factory for archive repositories registered under a named adapter key.
 */
export interface ArchiveStorageFactory {
  /**
   * Creates an archive repository for the default workspace context.
   *
   * @param context - Shared repository context for the default workspace
   * @param options - Adapter-owned resolved options
   * @returns A fully constructed archive repository implementation
   */
  create(
    context: ArchiveRepositoryContext,
    options: Readonly<Record<string, unknown>>,
  ): ArchiveRepository
}

/**
 * Opaque graph-store factory registration carried by the kernel registry.
 *
 * `@specd/core` does not construct code-graph backends directly, so the return type
 * remains intentionally opaque at this layer while preserving the same registry shape
 * used by other extension points.
 */
export interface GraphStoreFactory {
  /**
   * Creates a concrete graph-store backend.
   *
   * @param options - Adapter-owned resolved options
   * @returns The constructed backend instance
   */
  create(options: Readonly<Record<string, unknown>>): unknown
}

/**
 * Named VCS detection provider.
 */
export interface VcsProvider {
  /** Human-readable provider name for debugging and tests. */
  readonly name: string

  /**
   * Attempts to detect and create a concrete VCS adapter for `cwd`.
   *
   * @param cwd - Directory to inspect
   * @returns A concrete adapter when the provider applies, otherwise `null`
   */
  detect(cwd: string): Promise<VcsAdapter | null>
}

/**
 * Named actor-resolution provider.
 */
export interface ActorProvider {
  /** Human-readable provider name for debugging and tests. */
  readonly name: string

  /**
   * Attempts to detect and create a concrete actor resolver for `cwd`.
   *
   * @param cwd - Directory to inspect
   * @returns A concrete resolver when the provider applies, otherwise `null`
   */
  detect(cwd: string): Promise<ActorResolver | null>
}

/**
 * Additive registry inputs accepted by the kernel and kernel builder.
 */
export interface KernelRegistryInput {
  /** Additional named spec storage factories. */
  readonly specStorageFactories?: Readonly<Record<string, SpecStorageFactory>>
  /** Additional named schema storage factories. */
  readonly schemaStorageFactories?: Readonly<Record<string, SchemaStorageFactory>>
  /** Additional named change storage factories. */
  readonly changeStorageFactories?: Readonly<Record<string, ChangeStorageFactory>>
  /** Additional named archive storage factories. */
  readonly archiveStorageFactories?: Readonly<Record<string, ArchiveStorageFactory>>
  /** Additional named graph-store factories. */
  readonly graphStoreFactories?: Readonly<Record<string, GraphStoreFactory>>
  /** Additional artifact parsers keyed by format name. */
  readonly parsers?: Readonly<Record<string, ArtifactParser>> | ArtifactParserRegistry
  /** Additional extractor transforms keyed by registered transform name. */
  readonly extractorTransforms?:
    | Readonly<Record<string, ExtractorTransform>>
    | ExtractorTransformRegistry
  /** Additional VCS providers tried before built-in probes. */
  readonly vcsProviders?: readonly VcsProvider[]
  /** Additional actor providers tried before built-in probes. */
  readonly actorProviders?: readonly ActorProvider[]
  /** Additional external hook runners indexed by accepted type. */
  readonly externalHookRunners?: readonly ExternalHookRunner[]
}

/**
 * Fully merged registry set exposed by the kernel.
 */
export interface KernelRegistryView {
  /** Named storage factories grouped by capability. */
  readonly storages: {
    /** Named spec storage factories available to the kernel. */
    readonly specs: ReadonlyMap<string, SpecStorageFactory>
    /** Named schema storage factories available to the kernel. */
    readonly schemas: ReadonlyMap<string, SchemaStorageFactory>
    /** Named change storage factories available to the kernel. */
    readonly changes: ReadonlyMap<string, ChangeStorageFactory>
    /** Named archive storage factories available to the kernel. */
    readonly archive: ReadonlyMap<string, ArchiveStorageFactory>
  }
  /** Artifact parsers keyed by format name. */
  readonly graphStores: ReadonlyMap<string, GraphStoreFactory>
  /** Artifact parsers keyed by format name. */
  readonly parsers: ArtifactParserRegistry
  /** Extractor transforms keyed by registered transform name. */
  readonly extractorTransforms: ExtractorTransformRegistry
  /** External-first VCS providers in dispatch order. */
  readonly vcsProviders: readonly VcsProvider[]
  /** External-first actor providers in dispatch order. */
  readonly actorProviders: readonly ActorProvider[]
  /** External hook runners keyed by accepted hook type. */
  readonly externalHookRunners: ReadonlyMap<string, ExternalHookRunner>
}

/**
 * Merges two named registries, rejecting duplicate keys.
 *
 * @param registry - Human-readable registry name for error messages
 * @param base - Built-in base entries
 * @param extra - Optional additive entries
 * @returns The merged immutable registry map
 * @throws {@link RegistryConflictError} When `extra` repeats an existing key
 */
export function mergeNamedRegistry<T>(
  registry: string,
  base: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
  extra?: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
): ReadonlyMap<string, T> {
  const merged = new Map<string, T>(toEntries(base))
  for (const [key, value] of toEntries(extra)) {
    if (merged.has(key)) {
      throw new RegistryConflictError(registry, key)
    }
    merged.set(key, value)
  }
  return merged
}

/**
 * Builds an accepted-type index for external hook runners.
 *
 * @param runners - External hook runners in registration order
 * @returns A map from accepted type to the runner that owns it
 * @throws {@link RegistryConflictError} When multiple runners claim the same type
 */
export function indexExternalHookRunners(
  runners: readonly ExternalHookRunner[],
): ReadonlyMap<string, ExternalHookRunner> {
  const index = new Map<string, ExternalHookRunner>()
  for (const runner of runners) {
    for (const acceptedType of runner.acceptedTypes) {
      if (index.has(acceptedType)) {
        throw new RegistryConflictError('externalHookRunners', acceptedType)
      }
      index.set(acceptedType, runner)
    }
  }
  return index
}

/**
 * Merges built-in and additive kernel registries into the final exposed view.
 *
 * @param base - Built-in registry set
 * @param extra - Optional additive registry set
 * @returns The merged immutable registry view
 * @throws {@link RegistryConflictError} When an additive registration collides
 */
export function createKernelRegistryView(
  base: KernelRegistryInput,
  extra?: KernelRegistryInput,
): KernelRegistryView {
  return {
    storages: {
      specs: mergeNamedRegistry(
        'specStorageFactories',
        base.specStorageFactories ?? {},
        extra?.specStorageFactories,
      ),
      schemas: mergeNamedRegistry(
        'schemaStorageFactories',
        base.schemaStorageFactories ?? {},
        extra?.schemaStorageFactories,
      ),
      changes: mergeNamedRegistry(
        'changeStorageFactories',
        base.changeStorageFactories ?? {},
        extra?.changeStorageFactories,
      ),
      archive: mergeNamedRegistry(
        'archiveStorageFactories',
        base.archiveStorageFactories ?? {},
        extra?.archiveStorageFactories,
      ),
    },
    graphStores: mergeNamedRegistry(
      'graphStoreFactories',
      base.graphStoreFactories ?? {},
      extra?.graphStoreFactories,
    ),
    parsers: mergeNamedRegistry('parsers', base.parsers ?? new Map(), extra?.parsers),
    extractorTransforms: mergeNamedRegistry(
      'extractorTransforms',
      base.extractorTransforms ?? new Map(),
      extra?.extractorTransforms,
    ),
    vcsProviders: [...(extra?.vcsProviders ?? []), ...(base.vcsProviders ?? [])],
    actorProviders: [...(extra?.actorProviders ?? []), ...(base.actorProviders ?? [])],
    externalHookRunners: indexExternalHookRunners([
      ...(base.externalHookRunners ?? []),
      ...(extra?.externalHookRunners ?? []),
    ]),
  }
}

/**
 * Normalizes registry input into iterable entries.
 *
 * @param registry - Record or map input
 * @returns The registry entries, or an empty array when absent
 */
function toEntries<T>(
  registry: Readonly<Record<string, T>> | ReadonlyMap<string, T> | undefined,
): readonly (readonly [string, T])[] {
  if (registry === undefined) return []
  if (registry instanceof Map) return [...registry.entries()]
  return Object.entries(registry)
}

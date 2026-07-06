import { RegistryConflictError } from '../application/errors/registry-conflict-error.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
} from '../application/ports/artifact-parser.js'
import { type ExternalHookRunner } from '../application/ports/external-hook-runner.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import {
  type ExtractorTransform,
  type ExtractorTransformRegistry,
} from '../domain/services/content-extraction.js'
import { createArtifactParserRegistry } from '../infrastructure/artifact-parser/registry.js'
import { createArchiveRepository } from './archive-repository.js'
import { type ActorProvider } from './actor-provider.js'
import { BUILTIN_ACTOR_PROVIDERS } from './actor-resolver.js'
import { createChangeRepository } from './change-repository.js'
import { createBuiltinExtractorTransforms } from './extractor-transforms/index.js'
import { type ArchiveStorageFactory } from './archive-storage-factory.js'
import { type ChangeStorageFactory } from './change-storage-factory.js'
import { createSchemaRepository } from './schema-repository.js'
import { type SchemaStorageFactory } from './schema-storage-factory.js'
import { createSpecRepository } from './spec-repository.js'
import { type SpecStorageFactory } from './spec-storage-factory.js'
import { BUILTIN_VCS_PROVIDERS } from './vcs-adapter.js'
import { type VcsProvider } from './vcs-provider.js'

export type { ActorProvider, AutoDetectActorProvider } from './actor-provider.js'
export type { VcsProvider } from './vcs-provider.js'
export type { SpecStorageFactory } from './spec-storage-factory.js'
export type { SchemaStorageFactory } from './schema-storage-factory.js'
export type { ChangeStorageFactory } from './change-storage-factory.js'
export type { ArchiveStorageFactory } from './archive-storage-factory.js'

/**
 * Additive registry inputs accepted by the composition layer.
 */
export interface CompositionRegistryInput {
  /** Additional named spec storage factories. */
  readonly specStorageFactories?: Readonly<Record<string, SpecStorageFactory>>
  /** Additional named schema storage factories. */
  readonly schemaStorageFactories?: Readonly<Record<string, SchemaStorageFactory>>
  /** Additional named change storage factories. */
  readonly changeStorageFactories?: Readonly<Record<string, ChangeStorageFactory>>
  /** Additional named archive storage factories. */
  readonly archiveStorageFactories?: Readonly<Record<string, ArchiveStorageFactory>>
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
 * Fully merged registry set exposed by composition assembly.
 */
export interface CompositionRegistryView {
  /** Named storage factories grouped by capability. */
  readonly storages: {
    /** Named spec storage factories available to composition assembly. */
    readonly specs: ReadonlyMap<string, SpecStorageFactory>
    /** Named schema storage factories available to composition assembly. */
    readonly schemas: ReadonlyMap<string, SchemaStorageFactory>
    /** Named change storage factories available to composition assembly. */
    readonly changes: ReadonlyMap<string, ChangeStorageFactory>
    /** Named archive storage factories available to composition assembly. */
    readonly archive: ReadonlyMap<string, ArchiveStorageFactory>
  }
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
 * Reads a required string option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Required property name
 * @returns The string option value
 * @throws {TypeError} When the option is missing or not a string
 */
function readStringOption(options: Readonly<Record<string, unknown>>, key: string): string {
  const value = options[key]
  if (typeof value !== 'string') {
    throw new TypeError(`expected string option '${key}'`)
  }
  return value
}

/**
 * Reads an optional string option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Optional property name
 * @returns The string option value, or `undefined` when absent
 * @throws {TypeError} When the option is present but not a string
 */
function readOptionalStringOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = options[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new TypeError(`expected string option '${key}'`)
  }
  return value
}

/**
 * Reads a required object option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Required property name
 * @returns The nested object value
 * @throws {TypeError} When the option is missing or not an object
 */
function readRecordOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = options[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`expected object option '${key}'`)
  }
  return value as Readonly<Record<string, unknown>>
}

/**
 * Reads an optional async artifact-type resolver from opaque factory options.
 *
 * @param options - Adapter-owned resolved options
 * @returns The resolver function when present
 */
function readResolveArtifactTypes(
  options: Readonly<Record<string, unknown>>,
):
  | (() => Promise<readonly import('../domain/value-objects/artifact-type.js').ArtifactType[]>)
  | undefined {
  const value = options.resolveArtifactTypes
  return typeof value === 'function'
    ? (value as () => Promise<
        readonly import('../domain/value-objects/artifact-type.js').ArtifactType[]
      >)
    : undefined
}

/**
 * Reads an optional async spec-existence resolver from opaque factory options.
 *
 * @param options - Adapter-owned resolved options
 * @returns The resolver function when present
 */
function readResolveSpecExists(
  options: Readonly<Record<string, unknown>>,
): ((specId: string) => Promise<boolean>) | undefined {
  const value = options.resolveSpecExists
  return typeof value === 'function' ? (value as (specId: string) => Promise<boolean>) : undefined
}

/** Built-in `fs` factory for spec repositories. */
const FS_SPEC_STORAGE_FACTORY: SpecStorageFactory = {
  create(context, options): SpecRepository {
    const prefix = readOptionalStringOption(options, 'prefix')
    return createSpecRepository('fs', context, {
      specsPath: readStringOption(options, 'path'),
      metadataPath: readStringOption(options, 'metadataPath'),
      ...(prefix !== undefined ? { prefix } : {}),
    })
  },
}

/** Built-in `fs` factory for schema repositories. */
const FS_SCHEMA_STORAGE_FACTORY: SchemaStorageFactory = {
  create(context, options): SchemaRepository {
    return createSchemaRepository('fs', context, {
      schemasPath: readStringOption(options, 'path'),
    })
  },
}

/** Built-in `fs` factory for change repositories. */
const FS_CHANGE_STORAGE_FACTORY: ChangeStorageFactory = {
  create(context, options): ChangeRepository {
    const drafts = readRecordOption(options, 'drafts')
    const discarded = readRecordOption(options, 'discarded')
    const resolveArtifactTypes = readResolveArtifactTypes(options)
    const resolveSpecExists = readResolveSpecExists(options)
    return createChangeRepository('fs', context, {
      changesPath: readStringOption(options, 'path'),
      draftsPath: readStringOption(drafts, 'path'),
      discardedPath: readStringOption(discarded, 'path'),
      ...(resolveArtifactTypes !== undefined ? { resolveArtifactTypes } : {}),
      ...(resolveSpecExists !== undefined ? { resolveSpecExists } : {}),
    })
  },
}

/** Built-in `fs` factory for archive repositories. */
const FS_ARCHIVE_STORAGE_FACTORY: ArchiveStorageFactory = {
  create(context, options): ArchiveRepository {
    const changes = readRecordOption(options, 'changes')
    const drafts = readRecordOption(options, 'drafts')
    const pattern = readOptionalStringOption(options, 'pattern')
    return createArchiveRepository('fs', context, {
      changesPath: readStringOption(changes, 'path'),
      draftsPath: readStringOption(drafts, 'path'),
      archivePath: readStringOption(options, 'path'),
      ...(pattern !== undefined ? { pattern } : {}),
    })
  },
}

/**
 * Returns the built-in composition registry set before additive extension.
 *
 * @returns The built-in storage factories, parsers, providers, and hook runners
 */
export function createBuiltinCompositionRegistry(): CompositionRegistryInput {
  return {
    specStorageFactories: { fs: FS_SPEC_STORAGE_FACTORY },
    schemaStorageFactories: { fs: FS_SCHEMA_STORAGE_FACTORY },
    changeStorageFactories: { fs: FS_CHANGE_STORAGE_FACTORY },
    archiveStorageFactories: { fs: FS_ARCHIVE_STORAGE_FACTORY },
    parsers: createArtifactParserRegistry(),
    extractorTransforms: createBuiltinExtractorTransforms(),
    vcsProviders: BUILTIN_VCS_PROVIDERS,
    actorProviders: BUILTIN_ACTOR_PROVIDERS,
    externalHookRunners: [],
  }
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
 * Merges built-in and additive composition registries into the final exposed view.
 *
 * @param base - Built-in registry set
 * @param extra - Optional additive registry set
 * @returns The merged immutable registry view
 * @throws {@link RegistryConflictError} When an additive registration collides
 */
export function createCompositionRegistryView(
  base: CompositionRegistryInput,
  extra?: CompositionRegistryInput,
): CompositionRegistryView {
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

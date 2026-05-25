import path from 'node:path'
import ignore from 'ignore'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type SpecdWorkspaceConfig } from '../specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type ActorIdentity, type Change } from '../../domain/entities/change.js'
import { SYSTEM_ACTOR } from '../../domain/entities/change.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { detectSpecOverlap } from '../../domain/services/detect-spec-overlap.js'
import { SpecOverlapError } from '../../domain/errors/spec-overlap-error.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type GenerateSpecMetadata } from './generate-spec-metadata.js'
import { type SaveSpecMetadata } from './save-spec-metadata.js'
import { type RunStepHooks } from './run-step-hooks.js'
import { Logger } from '../logger.js'
import { type ArchiveBatchSnapshotPort } from '../ports/archive-batch-snapshot.js'
import { createNoopArchiveBatchSnapshot } from '../archive-batch-snapshot-noop.js'
import { ArchiveBatchRestoreError } from '../../domain/errors/archive-batch-restore-error.js'
import { type SpecLockData } from '../../domain/services/parse-spec-lock.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
import { ArchiveArtifactMissingError } from '../../domain/errors/archive-artifact-missing-error.js'
import { ArchiveDependencyMismatchError } from '../../domain/errors/archive-dependency-mismatch-error.js'
import { ArchiveImplementationStateError } from '../../domain/errors/archive-implementation-state-error.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'

/** Selectors for granular hook-phase skipping during archiving. */
export type ArchiveHookPhaseSelector = 'pre' | 'post' | 'all'

/** Input for the {@link ArchiveChange} use case. */
export interface ArchiveChangeInput {
  /** The change name to archive. */
  readonly name: string
  /**
   * Which archive hook phases to skip.
   *
   * When `'all'` is present, all archive hook execution is skipped.
   *
   * Defaults to an empty set.
   */
  readonly skipHookPhases?: ReadonlySet<ArchiveHookPhaseSelector>
  /**
   * When `true`, skips the overlap check and permits archiving even when
   * other active changes target the same specs.
   *
   * Defaults to `false`.
   */
  readonly allowOverlap?: boolean
  /**
   * When `true`, allows archive-time sidecar maintenance to update specs
   * outside the active change scope.
   *
   * Defaults to `false`.
   */
  readonly allowOutOfScope?: boolean
}

/** Entry describing a change invalidated due to spec overlap during archive. */
export interface InvalidatedChangesEntry {
  readonly name: string
  readonly specIds: readonly string[]
}

/** Result returned by a successful {@link ArchiveChange} execution. */
export interface ArchiveChangeResult {
  /** The `ArchivedChange` record that was persisted. */
  readonly archivedChange: ArchivedChange
  /** Absolute path to the archive directory where the change was stored. */
  readonly archiveDirPath: string
  /** Commands of post-archive hooks that failed; empty on full success. */
  readonly postHookFailures: string[]
  /**
   * Spec paths where `metadata.json` generation failed during this archive
   * (e.g. extraction produced no required fields); empty when all metadata was
   * generated successfully.
   */
  readonly staleMetadataSpecPaths: string[]
  /** Changes that were invalidated due to spec overlap; empty when no invalidation occurred. */
  readonly invalidatedChanges: readonly InvalidatedChangesEntry[]
}

/** Prepared permanent write for one archived spec artifact. */
interface PreparedArchiveWrite {
  readonly specId: string
  readonly artifactId: string
  readonly spec: Spec
  readonly specRepo: SpecRepository
  readonly outputFilename: string
  readonly format: string
  readonly content: string
}

/** In-memory archive plan built before any permanent writes begin. */
interface PreparedArchivePlan {
  readonly publications: readonly PreparedArchivePublication[]
  readonly staleSpecIds: readonly string[]
  readonly implementationBySpecId: ReadonlyMap<string, readonly MaterializedImplementationLink[]>
  readonly outOfScopeImplementationSpecIds: readonly string[]
}

/** Minimal tracked-file view needed during archive filename resolution. */
interface TrackedArchiveFile {
  readonly filename: string
  readonly validatedHash: string | undefined
}

/** Publication unit for one spec during archive. */
interface PreparedArchivePublication {
  readonly specId: string
  readonly spec: Spec
  readonly specRepo: SpecRepository
  readonly writes: readonly PreparedArchiveWrite[]
}

/** Preflighted publication unit with all failure-prone archive checks resolved. */
interface PreparedArchivePreflightSpec {
  readonly specId: string
  readonly workspace: string
  readonly specPath: SpecPath
  readonly spec: Spec
  readonly specRepo: SpecRepository
  readonly writes: readonly PreparedArchiveWrite[]
  readonly extractionArtifacts: readonly MetadataArtifactInput[]
  readonly existingSpecLock: SpecLockData | null
  readonly finalDependsOn: readonly string[]
  readonly publicationSpecLock: SpecLockData | undefined
  readonly sidecarActive: boolean
}

/** One implementation link after archive-time canonicalization. */
interface MaterializedImplementationLink {
  readonly file: string
  readonly symbols?: readonly string[]
}

/** Workspace-specific archive materialization constraints. */
interface ArchiveWorkspaceImplementationConfig {
  readonly codeRoot: string
  readonly excludePaths: readonly string[]
}

/**
 * Finalises a completed change: merges delta artifacts into the project specs,
 * moves the change directory to the archive, and fires lifecycle hooks.
 *
 * Gated on `archivable` state — the change must have completed the full lifecycle
 * before this use case can proceed.
 */
export class ArchiveChange {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _archive: ArchiveRepository
  private readonly _runStepHooks: RunStepHooks
  private readonly _actor: ActorResolver
  private readonly _parsers: ArtifactParserRegistry
  private readonly _schemaProvider: SchemaProvider
  private readonly _generateMetadata: GenerateSpecMetadata
  private readonly _saveMetadata: SaveSpecMetadata
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]
  private readonly _projectRoot: string
  private readonly _workspaceConfigs: ReadonlyMap<string, ArchiveWorkspaceImplementationConfig>
  private readonly _batchSnapshot: ArchiveBatchSnapshotPort

  /**
   * Creates a new `ArchiveChange` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param archive - Repository for archiving the change
   * @param runStepHooks - Use case for executing workflow hooks
   * @param actor - Resolver for the actor identity
   * @param parsers - Registry of artifact format parsers
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param generateMetadata - Use case for deterministic metadata extraction
   * @param saveMetadata - Use case for writing metadata
   * @param extractorTransforms - Shared extractor transform registry for pre-publication extraction
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace spec reference resolution
   * @param projectRoot - Project root used to canonicalize raw implementation paths
   * @param workspaceConfigs - Workspace codeRoot and exclusion config for archive materialization
   * @param batchSnapshot - Batch canonical snapshot adapter for commit rollback
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    runStepHooks: RunStepHooks,
    actor: ActorResolver,
    parsers: ArtifactParserRegistry,
    schemaProvider: SchemaProvider,
    generateMetadata: GenerateSpecMetadata,
    saveMetadata: SaveSpecMetadata,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
    projectRoot = process.cwd(),
    workspaceConfigs: ReadonlyMap<string, ArchiveWorkspaceImplementationConfig> = new Map(),
    batchSnapshot: ArchiveBatchSnapshotPort = createNoopArchiveBatchSnapshot(),
  ) {
    this._changes = changes
    this._specs = specs
    this._archive = archive
    this._runStepHooks = runStepHooks
    this._actor = actor
    this._parsers = parsers
    this._schemaProvider = schemaProvider
    this._generateMetadata = generateMetadata
    this._saveMetadata = saveMetadata
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
    this._projectRoot = projectRoot
    this._workspaceConfigs = workspaceConfigs
    this._batchSnapshot = batchSnapshot
  }

  /**
   * Executes the archive lifecycle: validates state, runs pre-hooks, merges
   * delta artifacts, archives the change, and runs post-hooks.
   *
   * @param input - Archive parameters
   * @returns Archive result with the persisted record and any post-hook failures
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   * @throws {InvalidStateTransitionError} If the change is not in `archivable` state
   * @throws {HookFailedError} If a pre-archive `run:` hook exits with a non-zero code
   */
  async execute(input: ArchiveChangeInput): Promise<ArchiveChangeResult> {
    const loadedChange = await this._changes.get(input.name)
    if (loadedChange === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()

    // --- Schema name guard ---
    if (schema.name() !== loadedChange.schemaName) {
      throw new SchemaMismatchError(loadedChange.name, loadedChange.schemaName, schema.name())
    }

    Logger.debug('ArchiveChange passed schema guard', {
      change: loadedChange.name,
      schema: schema.name(),
    })

    // --- Archivable guard (no lifecycle transition yet) ---
    loadedChange.assertArchivable()
    Logger.debug('ArchiveChange passed archivable guard', {
      change: loadedChange.name,
      state: loadedChange.state,
    })

    let change = loadedChange
    const archivingActor = await this._actor.identity()

    // --- Overlap guard ---
    const invalidatedChanges: InvalidatedChangesEntry[] = []
    const allChanges = await this._changes.list()
    const others = allChanges.filter((c) => c.name !== change.name)
    if (others.length > 0) {
      const combined = [...others, change]
      const overlapReport = detectSpecOverlap(combined)
      const relevant = overlapReport.entries.filter((entry) =>
        entry.changes.some((c) => c.name === change.name),
      )
      if (relevant.length > 0) {
        if (!(input.allowOverlap ?? false)) {
          throw new SpecOverlapError(relevant)
        }
        const overlappingChangeNames = [
          ...new Set(
            relevant.flatMap((entry) =>
              entry.changes.filter((c) => c.name !== change.name).map((c) => c.name),
            ),
          ),
        ]
        for (const overlappingName of overlappingChangeNames) {
          const specsForChange = [
            ...new Set(
              relevant
                .filter((entry) => entry.changes.some((c) => c.name === overlappingName))
                .map((entry) => entry.specId),
            ),
          ]
          const affectedArtifacts = others
            .find((c) => c.name === overlappingName)!
            .artifacts.values()
          const artifactEntries = [...affectedArtifacts]
            .filter((artifact) =>
              [...artifact.files.keys()].some((key) => specsForChange.includes(key)),
            )
            .map((artifact) => ({
              type: artifact.type,
              files: [...artifact.files.keys()].filter((key) => specsForChange.includes(key)),
            }))
          const message = `Invalidated because change '${change.name}' was archived with overlapping specs: ${specsForChange.join(', ')}`
          await this._changes.mutate(overlappingName, (freshOverlapping) => {
            freshOverlapping.invalidate(
              'spec-overlap-conflict',
              SYSTEM_ACTOR,
              message,
              artifactEntries.length > 0
                ? artifactEntries
                : [...freshOverlapping.artifacts.values()].map((a) => ({
                    type: a.type,
                    files: [...a.files.keys()],
                  })),
              schema.artifactDag(),
            )
            return freshOverlapping
          })
          invalidatedChanges.push({ name: overlappingName, specIds: specsForChange })
        }
      }
    }
    Logger.debug('ArchiveChange overlap guard complete', {
      change: change.name,
      overlapCount: invalidatedChanges.length,
      invalidatedChanges: invalidatedChanges.map((entry) => entry.name),
    })

    // --- ReadOnly workspace guard ---
    const readOnlySpecs: Array<{ specId: string; workspace: string }> = []
    for (const specId of change.specIds) {
      const { workspace } = parseSpecId(specId)
      const specRepo = this._specs.get(workspace)
      if (specRepo && specRepo.ownership() === 'readOnly') {
        readOnlySpecs.push({ specId, workspace })
      }
    }
    if (readOnlySpecs.length > 0) {
      const lines = readOnlySpecs.map(
        (s) => `  - ${s.specId}  →  workspace "${s.workspace}" (readOnly)`,
      )
      throw new ReadOnlyWorkspaceError(
        `Cannot archive change "${change.name}" — it contains specs from readOnly workspaces:\n\n${lines.join('\n')}\n\nArchiving would write deltas into protected specs.`,
      )
    }
    Logger.debug('ArchiveChange readOnly guard complete', {
      change: change.name,
      specCount: change.specIds.length,
    })

    // --- Pre-archive hooks (delegated to RunStepHooks) ---
    const skip = input.skipHookPhases ?? new Set<ArchiveHookPhaseSelector>()
    if (!skip.has('all') && !skip.has('pre')) {
      Logger.debug('ArchiveChange pre-archive hooks started', {
        change: change.name,
        phase: 'pre',
        skipped: false,
      })
      const preResult = await this._runStepHooks.execute({
        name: input.name,
        step: 'archiving',
        phase: 'pre',
      })
      if (!preResult.success && preResult.failedHook !== null) {
        throw new HookFailedError(
          preResult.failedHook.command,
          preResult.failedHook.exitCode,
          preResult.failedHook.stderr,
        )
      }
      Logger.debug('ArchiveChange pre-archive hooks completed', {
        change: change.name,
        phase: 'pre',
      })
    }

    let preparedPlan: PreparedArchivePlan
    try {
      preparedPlan = await this._prepareArchivePlan(change, schema)
      this._assertOutOfScopeImplementationAllowed(change, preparedPlan, input.allowOutOfScope)
      Logger.debug('ArchiveChange prepared archive plan', {
        change: change.name,
        publicationCount: preparedPlan.publications.length,
        staleSpecCount: preparedPlan.staleSpecIds.length,
        outOfScopeImplementationSpecCount: preparedPlan.outOfScopeImplementationSpecIds.length,
      })
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'prepare', error, archivingActor, false)
      throw error
    }

    let preparedPreflight: readonly PreparedArchivePreflightSpec[]

    try {
      preparedPreflight = await this._prepareArchivePreflight(change, schema, preparedPlan)
      Logger.debug('ArchiveChange completed full-batch archive preflight', {
        change: change.name,
        publicationCount: preparedPreflight.length,
      })
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'prepare', error, archivingActor, false)
      throw error
    }

    const batchSpecIds = [
      ...new Set([
        ...change.specIds,
        ...preparedPlan.publications.map((publication) => publication.specId),
      ]),
    ]
    const publishOrder: string[] = preparedPreflight.map((publication) => publication.specId)

    try {
      await this._batchSnapshot.detectOrphans(batchSpecIds, change.name)
      for (const specId of publishOrder) {
        await this._batchSnapshot.snapshot(specId, change.name)
      }
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'prepare', error, archivingActor, false)
      throw error
    }

    change = await this._changes.mutate(input.name, (freshChange) => {
      freshChange.assertArchivable()
      if (freshChange.state !== 'archiving') {
        freshChange.transition('archiving', archivingActor)
      }
      return freshChange
    })
    Logger.debug('ArchiveChange transitioning to archiving', {
      change: change.name,
      actor: archivingActor.name,
    })

    const postPublicationStates = new Map<
      string,
      {
        readonly workspace: string
        readonly specPath: SpecPath
        readonly finalDependsOn: readonly string[]
        readonly sidecarActive: boolean
      }
    >()

    try {
      for (const publication of preparedPreflight) {
        Logger.debug('ArchiveChange starting staged spec publication', {
          change: change.name,
          specId: publication.specId,
          artifactCount: publication.writes.length,
          implementationCount: publication.publicationSpecLock?.implementation.length ?? 0,
        })
        await publication.specRepo.publish(publication.spec, {
          artifacts: publication.writes.map(
            (write) => new SpecArtifact(write.outputFilename, write.content),
          ),
          ...(publication.publicationSpecLock !== undefined
            ? { specLock: publication.publicationSpecLock }
            : {}),
        })
        for (const write of publication.writes) {
          await this._batchSnapshot.recordCreatedFile(publication.specId, write.outputFilename)
        }
        if (publication.publicationSpecLock !== undefined) {
          await this._batchSnapshot.recordCreatedFile(publication.specId, 'spec-lock.json')
        }
        Logger.debug('ArchiveChange completed staged spec publication', {
          change: change.name,
          specId: publication.specId,
          artifactCount: publication.writes.length,
        })
        postPublicationStates.set(publication.specId, {
          workspace: publication.workspace,
          specPath: publication.specPath,
          finalDependsOn: publication.finalDependsOn,
          sidecarActive: publication.sidecarActive,
        })
      }
    } catch (error) {
      return await this._handleCommitFailure(
        input.name,
        error,
        archivingActor,
        batchSpecIds,
        publishOrder,
        'commit',
      )
    }

    // --- Archive ---
    let archivedChange: ArchivedChange
    let archiveDirPath: string
    try {
      Logger.debug('ArchiveChange archive repository call started', { change: change.name })
      const archived = await this._archive.archive(change, {
        actor: archivingActor,
      })
      archivedChange = archived.archivedChange
      archiveDirPath = archived.archiveDirPath
      Logger.debug('ArchiveChange archive repository call completed', {
        change: change.name,
        archivedName: archivedChange.archivedName,
      })
    } catch (error) {
      return await this._handleCommitFailure(
        input.name,
        error,
        archivingActor,
        batchSpecIds,
        publishOrder,
        'archive',
      )
    }

    await this._batchSnapshot.cleanup(batchSpecIds)

    // --- Spec metadata generation + sidecar reconciliation (post-archive) ---
    const failedMetadataSpecPaths: string[] = []

    for (const specId of preparedPlan.staleSpecIds) {
      try {
        const publishedState = postPublicationStates.get(specId)
        if (publishedState === undefined) continue
        const specRepo = this._specs.get(publishedState.workspace)
        if (specRepo === undefined) continue

        Logger.debug('ArchiveChange metadata generation started', { change: change.name, specId })
        const result = await this._generateMetadata.execute({ specId })
        if (!result.hasExtraction || Object.keys(result.metadata).length === 0) {
          failedMetadataSpecPaths.push(specId)
          Logger.debug('ArchiveChange metadata generation skipped', {
            change: change.name,
            specId,
            skipped: 'no-extraction',
          })
          continue
        }

        const metadataDependsOn =
          publishedState.sidecarActive || result.metadata.dependsOn === undefined
            ? publishedState.finalDependsOn
            : result.metadata.dependsOn

        await this._saveMetadata.execute({
          workspace: publishedState.workspace,
          specPath: publishedState.specPath,
          content:
            JSON.stringify({ ...result.metadata, dependsOn: [...metadataDependsOn] }, null, 2) +
            '\n',
          force: true,
        })
        Logger.debug('ArchiveChange metadata generation completed', { change: change.name, specId })
      } catch {
        failedMetadataSpecPaths.push(specId)
        Logger.debug('ArchiveChange metadata generation failed', { change: change.name, specId })
      }
    }

    // --- Post-archive hooks (delegated to RunStepHooks) ---

    const postHookFailures: string[] = []
    if (!skip.has('all') && !skip.has('post')) {
      Logger.debug('ArchiveChange post-archive hooks started', {
        change: change.name,
        phase: 'post',
      })
      const postResult = await this._runStepHooks.execute({
        name: input.name,
        step: 'archiving',
        phase: 'post',
      })
      for (const hook of postResult.hooks) {
        if (!hook.success) {
          postHookFailures.push(hook.command)
        }
      }
      Logger.debug('ArchiveChange post-archive hooks completed', {
        change: change.name,
        phase: 'post',
        failureCount: postHookFailures.length,
      })
    }

    return {
      archivedChange,
      archiveDirPath,
      postHookFailures,
      staleMetadataSpecPaths: failedMetadataSpecPaths,
      invalidatedChanges,
    }
  }

  /**
   * Copies a primary artifact file from the change directory to the spec repository.
   *
   * @param change - The change containing the artifact
   * @param specFile - The artifact file entry with the filename to load
   * @param spec - The target spec entity
   * @param outputBasename - The output filename (e.g. `spec.md`)
   * @param specRepo - The spec repository to save to
   * @returns `true` if the file was found and saved, `false` if missing
   */
  /**
   * Prepares the complete set of permanent spec writes in memory before commit.
   *
   * @param change - Active change being archived
   * @param schema - Resolved active schema
   * @returns Prepared write plan and metadata-staleness set
   */
  private async _prepareArchivePlan(change: Change, schema: Schema): Promise<PreparedArchivePlan> {
    this._assertTrackedImplementationFilesResolved(change)

    const writesBySpecId = new Map<string, PreparedArchiveWrite[]>()
    const staleSpecIds = new Set<string>()
    const implementationBySpecId = this._materializeImplementationLinks(change)
    const publicationSpecIds = new Set<string>([
      ...change.specIds,
      ...implementationBySpecId.keys(),
    ])
    const yamlParser = this._parsers.get('yaml')

    for (const specId of change.specIds) {
      const { workspace, capPath: capabilityPath } = parseSpecId(specId)
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) continue

      const spec = new Spec(workspace, SpecPath.parse(capabilityPath), [])

      const writes = writesBySpecId.get(specId) ?? []

      for (const artifactType of schema.artifacts()) {
        if (artifactType.scope !== 'spec') continue

        const changeArtifact = change.getArtifact(artifactType.id)
        const specFile = changeArtifact?.getFile(specId)
        if (
          specFile === undefined ||
          specFile.status === 'missing' ||
          specFile.status === 'skipped'
        ) {
          continue
        }

        const outputBasename = path.basename(artifactType.output)
        const baseArtifact =
          artifactType.delta && artifactType.scope === 'spec'
            ? await specRepo.artifact(spec, outputBasename)
            : null
        const expectedFilename =
          artifactType.delta && artifactType.scope === 'spec' && baseArtifact !== null
            ? capabilityPath.length > 0
              ? `deltas/${workspace}/${capabilityPath}/${outputBasename}.delta.yaml`
              : `deltas/${workspace}/${outputBasename}.delta.yaml`
            : capabilityPath.length > 0
              ? `specs/${workspace}/${capabilityPath}/${outputBasename}`
              : `specs/${workspace}/${outputBasename}`
        const trackedFilename = resolveTrackedArchiveFilename(specFile, expectedFilename)
        const trackedArtifact = await this._changes.artifact(change, trackedFilename)
        if (trackedArtifact === null) {
          throw new ArchiveArtifactMissingError(trackedFilename, 'tracked')
        }

        Logger.debug('ArchiveChange selected tracked artifact file', {
          change: change.name,
          specId,
          artifactId: artifactType.id,
          filename: trackedFilename,
        })

        if (artifactType.delta && isDeltaTrackedFilename(trackedFilename)) {
          const format = artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'
          const formatParser = this._parsers.get(format)
          if (formatParser === undefined) {
            throw new ParserNotRegisteredError(format, `artifact '${artifactType.id}'`)
          }
          if (yamlParser === undefined) {
            throw new ParserNotRegisteredError('yaml', 'required for delta file parsing')
          }

          if (baseArtifact === null) {
            throw new ArchiveArtifactMissingError(outputBasename, 'base')
          }

          const deltaEntries = yamlParser.parseDelta(trackedArtifact.content)
          const mergedResult = formatParser.apply(
            formatParser.parse(baseArtifact.content),
            deltaEntries,
          )
          writes.push({
            specId,
            artifactId: artifactType.id,
            spec,
            specRepo,
            outputFilename: outputBasename,
            format,
            content: formatParser.serialize(mergedResult.ast),
          })
        } else {
          writes.push({
            specId,
            artifactId: artifactType.id,
            spec,
            specRepo,
            outputFilename: outputBasename,
            format: artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext',
            content: trackedArtifact.content,
          })
        }

        staleSpecIds.add(specId)
      }

      writesBySpecId.set(specId, writes)

      if (
        change.specDependsOn.get(specId) !== undefined ||
        implementationBySpecId.has(specId) ||
        writes.length > 0
      ) {
        staleSpecIds.add(specId)
      }
    }

    const publications: PreparedArchivePublication[] = []
    for (const specId of publicationSpecIds) {
      const { workspace, capPath: capabilityPath } = parseSpecId(specId)
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) {
        if (implementationBySpecId.has(specId) && !change.specIds.includes(specId)) {
          throw new ArchiveImplementationStateError(
            [],
            `Cannot archive implementation tracking for "${specId}" because workspace "${workspace}" has no spec repository.`,
          )
        }
        continue
      }
      const writes = writesBySpecId.get(specId) ?? []
      if (
        writes.length === 0 &&
        change.specDependsOn.get(specId) === undefined &&
        !implementationBySpecId.has(specId)
      ) {
        continue
      }
      publications.push({
        specId,
        spec: new Spec(workspace, SpecPath.parse(capabilityPath), []),
        specRepo,
        writes,
      })
    }

    return {
      publications,
      staleSpecIds: [...staleSpecIds],
      implementationBySpecId,
      outOfScopeImplementationSpecIds: [...implementationBySpecId.keys()].filter(
        (specId) => !change.specIds.includes(specId),
      ),
    }
  }

  /**
   * Executes the full archive-batch preflight before canonical publication.
   *
   * @param change - Active change being archived
   * @param schema - Resolved active schema
   * @param preparedPlan - Prepared archive write plan
   * @returns Fully preflighted publication units for the commit phase
   */
  private async _prepareArchivePreflight(
    change: Change,
    schema: Schema,
    preparedPlan: PreparedArchivePlan,
  ): Promise<readonly PreparedArchivePreflightSpec[]> {
    const preflighted: PreparedArchivePreflightSpec[] = []
    for (const publication of preparedPlan.publications) {
      preflighted.push(
        await this._prepareSpecPublicationPreflight({
          change,
          schema,
          publication,
          implementationBySpecId: preparedPlan.implementationBySpecId,
        }),
      )
    }
    return preflighted
  }

  /**
   * Resolves all archive-time checks for one spec without publishing it.
   *
   * @param args - Per-spec archive preflight inputs
   * @param args.change - Active change being archived
   * @param args.schema - Resolved active schema
   * @param args.publication - Publication unit with staged canonical writes
   * @param args.implementationBySpecId - Canonicalized implementation links by spec id
   * @returns Preflighted publication state ready for canonical publish
   * @throws {Error} When metadata extraction and persisted dependency state conflict
   */
  private async _prepareSpecPublicationPreflight(args: {
    readonly change: Change
    readonly schema: Schema
    readonly publication: PreparedArchivePublication
    readonly implementationBySpecId: ReadonlyMap<string, readonly MaterializedImplementationLink[]>
  }): Promise<PreparedArchivePreflightSpec> {
    const { workspace, capPath } = parseSpecId(args.publication.specId)
    const extractionArtifacts = await this._buildFinalSpecArtifactsForExtraction(
      args.publication.specRepo,
      args.publication.spec,
      args.schema,
      args.publication.writes,
    )
    const preExtracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: args.schema,
      workspace,
      specPath: args.publication.spec.name,
      artifacts: extractionArtifacts,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories: this._specs,
      workspaceRoutes: this._workspaceRoutes,
    })
    const existingSpecLock = await args.publication.specRepo.readSpecLock(args.publication.spec)
    const metadata = await args.publication.specRepo.metadata(args.publication.spec)
    const sidecarActive =
      existingSpecLock !== null ||
      this._isStructurallyCompatiblePreparedArtifacts(extractionArtifacts)
    const finalDependsOn = this._resolvePersistedDependsOn({
      manifestDeps: args.change.specDependsOn.get(args.publication.specId),
      extractedDeps: preExtracted.metadata.dependsOn,
      existingSpecLock,
      metadataDeps: metadata?.dependsOn,
    })

    if (
      sidecarActive &&
      preExtracted.metadata.dependsOn !== undefined &&
      !DependsOnOverwriteError.areSame(preExtracted.metadata.dependsOn, finalDependsOn)
    ) {
      throw new ArchiveDependencyMismatchError(
        args.publication.specId,
        [...finalDependsOn],
        [...preExtracted.metadata.dependsOn],
      )
    }

    const publicationSpecLock = sidecarActive
      ? this._buildPublicationSpecLock(
          existingSpecLock,
          args.schema,
          finalDependsOn,
          args.implementationBySpecId.get(args.publication.specId) ?? [],
        )
      : undefined

    return {
      specId: args.publication.specId,
      workspace,
      specPath: SpecPath.parse(capPath),
      spec: args.publication.spec,
      specRepo: args.publication.specRepo,
      writes: args.publication.writes,
      extractionArtifacts,
      existingSpecLock,
      finalDependsOn,
      publicationSpecLock,
      sidecarActive,
    }
  }

  /**
   * Restores canonical storage and rolls lifecycle back after commit-phase failure.
   *
   * @param changeName - Change being archived
   * @param error - Original failure
   * @param actor - Archive actor
   * @param specIds - Batch spec IDs included in the archive attempt
   * @param publishOrder - Publication order for reverse restore
   * @param step - Archive failure step
   */
  private async _handleCommitFailure(
    changeName: string,
    error: unknown,
    actor: ActorIdentity,
    specIds: readonly string[],
    publishOrder: readonly string[],
    step: 'commit' | 'archive',
  ): Promise<never> {
    const restoreResult = await this._batchSnapshot.restoreBatch(specIds, publishOrder)
    const restoreCompleted = restoreResult.failedSpecIds.length === 0
    await this._recordArchiveFailure(changeName, step, error, actor, true)

    if (restoreCompleted) {
      try {
        await this._changes.mutate(changeName, (freshChange) => {
          if (freshChange.state === 'archiving') {
            freshChange.transition('archivable', actor)
          }
          return freshChange
        })
      } catch {
        // Change may already have been moved during archive failure.
      }
      Logger.debug('ArchiveChange lifecycle rollback to archivable', {
        change: changeName,
        restoreCompleted: true,
        restoredSpecIds: restoreResult.restoredSpecIds,
      })
      throw error
    }

    Logger.debug('ArchiveChange partial restore — staying in archiving', {
      change: changeName,
      restoredSpecIds: restoreResult.restoredSpecIds,
      failedSpecIds: restoreResult.failedSpecIds,
    })
    throw new ArchiveBatchRestoreError(restoreResult.restoredSpecIds, restoreResult.failedSpecIds)
  }

  /**
   * Records a failed archive attempt on the still-active change when possible.
   *
   * @param changeName - Active change name
   * @param step - Archive phase that failed
   * @param error - Failure object
   * @param actor - Actor attempting the archive
   * @param commitStarted - Whether permanent archive commit had already begun
   */
  private async _recordArchiveFailure(
    changeName: string,
    step: 'prepare' | 'commit' | 'archive' | 'metadata',
    error: unknown,
    actor: ActorIdentity,
    commitStarted: boolean,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const failureActor = { name: actor.name, email: actor.email } satisfies ActorIdentity
    Logger.debug('ArchiveChange recorded failed archive attempt', {
      change: changeName,
      step,
      commitStarted,
      message,
    })

    try {
      await this._changes.mutate(changeName, (freshChange: Change) => {
        freshChange.recordArchiveFailure(step, message, failureActor, commitStarted)
        return freshChange
      })
    } catch {
      // The active change may already have been moved or be otherwise unavailable.
    }
  }

  /**
   * Resolves the final persisted dependency set for one archived spec.
   *
   * Precedence is: manifest snapshot, existing sidecar, existing metadata,
   * and finally freshly extracted dependencies.
   *
   * @param args - Candidate dependency sources for the spec
   * @param args.manifestDeps - Dependency snapshot already stored on the change
   * @param args.extractedDeps - Dependencies extracted from the final merged artifacts
   * @param args.existingSpecLock - Existing canonical sidecar, when present
   * @param args.metadataDeps - Dependencies currently stored in canonical metadata
   * @returns Final dependency set to persist
   */
  private _resolvePersistedDependsOn(args: {
    readonly manifestDeps: readonly string[] | undefined
    readonly extractedDeps: readonly string[] | undefined
    readonly existingSpecLock: SpecLockData | null
    readonly metadataDeps: readonly string[] | undefined
  }): readonly string[] {
    if (args.manifestDeps !== undefined) {
      return [...args.manifestDeps]
    }
    if (args.existingSpecLock !== null) {
      return [...args.existingSpecLock.dependsOn]
    }
    if (args.metadataDeps !== undefined) {
      return [...args.metadataDeps]
    }
    if (args.extractedDeps !== undefined) {
      return [...args.extractedDeps]
    }
    return []
  }

  /**
   * Builds the final spec-scoped artifact set used for pre-publication extraction.
   *
   * Publication writes override canonical artifacts; untouched artifacts fall
   * back to the current canonical spec content.
   *
   * @param specRepo - Repository owning the target spec
   * @param spec - Spec being archived
   * @param schema - Effective schema for the spec
   * @param publication - Canonical writes prepared for this publication unit
   * @returns Final artifact contents for extraction
   */
  private async _buildFinalSpecArtifactsForExtraction(
    specRepo: SpecRepository,
    spec: Spec,
    schema: Schema,
    publication: readonly PreparedArchiveWrite[],
  ): Promise<readonly MetadataArtifactInput[]> {
    const writesByFilename = new Map(publication.map((write) => [write.outputFilename, write]))
    const artifacts: MetadataArtifactInput[] = []

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue

      const outputFilename = path.basename(artifactType.output)
      const stagedWrite = writesByFilename.get(outputFilename)
      const content =
        stagedWrite?.content ?? (await specRepo.artifact(spec, outputFilename))?.content ?? null
      if (content === null) continue

      artifacts.push({
        artifactId: artifactType.id,
        filename: outputFilename,
        content,
        format: artifactType.format ?? inferFormat(outputFilename) ?? 'plaintext',
      })
    }

    return artifacts
  }

  /**
   * Checks whether the prepared canonical artifact set parses cleanly.
   *
   * This guards opportunistic sidecar creation for legacy specs before any
   * canonical publication occurs.
   *
   * @param artifacts - Final artifact contents prepared for publication
   * @returns `true` when every artifact parses under its declared format
   */
  private _isStructurallyCompatiblePreparedArtifacts(
    artifacts: readonly MetadataArtifactInput[],
  ): boolean {
    try {
      for (const artifact of artifacts) {
        const format = artifact.format ?? inferFormat(artifact.filename) ?? 'plaintext'
        const parser = this._parsers.get(format)
        if (parser === undefined) {
          throw new ParserNotRegisteredError(format, `artifact '${artifact.artifactId}'`)
        }
        parser.parse(artifact.content)
      }
    } catch {
      return false
    }
    return true
  }

  /**
   * Builds the spec-lock payload that will be staged with one spec publication.
   *
   * Existing locks retain their original schema identity; new locks capture the
   * current schema identity for the first archive.
   *
   * @param existingSpecLock - Existing sidecar, when present
   * @param schema - Effective schema driving this archive
   * @param dependsOn - Final dependency set to persist
   * @param implementation - Final materialized implementation links for this spec
   * @returns Sidecar payload to stage with publication
   */
  private _buildPublicationSpecLock(
    existingSpecLock: SpecLockData | null,
    schema: Schema,
    dependsOn: readonly string[],
    implementation: readonly MaterializedImplementationLink[],
  ): SpecLockData {
    if (existingSpecLock !== null) {
      return {
        schema: existingSpecLock.schema,
        dependsOn: [...dependsOn],
        implementation: implementation.map((entry) => ({
          file: entry.file,
          ...(entry.symbols !== undefined ? { symbols: [...entry.symbols] } : {}),
        })),
        ...(existingSpecLock.originalHash !== undefined
          ? { originalHash: existingSpecLock.originalHash }
          : {}),
      }
    }

    return {
      schema: { name: schema.name(), version: schema.version() },
      dependsOn: [...dependsOn],
      implementation: implementation.map((entry) => ({
        file: entry.file,
        ...(entry.symbols !== undefined ? { symbols: [...entry.symbols] } : {}),
      })),
    }
  }

  /**
   * Fails archive when tracked implementation review still has open files.
   *
   * @param change - Change being archived
   * @throws {Error} When one or more tracked implementation files remain open
   */
  private _assertTrackedImplementationFilesResolved(change: Change): void {
    const openFiles = change.trackedImplementationFiles
      .filter((entry) => entry.state === 'open')
      .map((entry) => entry.file)
    if (openFiles.length === 0) return

    throw new ArchiveImplementationStateError(
      openFiles,
      `Tracked implementation files remain open for change "${change.name}". Resolve or ignore them first.`,
    )
  }

  /**
   * Enforces the out-of-scope implementation sidecar guard.
   *
   * @param change - Change being archived
   * @param preparedPlan - Prepared archive plan with implementation sidecar targets
   * @param allowOutOfScope - Whether the explicit override flag was supplied
   * @throws {Error} When out-of-scope implementation sidecar updates are detected without override
   */
  private _assertOutOfScopeImplementationAllowed(
    change: Change,
    preparedPlan: PreparedArchivePlan,
    allowOutOfScope: boolean | undefined,
  ): void {
    if (preparedPlan.outOfScopeImplementationSpecIds.length === 0 || allowOutOfScope === true) {
      return
    }

    throw new ArchiveImplementationStateError(
      [],
      `Implementation sidecar updates would touch specs outside the change "${change.name}" scope (${preparedPlan.outOfScopeImplementationSpecIds.join(', ')}). Re-run with --allow-out-of-scope if intentional.`,
    )
  }

  /**
   * Canonicalizes change-time implementation links into archive-time sidecar entries.
   *
   * @param change - Change being archived
   * @returns Canonical implementation links grouped by owning spec id
   * @throws {Error} When an implementation link targets an unknown workspace or falls outside its codeRoot
   */
  private _materializeImplementationLinks(
    change: Change,
  ): ReadonlyMap<string, readonly MaterializedImplementationLink[]> {
    const bySpecId = new Map<string, MaterializedImplementationLink[]>()

    for (const link of change.implementationLinks) {
      const { workspace } = parseSpecId(link.specId)
      const workspaceConfig = this._workspaceConfigs.get(workspace)
      if (workspaceConfig === undefined) {
        throw new ArchiveImplementationStateError(
          [link.file],
          `Implementation link "${link.specId}" targets unknown workspace "${workspace}".`,
        )
      }

      const rawAbsolute = path.resolve(this._projectRoot, link.file)
      const relativeToCodeRoot = toPortableRelativePath(workspaceConfig.codeRoot, rawAbsolute)
      if (relativeToCodeRoot === null) {
        throw new ArchiveImplementationStateError(
          [link.file],
          `Implementation link "${link.specId}" points outside workspace "${workspace}" codeRoot.`,
        )
      }

      if (matchesWorkspaceExclude(relativeToCodeRoot, workspaceConfig.excludePaths)) {
        Logger.debug('ArchiveChange ignored excluded implementation link during materialization', {
          change: change.name,
          specId: link.specId,
          file: link.file,
          workspace,
        })
        continue
      }

      const entry: MaterializedImplementationLink = {
        file: `${workspace}:${relativeToCodeRoot}`,
        ...(link.symbols !== undefined && link.symbols.length > 0
          ? { symbols: [...link.symbols] }
          : {}),
      }
      const existing = bySpecId.get(link.specId)
      if (existing === undefined) {
        bySpecId.set(link.specId, [entry])
        continue
      }
      existing.push(entry)
    }

    return bySpecId
  }
}

/**
 * Returns whether a tracked archive input filename is delta-backed.
 *
 * @param filename - Change-directory filename
 * @returns `true` when the file lives under `deltas/`
 */
function isDeltaTrackedFilename(filename: string): boolean {
  return filename.startsWith('deltas/')
}

/**
 * Resolves the authoritative filename to archive for a tracked artifact.
 *
 * Preserves validated tracked filenames, while allowing legacy or unvalidated
 * representation mismatches to fall back to the current expected path.
 *
 * @param trackedFile - Tracked artifact file from the change
 * @param expectedFilename - Current expected filename for this artifact
 * @returns Filename to consume during archive
 */
function resolveTrackedArchiveFilename(
  trackedFile: TrackedArchiveFile,
  expectedFilename: string,
): string {
  if (
    trackedFile.validatedHash === undefined &&
    isDeltaTrackedFilename(trackedFile.filename) !== isDeltaTrackedFilename(expectedFilename)
  ) {
    return expectedFilename
  }
  return trackedFile.filename
}

/**
 * Converts an absolute path to a portable path relative to a workspace code root.
 *
 * @param rootDir - Workspace code root
 * @param absolutePath - Absolute file path to convert
 * @returns Portable relative path, or `null` when the file falls outside the root
 */
function toPortableRelativePath(rootDir: string, absolutePath: string): string | null {
  const relative = path.relative(rootDir, absolutePath)
  if (
    relative.length === 0 ||
    relative === '.' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    return null
  }
  return relative.split(path.sep).join('/')
}

/**
 * Checks whether a canonical workspace-relative path is excluded from graph ownership.
 *
 * @param filePath - Workspace-relative file path
 * @param excludePaths - Ignore-style exclusion patterns
 * @returns Whether the file path is excluded
 */
function matchesWorkspaceExclude(filePath: string, excludePaths: readonly string[]): boolean {
  if (excludePaths.length === 0) return false
  const matcher = ignore()
  matcher.add([...excludePaths])
  return matcher.ignores(filePath)
}

/**
 * Builds workspace materialization constraints consumed by `ArchiveChange`.
 *
 * @param workspaces - Project workspaces from config
 * @returns Workspace implementation materialization config keyed by workspace name
 */
export function createArchiveWorkspaceImplementationConfig(
  workspaces: readonly SpecdWorkspaceConfig[],
): ReadonlyMap<string, ArchiveWorkspaceImplementationConfig> {
  return new Map(
    workspaces.map((workspace) => [
      workspace.name,
      {
        codeRoot: workspace.codeRoot,
        excludePaths: workspace.graph?.excludePaths ?? [],
      },
    ]),
  )
}

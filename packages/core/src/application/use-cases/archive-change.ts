import path from 'node:path'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type ActorIdentity, type Change } from '../../domain/entities/change.js'
import { SYSTEM_ACTOR } from '../../domain/entities/change.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { Spec, ABSENT_SPEC_SIDECAR } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { detectSpecOverlap } from '../../domain/services/detect-spec-overlap.js'
import { SpecOverlapError } from '../../domain/errors/spec-overlap-error.js'
import { type OverlapEntry } from '../../domain/value-objects/overlap-entry.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type MaterializeSpecMetadata } from './materialize-spec-metadata.js'
import { applyPersistedSpecStatePatch } from '../../domain/services/apply-persisted-spec-state-patch.js'
import { resolveSealedArchiveDependsOn } from '../services/resolve-sealed-archive-depends-on.js'
import { Logger } from '../logger.js'
import { type ArchiveBatchSnapshotPort } from '../ports/archive-batch-snapshot.js'
import { createNoopArchiveBatchSnapshot } from '../archive-batch-snapshot-noop.js'
import { ArchiveBatchRestoreError } from '../../domain/errors/archive-batch-restore-error.js'
import { ArchiveArtifactMissingError } from '../../domain/errors/archive-artifact-missing-error.js'
import { ArchiveDependencyMismatchError } from '../../domain/errors/archive-dependency-mismatch-error.js'
import { ArchiveImplementationStateError } from '../../domain/errors/archive-implementation-state-error.js'
import { runDepsConsistent } from '../../domain/services/evaluate-transition-predicates.js'
import {
  type CheckBinding,
  type CheckProgressEvent,
  type CheckResult,
  type OnCheckProgress,
} from '../../domain/services/transition-checks.js'
import { throwHookFailed } from '../checks/hook-failed.js'
import {
  buildCheckExecutionContext,
  executeCheckWithProgress,
  executeMatchingPredicates,
} from '../services/execute-matching-predicates.js'
import { collectOutOfScopeImplementationSpecIds } from '../services/detect-impl-links-in-scope.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import { isExcludedByPrefix } from '../services/is-excluded-by-prefix.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'
import { hookFailureMode, matchingEffects } from '../services/execute-hook-effect.js'

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

/** Callback for receiving archive check progress events. */
export type OnArchiveProgress = (event: CheckProgressEvent) => void

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
  readonly persistedSchema: { name: string; version: number } | null
  readonly persistedDependsOn: readonly string[] | null
  readonly persistedImplementation:
    | readonly { readonly file: string; readonly symbols?: readonly string[] }[]
    | null
  readonly finalDependsOn: readonly string[]
  readonly extractedDependsOn: readonly string[] | undefined
  readonly publicationPersistedState:
    | import('../../domain/services/apply-persisted-spec-state-patch.js').PersistedSpecState
    | undefined
  readonly sidecarActive: boolean
}

/** One implementation link after archive-time canonicalization. */
interface MaterializedImplementationLink {
  readonly file: string
  readonly symbols?: readonly string[]
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
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _archive: ArchiveRepository
  private readonly _actor: ActorResolver
  private readonly _parsers: ArtifactParserRegistry
  private readonly _schemaProvider: SchemaProvider
  private readonly _materializeMetadata: MaterializeSpecMetadata
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]
  private readonly _projectRoot: string
  private readonly _batchSnapshot: ArchiveBatchSnapshotPort
  private readonly _archiveBindings: readonly CheckBinding[]
  private readonly _hasher: ContentHasher | undefined

  /**
   * Creates a new `ArchiveChange` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param listWorkspaces - The project orchestrator
   * @param archive - Repository for archiving the change
   * @param archiveBindings - Registry archive checks from composition (`create*` + binding table)
   * @param actor - Resolver for the actor identity
   * @param parsers - Registry of artifact format parsers
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param materializeMetadata - Use case for materializing spec metadata before archive
   * @param extractorTransforms - Shared extractor transform registry for pre-publication extraction
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace spec reference resolution
   * @param projectRoot - Project root used to canonicalize raw implementation paths
   * @param batchSnapshot - Batch canonical snapshot adapter for commit rollback
   * @param hasher - Content hasher for lock-less disk `dependsOn` extraction
   */
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    archive: ArchiveRepository,
    archiveBindings: readonly CheckBinding[],
    actor: ActorResolver,
    parsers: ArtifactParserRegistry,
    schemaProvider: SchemaProvider,
    materializeMetadata: MaterializeSpecMetadata,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
    projectRoot = process.cwd(),
    batchSnapshot: ArchiveBatchSnapshotPort = createNoopArchiveBatchSnapshot(),
    hasher?: ContentHasher,
  ) {
    this._changes = changes
    this._listWorkspaces = listWorkspaces
    this._archive = archive
    this._actor = actor
    this._parsers = parsers
    this._schemaProvider = schemaProvider
    this._materializeMetadata = materializeMetadata
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
    this._projectRoot = projectRoot
    this._batchSnapshot = batchSnapshot
    this._archiveBindings = archiveBindings
    this._hasher = hasher
  }

  /**
   * Executes the archive lifecycle: validates state, runs pre-hooks, merges
   * delta artifacts, archives the change, and runs post-hooks.
   *
   * @param input - Archive parameters
   * @param onProgress - Optional callback for generic check progress events
   * @returns Archive result with the persisted record and any post-hook failures
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   * @throws {InvalidStateTransitionError} If the change is not in `archivable` or `archiving` state
   * @throws {HookFailedError} If a pre-archive `run:` hook exits with a non-zero code
   */
  async execute(
    input: ArchiveChangeInput,
    onProgress?: OnArchiveProgress,
  ): Promise<ArchiveChangeResult> {
    const loadedChange = await this._changes.get(input.name)
    if (loadedChange === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemaProvider.get()

    let change = loadedChange
    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))

    const archiveAttempt = { scope: 'archive' as const }
    const onCheckProgress: OnCheckProgress | undefined =
      onProgress === undefined ? undefined : (event) => onProgress(event)
    const archivePredicates = await executeMatchingPredicates(
      this._archiveBindings,
      buildCheckExecutionContext({
        change,
        schema,
        attempt: archiveAttempt,
        approvals: { spec: false, signoff: false },
        allowOverlap: input.allowOverlap === true,
        allowOutOfScope: input.allowOutOfScope === true,
        ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
      }),
      { failFastOn: 'schema.nameMatch' },
    )
    const failedPredicates = archivePredicates.checks.filter((check) => check.outcome === 'fail')
    const needsOverlapScan =
      failedPredicates.some((check) => check.id === 'spec.overlap') ||
      (failedPredicates.length === 0 && input.allowOverlap === true)
    let others: Change[] = []
    let relevantOverlap: readonly OverlapEntry[] = []
    if (needsOverlapScan) {
      const loaded = await this._loadArchiveOverlap(change)
      others = loaded.others
      relevantOverlap = loaded.relevantOverlap
    }
    const invalidatedChanges: InvalidatedChangesEntry[] = []
    for (const check of failedPredicates) {
      throwMappedArchiveFailure(check, change, schema, relevantOverlap, workspaceMap)
    }
    if (input.allowOverlap === true && relevantOverlap.length > 0) {
      invalidatedChanges.push(
        ...(await this._invalidateOverlappingChanges(change, schema, others, relevantOverlap)),
      )
    }
    Logger.debug('ArchiveChange named archive predicates complete', {
      change: change.name,
      overlapCount: invalidatedChanges.length,
      invalidatedChanges: invalidatedChanges.map((entry) => entry.name),
    })

    const archivingActor = await this._actor.identity()

    // --- before-persist effects (binding phase; not check id) ---
    const skip = input.skipHookPhases ?? new Set<ArchiveHookPhaseSelector>()
    for (const binding of matchingEffects(
      this._archiveBindings,
      archiveAttempt,
      'before-persist',
    )) {
      Logger.debug('ArchiveChange before-persist effects started', {
        change: change.name,
        checkId: binding.check.id,
        skipped: skip.has('all') || skip.has('pre'),
      })
      const ctx = buildCheckExecutionContext({
        change,
        schema,
        attempt: archiveAttempt,
        approvals: { spec: false, signoff: false },
        allowOverlap: input.allowOverlap === true,
        allowOutOfScope: input.allowOutOfScope === true,
        skipHookPhases: [...skip],
        ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
      })
      const result = await executeCheckWithProgress(binding.check, ctx)
      if (result.outcome === 'fail' && hookFailureMode(binding.onFailure) === 'fail-fast') {
        throwHookFailed(result)
      }
      Logger.debug('ArchiveChange before-persist effects completed', {
        change: change.name,
        checkId: binding.check.id,
      })
    }

    let preparedPlan: PreparedArchivePlan
    try {
      preparedPlan = await this._prepareArchivePlan(change, schema, workspaceMap)
      Logger.debug('ArchiveChange prepared archive plan', {
        change: change.name,
        publicationCount: preparedPlan.publications.length,
        staleSpecCount: preparedPlan.staleSpecIds.length,
        outOfScopeImplementationSpecCount: preparedPlan.outOfScopeImplementationSpecIds.length,
      })
    } catch (_error) {
      const message = _error instanceof Error ? _error.message : 'Archive publication failed'
      Logger.debug('ArchiveChange publication preflight failed', {
        code: 'ARCHIVE_PREFLIGHT',
        message,
      })
      await this._recordArchiveFailure(input.name, 'prepare', _error, archivingActor, false)
      throw _error
    }
    let preparedPreflight: readonly PreparedArchivePreflightSpec[]

    try {
      preparedPreflight = await this._prepareArchivePreflight(
        change,
        schema,
        preparedPlan,
        workspaceMap,
      )
      Logger.debug('ArchiveChange completed full-batch archive preflight', {
        change: change.name,
        publicationCount: preparedPreflight.length,
      })
    } catch (_error) {
      const message = _error instanceof Error ? _error.message : 'Archive publication failed'
      Logger.debug('ArchiveChange publication preflight failed', {
        code: 'ARCHIVE_PREFLIGHT',
        message,
      })
      await this._recordArchiveFailure(input.name, 'prepare', _error, archivingActor, false)
      throw _error
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
    } catch (_error) {
      await this._recordArchiveFailure(input.name, 'prepare', _error, archivingActor, false)
      throw _error
    }
    const { change: transitionedChange } = await this._changes.mutate(input.name, (freshChange) => {
      freshChange.assertArchivable()
      if (freshChange.state !== 'archiving') {
        freshChange.transition('archiving', archivingActor)
      }
    })
    change = transitionedChange
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
          implementationCount: publication.publicationPersistedState?.implementation.length ?? 0,
        })
        if (publication.publicationPersistedState !== undefined) {
          await publication.specRepo.publish(publication.spec, {
            artifacts: publication.writes.map(
              (write) => new SpecArtifact(write.outputFilename, write.content),
            ),
            persistedState: publication.publicationPersistedState,
          })
          await this._batchSnapshot.recordCreatedFile(publication.specId, 'spec-lock.json')
        } else {
          for (const write of publication.writes) {
            await publication.specRepo.save(
              publication.spec,
              new SpecArtifact(write.outputFilename, write.content),
            )
          }
        }
        for (const write of publication.writes) {
          await this._batchSnapshot.recordCreatedFile(publication.specId, write.outputFilename)
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
    } catch (_error) {
      return await this._handleCommitFailure(
        input.name,
        _error,
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
    } catch (_error) {
      return await this._handleCommitFailure(
        input.name,
        _error,
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

        Logger.debug('ArchiveChange force materialization started', { change: change.name, specId })
        await this._materializeMetadata.execute({ specId, policy: 'force' })
        Logger.debug('ArchiveChange force materialization completed', {
          change: change.name,
          specId,
        })
        Logger.debug('ArchiveChange metadata generation completed', { change: change.name, specId })
      } catch {
        failedMetadataSpecPaths.push(specId)
        Logger.debug('ArchiveChange metadata generation failed', { change: change.name, specId })
      }
    }

    // --- after-persist effects (binding phase; not check id) ---

    const postHookFailures: string[] = []
    for (const binding of matchingEffects(this._archiveBindings, archiveAttempt, 'after-persist')) {
      Logger.debug('ArchiveChange after-persist effects started', {
        change: change.name,
        checkId: binding.check.id,
      })
      const ctx = buildCheckExecutionContext({
        change,
        schema,
        attempt: archiveAttempt,
        approvals: { spec: false, signoff: false },
        allowOverlap: input.allowOverlap === true,
        allowOutOfScope: input.allowOutOfScope === true,
        skipHookPhases: [...skip],
        ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
      })
      const result = await executeCheckWithProgress(binding.check, ctx)
      if (result.outcome === 'fail') {
        if (hookFailureMode(binding.onFailure) === 'fail-soft') {
          const commands = result.details?.commands
          if (Array.isArray(commands)) {
            postHookFailures.push(
              ...commands.filter((entry): entry is string => typeof entry === 'string'),
            )
          } else {
            const command =
              typeof result.details?.command === 'string' ? result.details.command : 'hook'
            postHookFailures.push(command)
          }
        } else {
          throwHookFailed(result)
        }
      }
      Logger.debug('ArchiveChange after-persist effects completed', {
        change: change.name,
        checkId: binding.check.id,
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
   * Prepares the complete set of permanent spec writes in memory before commit.
   *
   * @param change - Active change being archived
   * @param schema - Resolved active schema
   * @param workspaceMap - Orchestrated workspace map
   * @returns Prepared write plan and metadata-staleness set
   */
  private async _prepareArchivePlan(
    change: Change,
    schema: Schema,
    workspaceMap: Map<string, ProjectWorkspace>,
  ): Promise<PreparedArchivePlan> {
    const writesBySpecId = new Map<string, PreparedArchiveWrite[]>()
    const staleSpecIds = new Set<string>()
    const implementationBySpecId = this._materializeImplementationLinks(change, workspaceMap)
    const publicationSpecIds = new Set<string>([
      ...change.specIds,
      ...implementationBySpecId.keys(),
    ])
    const yamlParser = this._parsers.get('yaml')

    for (const specId of change.specIds) {
      const { workspace, capPath: capabilityPath } = parseSpecId(specId)
      const ws = workspaceMap.get(workspace)
      if (ws === undefined) continue

      const specRepo = ws.specRepo
      const spec = new Spec(
        workspace,
        SpecPath.parse(capabilityPath),
        [],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )

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
      const ws = workspaceMap.get(workspace)
      if (ws === undefined) {
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
        spec: new Spec(
          workspace,
          SpecPath.parse(capabilityPath),
          [],
          ABSENT_SPEC_SIDECAR,
          ABSENT_SPEC_SIDECAR,
        ),
        specRepo: ws.specRepo,
        writes,
      })
    }

    return {
      publications,
      staleSpecIds: [...staleSpecIds],
      implementationBySpecId,
      outOfScopeImplementationSpecIds: collectOutOfScopeImplementationSpecIds(
        implementationBySpecId.keys(),
        change.specIds,
      ),
    }
  }

  /**
   * Executes the full archive-batch preflight before canonical publication.
   *
   * @param change - Active change being archived
   * @param schema - Resolved active schema
   * @param preparedPlan - Prepared archive write plan
   * @param workspaceMap - Orchestrated workspace map
   * @returns Fully preflighted publication units for the commit phase
   */
  private async _prepareArchivePreflight(
    change: Change,
    schema: Schema,
    preparedPlan: PreparedArchivePlan,
    workspaceMap: Map<string, ProjectWorkspace>,
  ): Promise<readonly PreparedArchivePreflightSpec[]> {
    const preflighted: PreparedArchivePreflightSpec[] = []
    for (const publication of preparedPlan.publications) {
      preflighted.push(
        await this._prepareSpecPublicationPreflight({
          change,
          schema,
          publication,
          implementationBySpecId: preparedPlan.implementationBySpecId,
          workspaceMap,
        }),
      )
    }
    this._assertArchiveDepsConsistent(preflighted)
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
   * @param args.workspaceMap - Orchestrated workspace map
   * @returns Preflighted publication state ready for canonical publish
   * @throws {Error} When metadata extraction and persisted dependency state conflict
   */
  private async _prepareSpecPublicationPreflight(args: {
    readonly change: Change
    readonly schema: Schema
    readonly publication: PreparedArchivePublication
    readonly implementationBySpecId: ReadonlyMap<string, readonly MaterializedImplementationLink[]>
    readonly workspaceMap: Map<string, ProjectWorkspace>
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
      repositories: new Map(
        Array.from(args.workspaceMap.values()).map((ws) => [ws.name, ws.specRepo]),
      ),
      workspaceRoutes: this._workspaceRoutes,
    })
    const persistedState = await args.publication.specRepo.readPersistedState(args.publication.spec)
    const persistedSchema = persistedState?.schema ?? null
    const persistedDependsOn = persistedState?.dependsOn ?? null
    const persistedImplementation =
      persistedState?.implementation?.map((entry) => ({
        file: entry.file,
        ...(entry.symbols !== undefined ? { symbols: entry.symbols } : {}),
      })) ?? null

    const sidecarActive =
      persistedSchema !== null ||
      this._isStructurallyCompatiblePreparedArtifacts(extractionArtifacts)
    const finalDependsOn = await resolveSealedArchiveDependsOn({
      change: args.change,
      specId: args.publication.specId,
      specRepo: args.publication.specRepo,
      schema: args.schema,
      persistedDependsOn,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      hasher: this._hasher,
      workspaceRoutes: this._workspaceRoutes,
      repositories: new Map(
        Array.from(args.workspaceMap.values()).map((ws) => [ws.name, ws.specRepo]),
      ),
      ...(preExtracted.metadata.dependsOn !== undefined
        ? { extractedDependsOn: preExtracted.metadata.dependsOn }
        : {}),
    })

    const publicationPersistedSchema = sidecarActive
      ? (persistedSchema ?? { name: args.schema.name(), version: args.schema.version() })
      : undefined
    const publicationPersistedDependsOn = sidecarActive ? [...finalDependsOn] : undefined
    const implementationLinks = args.implementationBySpecId.get(args.publication.specId) ?? []
    const publicationPersistedImplementation = sidecarActive
      ? implementationLinks.map((entry) => ({
          file: entry.file,
          ...(entry.symbols !== undefined ? { symbols: [...entry.symbols] } : {}),
        }))
      : undefined

    const publicationPersistedState =
      sidecarActive && publicationPersistedSchema !== undefined
        ? applyPersistedSpecStatePatch(
            persistedState !== null
              ? { kind: 'existing', state: persistedState }
              : {
                  kind: 'initial',
                  schema: publicationPersistedSchema,
                  dependsOn: publicationPersistedDependsOn ?? [],
                },
            {
              ...(publicationPersistedDependsOn !== undefined
                ? { dependsOn: publicationPersistedDependsOn }
                : {}),
              ...(publicationPersistedImplementation !== undefined
                ? { implementation: publicationPersistedImplementation }
                : {}),
            },
            { specId: args.publication.specId },
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
      persistedSchema,
      persistedDependsOn,
      persistedImplementation,
      finalDependsOn,
      extractedDependsOn: preExtracted.metadata.dependsOn,
      publicationPersistedState,
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
   * Loads other active changes and overlap entries involving `change`.
   *
   * @param change - Change being archived
   * @returns Peer changes and overlap rows that include this change
   */
  private async _loadArchiveOverlap(
    change: Change,
  ): Promise<{ readonly others: Change[]; readonly relevantOverlap: readonly OverlapEntry[] }> {
    const listed = await this._changes.list()
    const others: Change[] = []
    for (const entry of listed.items) {
      if (entry.name === change.name) continue
      const loaded = await this._changes.get(entry.name)
      if (loaded !== null) others.push(loaded)
    }
    const overlapReport =
      others.length > 0 ? detectSpecOverlap([...others, change]) : detectSpecOverlap([change])
    return {
      others,
      relevantOverlap: overlapReport.entries.filter((entry) =>
        entry.changes.some((peer) => peer.name === change.name),
      ),
    }
  }

  /**
   * Invalidates peer changes that overlap the archive target after a skippable overlap check.
   *
   * @param change - Change being archived
   * @param schema - Active schema (for artifact DAG invalidation)
   * @param others - Other loaded active changes
   * @param relevant - Overlap entries that include the archive target
   * @returns Invalidated change names and spec ids
   */
  private async _invalidateOverlappingChanges(
    change: Change,
    schema: Schema,
    others: readonly Change[],
    relevant: readonly OverlapEntry[],
  ): Promise<readonly InvalidatedChangesEntry[]> {
    const invalidatedChanges: InvalidatedChangesEntry[] = []
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
      const affectedArtifacts = others.find((c) => c.name === overlappingName)!.artifacts.values()
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
    return invalidatedChanges
  }

  /**
   * Runs shared `deps.consistent` using sidecar `finalDependsOn`, not manifest-only.
   *
   * @param preflighted - Per-spec extract and resolved persisted deps
   * @throws {ArchiveDependencyMismatchError} When extract disagrees with finalDependsOn
   */
  private _assertArchiveDepsConsistent(preflighted: readonly PreparedArchivePreflightSpec[]): void {
    const extractedDependsOnBySpecId = new Map<string, readonly string[] | undefined>()
    const persistedDependsOnBySpecId = new Map<string, readonly string[] | undefined>()
    for (const spec of preflighted) {
      persistedDependsOnBySpecId.set(spec.specId, spec.finalDependsOn)
      if (spec.sidecarActive && spec.extractedDependsOn !== undefined) {
        extractedDependsOnBySpecId.set(spec.specId, spec.extractedDependsOn)
      }
    }
    const depsCheck = runDepsConsistent({
      extractedDependsOnBySpecId,
      persistedDependsOnBySpecId,
    })
    if (depsCheck.outcome !== 'fail') {
      return
    }
    const specIds = (depsCheck.details?.specIds as string[] | undefined) ?? []
    const specId = specIds[0]
    if (specId === undefined) {
      return
    }
    throw new ArchiveDependencyMismatchError(
      specId,
      [...(persistedDependsOnBySpecId.get(specId) ?? [])],
      [...(extractedDependsOnBySpecId.get(specId) ?? [])],
    )
  }

  /**
   * Canonicalizes change-time implementation links into archive-time sidecar entries.
   *
   * @param change - Change being archived
   * @param workspaceMap - Orchestrated workspace map
   * @returns Canonical implementation links grouped by owning spec id
   * @throws {Error} When an implementation link targets an unknown workspace or falls outside its codeRoot
   */
  private _materializeImplementationLinks(
    change: Change,
    workspaceMap: Map<string, ProjectWorkspace>,
  ): ReadonlyMap<string, readonly MaterializedImplementationLink[]> {
    const bySpecId = new Map<string, MaterializedImplementationLink[]>()

    for (const link of change.implementationLinks) {
      const { workspace } = parseSpecId(link.specId)
      const ws = workspaceMap.get(workspace)
      if (ws === undefined) {
        throw new ArchiveImplementationStateError(
          [link.file],
          `Implementation link "${link.specId}" targets unknown workspace "${workspace}".`,
        )
      }

      const rawAbsolute = path.resolve(this._projectRoot, link.file)
      const relativeToCodeRoot = toPortableRelativePath(ws.codeRoot, rawAbsolute)
      if (relativeToCodeRoot === null) {
        throw new ArchiveImplementationStateError(
          [link.file],
          `Implementation link "${link.specId}" points outside workspace "${workspace}" codeRoot.`,
        )
      }

      const excludePaths = this._listWorkspaces.excludePathsFor(workspace)
      if (isExcludedByPrefix(relativeToCodeRoot, excludePaths)) {
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
 * Maps a failed archive predicate onto the historical typed errors.
 *
 * @param check - Failed check
 * @param change - Change being archived
 * @param schema - Active schema
 * @param overlapEntries - Overlap entries involving this change
 * @param workspaceMap - Workspace ownership map for readOnly errors
 * @throws Typed archive errors matching prior ArchiveChange behavior
 */
function throwMappedArchiveFailure(
  check: CheckResult,
  change: Change,
  schema: Schema,
  overlapEntries: readonly OverlapEntry[],
  workspaceMap: ReadonlyMap<string, ProjectWorkspace>,
): never {
  switch (check.id) {
    case 'schema.nameMatch':
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    case 'archive.archivable':
      change.assertArchivable()
      throw new ArchiveImplementationStateError([], check.message ?? 'Change is not archivable')
    case 'spec.overlap':
      throw new SpecOverlapError(overlapEntries)
    case 'workspace.readOnly': {
      const readOnlySpecs: Array<{ specId: string; workspace: string }> = []
      for (const specId of change.specIds) {
        const workspace = parseSpecId(specId).workspace
        if (workspaceMap.get(workspace)?.ownership === 'readOnly') {
          readOnlySpecs.push({ specId, workspace })
        }
      }
      const lines = readOnlySpecs.map(
        (s) => `  - ${s.specId}  →  workspace "${s.workspace}" (readOnly)`,
      )
      throw new ReadOnlyWorkspaceError(
        `Cannot archive change "${change.name}" — it contains specs from readOnly workspaces:\n\n${lines.join('\n')}\n\nArchiving would write deltas into protected specs.`,
      )
    }
    case 'deps.consistent': {
      const mismatches = Array.isArray(check.details?.mismatches)
        ? (check.details.mismatches as readonly {
            readonly specId: string
            readonly extracted: readonly string[]
            readonly persisted: readonly string[]
          }[])
        : []
      const first = mismatches[0]
      if (first !== undefined) {
        throw new ArchiveDependencyMismatchError(
          first.specId,
          [...first.persisted],
          [...first.extracted],
        )
      }
      const specIds = (check.details?.specIds as string[] | undefined) ?? []
      const specId = specIds[0] ?? ''
      throw new ArchiveDependencyMismatchError(specId, [], [])
    }
    case 'impl.filesResolved': {
      const files = Array.isArray(check.details?.files)
        ? check.details.files.filter((entry): entry is string => typeof entry === 'string')
        : []
      throw new ArchiveImplementationStateError(
        [...files],
        check.message ??
          `Tracked implementation files remain open for change "${change.name}". Resolve or ignore them first.`,
      )
    }
    case 'impl.linksInScope':
      throw new ArchiveImplementationStateError(
        [],
        check.message ??
          `Implementation sidecar updates would touch specs outside the change "${change.name}" scope.`,
      )
    default:
      throw new ArchiveImplementationStateError(
        [],
        check.message ?? `Archive predicate '${check.id}' failed`,
      )
  }
}

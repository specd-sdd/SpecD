import path from 'node:path'
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
import { type SpecLockData } from '../../domain/services/parse-spec-lock.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
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
  readonly writes: readonly PreparedArchiveWrite[]
  readonly staleSpecIds: readonly string[]
}

/** Minimal tracked-file view needed during archive filename resolution. */
interface TrackedArchiveFile {
  readonly filename: string
  readonly validatedHash: string | undefined
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

    // --- Archivable guard + transition to archiving ---
    const archivingActor = await this._actor.identity()
    const change = await this._changes.mutate(input.name, (freshChange) => {
      freshChange.assertArchivable()
      if (freshChange.state !== 'archiving') {
        freshChange.transition('archiving', archivingActor)
      }
      return freshChange
    })

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
            )
            return freshOverlapping
          })
          invalidatedChanges.push({ name: overlappingName, specIds: specsForChange })
        }
      }
    }

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

    // --- Pre-archive hooks (delegated to RunStepHooks) ---
    const skip = input.skipHookPhases ?? new Set<ArchiveHookPhaseSelector>()
    if (!skip.has('all') && !skip.has('pre')) {
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
    }

    let preparedPlan: PreparedArchivePlan
    try {
      preparedPlan = await this._prepareArchivePlan(change, schema)
      Logger.debug('ArchiveChange prepared archive plan', {
        change: change.name,
        writeCount: preparedPlan.writes.length,
        staleSpecCount: preparedPlan.staleSpecIds.length,
      })
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'prepare', error, archivingActor, false)
      throw error
    }

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
      for (const publication of groupArchiveWritesBySpec(preparedPlan.writes)) {
        const firstWrite = publication[0]
        if (firstWrite === undefined) continue
        const { workspace, capPath } = parseSpecId(firstWrite.specId)
        const extractionArtifacts = await this._buildFinalSpecArtifactsForExtraction(
          firstWrite.specRepo,
          firstWrite.spec,
          schema,
          publication,
        )
        const preExtracted = await extractMetadataFromSpecArtifacts({
          effectiveSpecSchema: schema,
          workspace,
          specPath: firstWrite.spec.name,
          artifacts: extractionArtifacts,
          parsers: this._parsers,
          extractorTransforms: this._extractorTransforms,
          repositories: this._specs,
          workspaceRoutes: this._workspaceRoutes,
        })
        const existingSpecLock = await firstWrite.specRepo.readSpecLock(firstWrite.spec)
        const metadata = await firstWrite.specRepo.metadata(firstWrite.spec)
        const canCreateSidecar =
          existingSpecLock !== null ||
          this._isStructurallyCompatiblePreparedArtifacts(extractionArtifacts)
        const finalDependsOn = this._resolvePersistedDependsOn({
          manifestDeps: change.specDependsOn.get(firstWrite.specId),
          extractedDeps: preExtracted.metadata.dependsOn,
          existingSpecLock,
          metadataDeps: metadata?.dependsOn,
        })

        if (
          canCreateSidecar &&
          preExtracted.metadata.dependsOn !== undefined &&
          !DependsOnOverwriteError.areSame(preExtracted.metadata.dependsOn, finalDependsOn)
        ) {
          throw new Error(
            `Extracted dependsOn mismatch for '${firstWrite.specId}': extracted=${JSON.stringify(preExtracted.metadata.dependsOn)} persisted=${JSON.stringify(finalDependsOn)}`,
          )
        }

        const publicationSpecLock = canCreateSidecar
          ? this._buildPublicationSpecLock(existingSpecLock, schema, finalDependsOn)
          : undefined

        Logger.debug('ArchiveChange starting staged spec publication', {
          change: change.name,
          specId: firstWrite.specId,
          artifactCount: publication.length,
        })
        await firstWrite.specRepo.publish(firstWrite.spec, {
          artifacts: publication.map(
            (write) => new SpecArtifact(write.outputFilename, write.content),
          ),
          ...(publicationSpecLock !== undefined ? { specLock: publicationSpecLock } : {}),
        })
        Logger.debug('ArchiveChange completed staged spec publication', {
          change: change.name,
          specId: firstWrite.specId,
          artifactCount: publication.length,
        })
        postPublicationStates.set(firstWrite.specId, {
          workspace,
          specPath: SpecPath.parse(capPath),
          finalDependsOn,
          sidecarActive: publicationSpecLock !== undefined,
        })
      }
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'commit', error, archivingActor, true)
      throw error
    }

    // --- Spec metadata generation + sidecar reconciliation ---
    const failedMetadataSpecPaths: string[] = []

    for (const specId of preparedPlan.staleSpecIds) {
      try {
        const publishedState = postPublicationStates.get(specId)
        if (publishedState === undefined) continue
        const specRepo = this._specs.get(publishedState.workspace)
        if (specRepo === undefined) continue

        const result = await this._generateMetadata.execute({ specId })
        if (!result.hasExtraction || Object.keys(result.metadata).length === 0) {
          failedMetadataSpecPaths.push(specId)
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
      } catch {
        failedMetadataSpecPaths.push(specId)
      }
    }

    // --- Archive ---
    let archivedChange: ArchivedChange
    let archiveDirPath: string
    try {
      const archived = await this._archive.archive(change, {
        actor: archivingActor,
      })
      archivedChange = archived.archivedChange
      archiveDirPath = archived.archiveDirPath
    } catch (error) {
      await this._recordArchiveFailure(input.name, 'archive', error, archivingActor, true)
      throw error
    }

    // --- Post-archive hooks (delegated to RunStepHooks) ---
    const postHookFailures: string[] = []
    if (!skip.has('all') && !skip.has('post')) {
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
    const writes: PreparedArchiveWrite[] = []
    const staleSpecIds = new Set<string>()
    const yamlParser = this._parsers.get('yaml')

    for (const specId of change.specIds) {
      const { workspace, capPath: capabilityPath } = parseSpecId(specId)
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) continue

      const spec = new Spec(workspace, SpecPath.parse(capabilityPath), [])

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
          throw new Error(`Tracked artifact '${trackedFilename}' is missing for '${specId}'`)
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
            throw new Error(`Base artifact '${outputBasename}' is missing for '${specId}'`)
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

      if (change.specDependsOn.get(specId) !== undefined) {
        staleSpecIds.add(specId)
      }
    }

    return { writes, staleSpecIds: [...staleSpecIds] }
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
   * @returns Sidecar payload to stage with publication
   */
  private _buildPublicationSpecLock(
    existingSpecLock: SpecLockData | null,
    schema: Schema,
    dependsOn: readonly string[],
  ): SpecLockData {
    if (existingSpecLock !== null) {
      return {
        schema: existingSpecLock.schema,
        dependsOn: [...dependsOn],
        ...(existingSpecLock.originalHash !== undefined
          ? { originalHash: existingSpecLock.originalHash }
          : {}),
      }
    }

    return {
      schema: { name: schema.name(), version: schema.version() },
      dependsOn: [...dependsOn],
    }
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
 * Groups prepared archive writes by target spec publication unit.
 *
 * Each returned array contains the canonical artifact files that must become
 * visible together for one spec.
 *
 * @param writes - Flat prepared archive writes
 * @returns Publication groups in encounter order
 */
function groupArchiveWritesBySpec(
  writes: readonly PreparedArchiveWrite[],
): readonly (readonly PreparedArchiveWrite[])[] {
  const grouped = new Map<string, PreparedArchiveWrite[]>()

  for (const write of writes) {
    const existing = grouped.get(write.specId)
    if (existing === undefined) {
      grouped.set(write.specId, [write])
      continue
    }
    existing.push(write)
  }

  return [...grouped.values()]
}

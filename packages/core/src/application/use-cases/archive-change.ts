import path from 'node:path'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type GenerateSpecMetadata } from './generate-spec-metadata.js'
import { type SaveSpecMetadata } from './save-spec-metadata.js'
import { type YamlSerializer } from '../ports/yaml-serializer.js'
import { type RunStepHooks } from './run-step-hooks.js'

/** Input for the {@link ArchiveChange} use case. */
export interface ArchiveChangeInput {
  /** The change name to archive. */
  readonly name: string
  /**
   * When `true`, skips all `run:` hook execution. The caller is responsible
   * for invoking hooks separately via `RunStepHooks`.
   *
   * Defaults to `false`.
   */
  readonly skipHooks?: boolean
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
   * Spec paths where `.specd-metadata.yaml` generation failed during this archive
   * (e.g. extraction produced no required fields); empty when all metadata was
   * generated successfully.
   */
  readonly staleMetadataSpecPaths: string[]
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
  private readonly _schemas: SchemaRegistry
  private readonly _generateMetadata: GenerateSpecMetadata
  private readonly _saveMetadata: SaveSpecMetadata
  private readonly _yaml: YamlSerializer
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new `ArchiveChange` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param archive - Repository for archiving the change
   * @param runStepHooks - Use case for executing workflow hooks
   * @param actor - Resolver for the actor identity
   * @param parsers - Registry of artifact format parsers
   * @param schemas - Registry for resolving schema references
   * @param generateMetadata - Use case for deterministic metadata extraction
   * @param saveMetadata - Use case for writing `.specd-metadata.yaml`
   * @param yaml - YAML serializer for metadata content
   * @param schemaRef - Schema reference string (e.g. `"@specd/schema-std"`)
   * @param workspaceSchemasPaths - Map of workspace name to absolute schemas directory path
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    runStepHooks: RunStepHooks,
    actor: ActorResolver,
    parsers: ArtifactParserRegistry,
    schemas: SchemaRegistry,
    generateMetadata: GenerateSpecMetadata,
    saveMetadata: SaveSpecMetadata,
    yaml: YamlSerializer,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._changes = changes
    this._specs = specs
    this._archive = archive
    this._runStepHooks = runStepHooks
    this._actor = actor
    this._parsers = parsers
    this._schemas = schemas
    this._generateMetadata = generateMetadata
    this._saveMetadata = saveMetadata
    this._yaml = yaml
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
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
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(this._schemaRef)

    // --- Schema name guard ---
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    // --- Archivable guard + transition to archiving ---
    change.assertArchivable()
    const archivingActor = await this._actor.identity()
    if (change.state !== 'archiving') {
      change.transition('archiving', archivingActor)
      await this._changes.save(change)
    }

    // --- Pre-archive hooks (delegated to RunStepHooks) ---
    const skipHooks = input.skipHooks ?? false
    if (!skipHooks) {
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

    // --- Delta merge and spec sync ---
    const staleSpecIds = new Set<string>()
    const yamlParser = this._parsers.get('yaml')

    for (const specId of change.specIds) {
      const { workspace, capPath: capabilityPath } = parseSpecId(specId)
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) continue

      const spec = new Spec(workspace, SpecPath.parse(capabilityPath), [])
      let synced = false

      for (const artifactType of schema.artifacts()) {
        if (artifactType.scope !== 'spec') continue

        // Check per-file status for this specId
        const changeArtifact = change.getArtifact(artifactType.id)
        if (changeArtifact === null) continue
        const specFile = changeArtifact.getFile(specId)
        if (
          specFile === undefined ||
          specFile.status === 'missing' ||
          specFile.status === 'skipped'
        )
          continue

        const outputBasename = path.basename(artifactType.output)

        if (artifactType.delta) {
          // Delta artifact: parse and apply delta file onto base spec
          const format = artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'
          const formatParser = this._parsers.get(format)
          if (formatParser === undefined) {
            throw new ParserNotRegisteredError(format, `artifact '${artifactType.id}'`)
          }
          if (yamlParser === undefined) {
            throw new ParserNotRegisteredError('yaml', 'required for delta file parsing')
          }

          const deltaFilename =
            capabilityPath.length > 0
              ? `deltas/${workspace}/${capabilityPath}/${outputBasename}.delta.yaml`
              : `deltas/${workspace}/${outputBasename}.delta.yaml`
          const deltaFile = await this._changes.artifact(change, deltaFilename)
          if (deltaFile === null) continue

          const deltaEntries = yamlParser.parseDelta(deltaFile.content)
          const baseArtifact = await specRepo.artifact(spec, outputBasename)
          const baseContent = baseArtifact?.content ?? ''
          const baseAst = formatParser.parse(baseContent)
          const mergedAst = formatParser.apply(baseAst, deltaEntries)
          const mergedContent = formatParser.serialize(mergedAst)

          await specRepo.save(spec, new SpecArtifact(outputBasename, mergedContent), {
            force: true,
          })
          synced = true
        } else {
          // Non-delta spec-scoped artifact: copy from change dir to spec
          // specFile.filename is the full relative path (e.g. specs/core/retry-policy/spec.md)
          const artifactFile = await this._changes.artifact(change, specFile.filename)
          if (artifactFile === null) continue

          await specRepo.save(spec, new SpecArtifact(outputBasename, artifactFile.content), {
            force: true,
          })
          synced = true
        }
      }

      if (synced) staleSpecIds.add(specId)

      // Specs with manifest-declared dependencies also need metadata regeneration
      // so that dependsOn flows into .specd-metadata.yaml
      if (change.specDependsOn.get(specId) !== undefined) {
        staleSpecIds.add(specId)
      }
    }

    // --- Archive ---
    const { archivedChange, archiveDirPath } = await this._archive.archive(change, {
      actor: archivingActor,
    })

    // --- Post-archive hooks (delegated to RunStepHooks) ---
    const postHookFailures: string[] = []
    if (!skipHooks) {
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

    // --- Spec metadata generation ---
    const failedMetadataSpecPaths: string[] = []

    for (const specId of staleSpecIds) {
      try {
        const result = await this._generateMetadata.execute({ specId })
        if (!result.hasExtraction || Object.keys(result.metadata).length === 0) {
          failedMetadataSpecPaths.push(specId)
          continue
        }

        // Merge manifest dependsOn (highest priority)
        const manifestDeps = change.specDependsOn.get(specId)
        const metadata =
          manifestDeps !== undefined
            ? { ...result.metadata, dependsOn: [...manifestDeps] }
            : result.metadata

        const yamlContent = this._yaml.stringify(metadata)
        const { workspace, capPath } = parseSpecId(specId)
        await this._saveMetadata.execute({
          workspace,
          specPath: SpecPath.parse(capPath),
          content: yamlContent,
          force: true,
        })
      } catch {
        failedMetadataSpecPaths.push(specId)
      }
    }

    return {
      archivedChange,
      archiveDirPath,
      postHookFailures,
      staleMetadataSpecPaths: failedMetadataSpecPaths,
    }
  }
}

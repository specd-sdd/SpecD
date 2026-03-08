import path from 'node:path'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type HookRunner, type HookVariables } from '../ports/hook-runner.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type HookEntry } from '../../domain/value-objects/workflow-step.js'
import { type WorkspaceContext } from '../ports/workspace-context.js'

/** Input for the {@link ArchiveChange} use case. */
export interface ArchiveChangeInput extends WorkspaceContext {
  /** The change name to archive. */
  readonly name: string
  /**
   * Template variable values available to `run:` hook commands.
   * Provided by the caller from the active config and runtime context.
   */
  readonly hookVariables: HookVariables
  /**
   * Project-level hooks for the `archiving` workflow step, resolved by the caller
   * from `specd.yaml`. Schema hooks fire first, then project-level hooks.
   */
  readonly projectHooks?: {
    readonly pre: readonly HookEntry[]
    readonly post: readonly HookEntry[]
  }
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
   * Spec paths whose `.specd-metadata.yaml` should be regenerated because their
   * content was modified during the delta merge step.
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
  private readonly _hooks: HookRunner
  private readonly _git: GitAdapter
  private readonly _parsers: ArtifactParserRegistry
  private readonly _schemas: SchemaRegistry

  /**
   * Creates a new `ArchiveChange` use case instance.
   *
   * @param changes - Repository for loading the change
   * @param specs - Spec repositories keyed by workspace name
   * @param archive - Repository for archiving the change
   * @param hooks - Adapter for executing `run:` hook commands
   * @param git - Git adapter for resolving the actor identity
   * @param parsers - Registry of artifact format parsers
   * @param schemas - Registry for resolving schema references
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    archive: ArchiveRepository,
    hooks: HookRunner,
    git: GitAdapter,
    parsers: ArtifactParserRegistry,
    schemas: SchemaRegistry,
  ) {
    this._changes = changes
    this._specs = specs
    this._archive = archive
    this._hooks = hooks
    this._git = git
    this._parsers = parsers
    this._schemas = schemas
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

    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

    // --- Archivable guard ---
    change.assertArchivable()

    // --- Pre-archive hooks (schema first, then project-level) ---
    const workflowStep = schema.workflowStep('archiving')
    if (workflowStep !== null) {
      for (const hook of workflowStep.hooks.pre) {
        if (hook.type !== 'run') continue
        const result = await this._hooks.run(hook.command, input.hookVariables)
        if (!result.isSuccess()) {
          throw new HookFailedError(hook.command, result.exitCode(), result.stderr())
        }
      }
    }
    if (input.projectHooks !== undefined) {
      for (const hook of input.projectHooks.pre) {
        if (hook.type !== 'run') continue
        const result = await this._hooks.run(hook.command, input.hookVariables)
        if (!result.isSuccess()) {
          throw new HookFailedError(hook.command, result.exitCode(), result.stderr())
        }
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
        if (artifactType.scope() !== 'spec') continue

        const effectiveStatus = change.effectiveStatus(artifactType.id())
        if (effectiveStatus === 'skipped' || effectiveStatus === 'missing') continue

        const outputBasename = path.basename(artifactType.output())

        if (artifactType.delta()) {
          // Delta artifact: parse and apply delta file onto base spec
          const format = artifactType.format() ?? inferFormat(outputBasename) ?? 'plaintext'
          const formatParser = this._parsers.get(format)
          if (formatParser === undefined) {
            throw new ParserNotRegisteredError(format, `artifact '${artifactType.id()}'`)
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
          // The file lives at specs/<workspace>/<capability-path>/<filename> within the change dir
          const artifactFilename =
            capabilityPath.length > 0
              ? `specs/${workspace}/${capabilityPath}/${outputBasename}`
              : `specs/${workspace}/${outputBasename}`
          const artifactFile = await this._changes.artifact(change, artifactFilename)
          if (artifactFile === null) continue

          await specRepo.save(spec, new SpecArtifact(outputBasename, artifactFile.content), {
            force: true,
          })
          synced = true
        }
      }

      if (synced) staleSpecIds.add(specId)
    }

    // --- Archive ---
    let actor: { name: string; email: string } | undefined
    try {
      actor = await this._git.identity()
    } catch {
      // If git identity is unavailable (e.g. no git config), proceed without it
    }
    const { archivedChange, archiveDirPath } = await this._archive.archive(
      change,
      actor !== undefined ? { actor } : undefined,
    )

    // --- Post-archive hooks (schema first, then project-level) ---
    const postHookFailures: string[] = []
    if (workflowStep !== null) {
      for (const hook of workflowStep.hooks.post) {
        if (hook.type !== 'run') continue
        const result = await this._hooks.run(hook.command, input.hookVariables)
        if (!result.isSuccess()) {
          postHookFailures.push(hook.command)
        }
      }
    }
    if (input.projectHooks !== undefined) {
      for (const hook of input.projectHooks.post) {
        if (hook.type !== 'run') continue
        const result = await this._hooks.run(hook.command, input.hookVariables)
        if (!result.isSuccess()) {
          postHookFailures.push(hook.command)
        }
      }
    }

    return {
      archivedChange,
      archiveDirPath,
      postHookFailures,
      staleMetadataSpecPaths: [...staleSpecIds],
    }
  }
}

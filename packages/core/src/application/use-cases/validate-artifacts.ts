import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { DeltaApplicationError } from '../../domain/errors/delta-application-error.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import { type ExtractorTransformRegistry } from '../../domain/services/content-extraction.js'
import {
  type ActorIdentity,
  type SpecApprovedEvent,
  type SignedOffEvent,
} from '../../domain/entities/change.js'
import { type PreHashCleanup } from '../../domain/value-objects/validation-rule.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type MetadataExtractorEntry } from '../../domain/value-objects/metadata-extraction.js'
import { applyPreHashCleanup } from '../../domain/services/pre-hash-cleanup.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { expectedArtifactFilename } from '../../domain/services/artifact-filename.js'
import { evaluateRules } from '../../domain/services/rule-evaluator.js'
import { evaluateCrossArtifactRule } from '../../domain/services/cross-artifact-rule-evaluator.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import {
  extractMetadata,
  type ExtractedMetadata,
  type SubtreeRenderer,
} from '../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../domain/services/selector-matching.js'
import * as path from 'node:path'
import { createExtractorTransformContext } from './_shared/extractor-transform-context.js'
import {
  createSpecReferenceResolver,
  type SpecWorkspaceRoute,
} from './_shared/spec-reference-resolver.js'
import { Logger } from '../logger.js'
import { type ReadyArtifactParticipant } from './_shared/cross-artifact-participant-state.js'

/** Input for the {@link ValidateArtifacts} use case. */
export interface ValidateArtifactsInput {
  /** The change name to validate. */
  readonly name: string
  /**
   * The spec path to validate — must be one of `change.specIds`.
   * Encoded as `<workspace>:<capability-path>` (e.g. `"default:auth/oauth"`).
   */
  readonly specPath: string
  /**
   * When provided, only the artifact with this ID is validated.
   * All other artifacts are skipped and the required-artifacts check is bypassed.
   */
  readonly artifactId?: string
}

/** A single validation failure — missing artifact, failed rule, or application error. */
export interface ValidationFailure {
  /** The artifact type ID this failure pertains to. */
  readonly artifactId: string
  /** Human-readable description suitable for CLI output. */
  readonly description: string
  /** Expected artifact filename when the failure is file-path specific. */
  readonly filename?: string
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface ValidationWarning {
  /** The artifact type ID this warning pertains to. */
  readonly artifactId: string
  /** Human-readable description suitable for CLI output. */
  readonly description: string
}

/** Structured status of the expected file path considered during validation. */
export type ValidationFileStatus = 'validated' | 'missing' | 'skipped'

/** Per-file validation metadata for adapter output. */
export interface ValidationFileResult {
  /** The artifact type ID this file belongs to. */
  readonly artifactId: string
  /** File key (artifact id for scope:change, specId for scope:spec). */
  readonly key: string
  /** Expected filename inside the change directory. */
  readonly filename: string
  /** Validation status for this expected file path. */
  readonly status: ValidationFileStatus
}

/** Result returned by {@link ValidateArtifacts.execute}. */
export interface ValidateArtifactsResult {
  /**
   * `true` only if all required artifacts are present and all validations
   * pass with no errors.
   */
  readonly passed: boolean
  /** One entry per failed rule, missing artifact, or `DeltaApplicationError`. */
  readonly failures: ValidationFailure[]
  /** One entry per `required: false` rule that was absent. */
  readonly warnings: ValidationWarning[]
  /** One entry per expected file considered during validation. */
  readonly files: ValidationFileResult[]
}

/**
 * Validates a change's artifact files against the active schema and marks them
 * complete. The only path through which an artifact may reach `complete` status.
 *
 * Enforces required artifacts, validates structural rules, detects delta
 * conflicts, and invalidates any outstanding approval when artifact content has
 * changed since the approval was recorded.
 */
export class ValidateArtifacts {
  private readonly _changes: ChangeRepository
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry
  private readonly _actor: ActorResolver
  private readonly _hasher: ContentHasher
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]
  private readonly _lifecycle: LifecycleEngine

  /**
   * Creates a new `ValidateArtifacts` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param actor - Resolver for the actor identity
   * @param hasher - Content hasher for computing artifact hashes
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   * @param lifecycle - Shared lifecycle interpreter
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    actor: ActorResolver,
    hasher: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
    lifecycle: LifecycleEngine = new LifecycleEngine(Logger.debug.bind(Logger)),
  ) {
    this._changes = changes
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._actor = actor
    this._hasher = hasher
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
    this._lifecycle = lifecycle
  }

  /**
   * Executes the use case.
   *
   * @param input - Validation parameters
   * @returns Validation result with passed flag, failures, and warnings
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: ValidateArtifactsInput): Promise<ValidateArtifactsResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    if (!change.specIds.includes(input.specPath)) {
      throw new SpecNotInChangeError(input.specPath, input.name)
    }

    const schema = await this._schemaProvider.get()

    // --- Schema name guard ---
    if (schema.name() !== change.schemaName) {
      throw new SchemaMismatchError(change.name, change.schemaName, schema.name())
    }

    // --- Unknown artifact ID guard ---
    if (input.artifactId !== undefined) {
      const known = schema.artifacts().some((a) => a.id === input.artifactId)
      if (!known) {
        return {
          passed: false,
          failures: [
            {
              artifactId: input.artifactId,
              description: `Unknown artifact ID '${input.artifactId}' — not defined in schema '${schema.name()}'`,
            },
          ],
          warnings: [],
          files: [],
        }
      }
    }

    const actor: ActorIdentity = await this._actor.identity()
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    const files: ValidationFileResult[] = []
    const completedValidations: Array<{
      readonly artifactId: string
      readonly fileKey: string
      readonly validatedHash: string
    }> = []
    const readyParticipants = new Map<string, ReadyArtifactParticipant>()
    const specDependsOnUpdates = new Map<string, readonly string[]>()
    const lifecycle = this._lifecycle.evaluate(change, schema)
    const artifactVerdicts = new Map(
      lifecycle.artifacts.map((artifact) => [artifact.type, artifact]),
    )

    Logger.debug('ValidateArtifacts projected lifecycle engine dependency state', {
      change: change.name,
      specPath: input.specPath,
      artifactId: input.artifactId ?? null,
      blockerCodes: lifecycle.blockers.map((blocker) => blocker.code),
    })

    const { workspace, capPath: capabilityPath } = parseSpecId(input.specPath)
    const specRepo = this._specs.get(workspace)
    const existingSpec =
      specRepo !== undefined && capabilityPath.length > 0
        ? await specRepo.get(SpecPath.parse(capabilityPath))
        : null
    const specExists = existingSpec !== null
    let resolveSpecReference: ReturnType<typeof createSpecReferenceResolver> | undefined = undefined
    try {
      resolveSpecReference = createSpecReferenceResolver({
        originWorkspace: workspace,
        originSpecPath: SpecPath.parse(capabilityPath),
        repositories: this._specs,
        workspaceRoutes: this._workspaceRoutes,
      })
    } catch {
      resolveSpecReference = undefined
    }
    const crossRules = schema.crossArtifactValidations()

    // --- Required artifacts check (skipped when artifactId is provided) ---
    if (input.artifactId === undefined) {
      for (const artifactType of schema.artifacts()) {
        if (
          !artifactType.optional &&
          (artifactVerdicts.get(artifactType.id)?.effectiveStatus ?? 'missing') === 'missing'
        ) {
          failures.push({
            artifactId: artifactType.id,
            description: `Required artifact '${artifactType.id}' is missing`,
          })
        }
      }
    }

    // --- Approval invalidation check ---
    const approval: SpecApprovedEvent | undefined = change.activeSpecApproval
    const signoff: SignedOffEvent | undefined = change.activeSignoff
    const driftedFilesByArtifact = new Map<string, Set<string>>()
    if (approval !== undefined || signoff !== undefined) {
      for (const artifactType of schema.artifacts()) {
        const changeArtifact = change.getArtifact(artifactType.id)
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        for (const [fileKey, file] of changeArtifact.files) {
          if (file.status === 'missing' || file.status === 'skipped') continue
          const artifactContent = await this._changes.artifact(change, file.filename)
          if (artifactContent === null) continue
          const cleanedContent = this._applyCleanup(
            artifactContent.content,
            artifactType.preHashCleanup,
          )
          const cleanedHash = this._sha256(cleanedContent)
          const hashKey = `${artifactType.id}:${fileKey}`
          const approvalHash = approval?.artifactHashes[hashKey]
          const signoffHash = signoff?.artifactHashes[hashKey]
          if (
            (approvalHash !== undefined && approvalHash !== cleanedHash) ||
            (signoffHash !== undefined && signoffHash !== cleanedHash)
          ) {
            const keys = driftedFilesByArtifact.get(artifactType.id) ?? new Set<string>()
            keys.add(fileKey)
            driftedFilesByArtifact.set(artifactType.id, keys)
          }
        }
      }
    }

    // --- Per-artifact validation ---
    for (const artifactType of schema.artifacts()) {
      if (input.artifactId !== undefined && artifactType.id !== input.artifactId) continue

      const blockedDep = artifactType.requires
        .map((reqId) => ({
          reqId,
          status: artifactVerdicts.get(reqId)?.effectiveStatus ?? 'missing',
        }))
        .find(({ status }) => status !== 'complete' && status !== 'skipped')
      if (blockedDep !== undefined) {
        const blockedByParent =
          blockedDep.status === 'pending-parent-artifact-review'
            ? (this._lifecycle.findBlockingParent(change, schema, artifactType.id) ??
              this._lifecycle.findBlockingParent(change, schema, blockedDep.reqId))
            : null
        failures.push({
          artifactId: artifactType.id,
          description: this._dependencyBlockedDescription({
            artifactId: artifactType.id,
            dependencyId: blockedDep.reqId,
            dependencyStatus: blockedDep.status,
            blockedByParent,
          }),
        })
        continue
      }

      const fileKey = artifactType.scope === 'change' ? artifactType.id : input.specPath
      const expectedFilename = expectedArtifactFilename({
        artifactType,
        key: fileKey,
        ...(artifactType.scope === 'spec' ? { specExists } : {}),
      })

      const changeArtifact = change.getArtifact(artifactType.id)
      const trackedFile = changeArtifact?.getFile(fileKey)
      const validationFilename = resolveArtifactValidationFilename(trackedFile, expectedFilename)
      if (trackedFile?.status === 'skipped') {
        files.push({
          artifactId: artifactType.id,
          key: fileKey,
          filename: validationFilename,
          status: 'skipped',
        })
        continue
      }

      Logger.debug('ValidateArtifacts selected tracked artifact file', {
        change: change.name,
        artifactId: artifactType.id,
        fileKey,
        trackedFilename: trackedFile?.filename ?? null,
        expectedFilename,
        validationFilename,
      })

      const effectiveFile = await this._changes.artifact(change, validationFilename)
      if (effectiveFile === null) {
        files.push({
          artifactId: artifactType.id,
          key: fileKey,
          filename: validationFilename,
          status: 'missing',
        })
        if (!artifactType.optional) {
          failures.push({
            artifactId: artifactType.id,
            description: `Expected artifact file '${validationFilename}' is missing`,
            filename: validationFilename,
          })
        }
        continue
      }

      files.push({
        artifactId: artifactType.id,
        key: fileKey,
        filename: validationFilename,
        status: 'validated',
      })

      const outputBasename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(outputBasename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      const yamlParser = this._parsers.get('yaml')
      const hasCrossRuleForArtifact = crossRules.some(
        (rule) =>
          rule.participants.some((p) => p.artifact === artifactType.id) &&
          rule.scope === artifactType.scope,
      )
      const shouldApplyDelta =
        artifactType.delta &&
        artifactType.scope === 'spec' &&
        isDeltaTrackedFilename(validationFilename)

      let validationContent: string | null = shouldApplyDelta ? null : effectiveFile.content
      let artifactFailed = false
      let extractedMetadataForArtifact: ExtractedMetadata | undefined

      if (shouldApplyDelta) {
        if (yamlParser !== undefined) {
          const deltaEntries = yamlParser.parseDelta(effectiveFile.content)
          if (deltaEntries.length > 0 && deltaEntries.every((entry) => entry.op === 'no-op')) {
            const cleanedContent = this._applyCleanup(
              effectiveFile.content,
              artifactType.preHashCleanup,
            )
            completedValidations.push({
              artifactId: artifactType.id,
              fileKey,
              validatedHash: this._sha256(cleanedContent),
            })
            continue
          }
        }

        if (artifactType.deltaValidations.length > 0 && yamlParser !== undefined) {
          const deltaAST = yamlParser.parse(effectiveFile.content)
          const result = evaluateRules(
            artifactType.deltaValidations,
            deltaAST.root,
            artifactType.id,
            yamlParser,
          )
          failures.push(...result.failures)
          warnings.push(...result.warnings)
          if (result.failures.length > 0) artifactFailed = true
        }

        if (!artifactFailed && parser !== undefined && yamlParser !== undefined) {
          if (specRepo !== undefined && existingSpec !== null) {
            try {
              const baseArtifact = await specRepo.artifact(existingSpec, outputBasename)
              if (baseArtifact === null) {
                failures.push({
                  artifactId: artifactType.id,
                  description: `Base artifact '${outputBasename}' is missing for spec '${input.specPath}'`,
                  filename: validationFilename,
                })
                artifactFailed = true
              } else {
                const baseAST = parser.parse(baseArtifact.content)
                const deltaEntries = yamlParser.parseDelta(effectiveFile.content)
                const mergedResult = parser.apply(baseAST, deltaEntries)
                const mergedAST = mergedResult.ast
                validationContent = parser.serialize(mergedAST)
                for (const w of mergedResult.warnings) {
                  warnings.push({ artifactId: artifactType.id, description: w })
                }
              }
            } catch (err) {
              if (err instanceof DeltaApplicationError) {
                failures.push({
                  artifactId: artifactType.id,
                  description: `Delta application failed: ${err.message}`,
                  filename: validationFilename,
                })
                artifactFailed = true
              } else {
                throw err
              }
            }
          } else {
            failures.push({
              artifactId: artifactType.id,
              description: `Cannot apply delta for '${input.specPath}' because the base spec is unavailable`,
              filename: validationFilename,
            })
            artifactFailed = true
          }
        }
      }

      if (validationContent === null) {
        continue
      }
      let localAstRoot: SelectorNode | undefined

      // --- Structural validation ---
      if (!artifactFailed && artifactType.validations.length > 0 && parser !== undefined) {
        const ast = parser.parse(validationContent)
        localAstRoot = ast.root
        const result = evaluateRules(artifactType.validations, ast.root, artifactType.id, parser)
        failures.push(...result.failures)
        warnings.push(...result.warnings)
        if (result.failures.length > 0) artifactFailed = true
      }

      if (
        !artifactFailed &&
        parser !== undefined &&
        localAstRoot === undefined &&
        hasCrossRuleForArtifact
      ) {
        localAstRoot = parser.parse(validationContent).root
      }

      // --- MetadataExtraction validation ---
      if (!artifactFailed) {
        const extraction = schema.metadataExtraction()
        if (extraction !== undefined) {
          const hasExtractionRules = Object.values(extraction).some((entry) => {
            if (entry === undefined) return false
            if (Array.isArray(entry)) {
              return entry.some((e: MetadataExtractorEntry) => e.artifact === artifactType.id)
            }
            return (entry as MetadataExtractorEntry).artifact === artifactType.id
          })

          if (hasExtractionRules && parser !== undefined) {
            try {
              const astsByArtifact = new Map<string, { root: SelectorNode }>()
              const renderers = new Map<string, SubtreeRenderer>()
              const transformContexts = new Map<
                string,
                ReturnType<typeof createExtractorTransformContext>
              >()
              const ast = parser.parse(validationContent)
              astsByArtifact.set(artifactType.id, ast)
              renderers.set(artifactType.id, parser as SubtreeRenderer)
              transformContexts.set(
                artifactType.id,
                createExtractorTransformContext(
                  input.specPath.split(':')[0] ?? 'default',
                  input.specPath.includes(':')
                    ? input.specPath.slice(input.specPath.indexOf(':') + 1)
                    : input.specPath,
                  artifactType.id,
                  path.basename(expectedFilename),
                  {
                    ...(resolveSpecReference !== undefined ? { resolveSpecReference } : {}),
                  },
                ),
              )

              const extracted = await extractMetadata(
                extraction,
                astsByArtifact,
                renderers,
                this._extractorTransforms,
                transformContexts,
                artifactType.id,
              )
              extractedMetadataForArtifact = extracted

              const { permissiveSpecMetadataSchema } =
                await import('../../domain/services/parse-metadata.js')
              const validationResult = permissiveSpecMetadataSchema.safeParse(extracted)
              if (!validationResult.success) {
                failures.push({
                  artifactId: artifactType.id,
                  description: `MetadataExtraction validation failed: ${validationResult.error.message}`,
                  filename: validationFilename,
                })
                artifactFailed = true
              }
            } catch (err) {
              failures.push({
                artifactId: artifactType.id,
                description: `MetadataExtraction validation failed: ${(err as Error).message}`,
                filename: validationFilename,
              })
              artifactFailed = true
            }
          }
        }
      }

      if (!artifactFailed && parser !== undefined && localAstRoot !== undefined) {
        readyParticipants.set(artifactType.id, {
          artifactId: artifactType.id,
          key: fileKey,
          scope: artifactType.scope,
          root: localAstRoot,
          parser,
          filename: validationFilename,
        })
      }

      // --- Mark complete ---
      if (!artifactFailed) {
        const contentToHash = shouldApplyDelta ? effectiveFile.content : validationContent
        const cleanedContent = this._applyCleanup(contentToHash, artifactType.preHashCleanup)
        completedValidations.push({
          artifactId: artifactType.id,
          fileKey,
          validatedHash: this._sha256(cleanedContent),
        })

        const deps = extractedMetadataForArtifact?.dependsOn
        if (deps !== undefined && deps.length > 0) {
          specDependsOnUpdates.set(input.specPath, deps)
        }
      }
    }

    for (const rule of crossRules) {
      if (
        input.artifactId !== undefined &&
        !rule.participants.some((p) => p.artifact === input.artifactId)
      ) {
        continue
      }
      const participantInputs = new Map()
      let deferred = false
      for (const participant of rule.participants) {
        const ready = readyParticipants.get(participant.artifact)
        if (ready === undefined || ready.scope !== rule.scope) {
          deferred = true
          break
        }
        participantInputs.set(participant.as, {
          artifactId: ready.artifactId,
          root: ready.root,
          parser: ready.parser,
        })
      }
      if (deferred) {
        warnings.push({
          artifactId: rule.participants[0]?.artifact ?? 'unknown',
          description: `Deferred cross-artifact rule '${rule.id}': participants not ready`,
        })
        continue
      }
      const result = evaluateCrossArtifactRule({
        rule,
        participants: participantInputs,
      })
      failures.push(
        ...result.failures.map((f) => ({ artifactId: f.artifactId, description: f.description })),
      )
      warnings.push(
        ...result.warnings.map((w) => ({ artifactId: w.artifactId, description: w.description })),
      )
    }

    if (
      driftedFilesByArtifact.size > 0 ||
      completedValidations.length > 0 ||
      specDependsOnUpdates.size > 0
    ) {
      await this._changes.mutate(input.name, (freshChange) => {
        if (driftedFilesByArtifact.size > 0) {
          const affectedArtifacts = [...driftedFilesByArtifact.entries()].map(([type, files]) => ({
            type,
            files: [...files].sort(),
          }))
          freshChange.invalidate(
            'artifact-drift',
            actor,
            `Invalidated because validated artifacts drifted: ${affectedArtifacts
              .map((artifact) => `${artifact.type} [${artifact.files.join(', ')}]`)
              .join('; ')}`,
            affectedArtifacts,
          )
        }

        for (const completed of completedValidations) {
          const artifact = freshChange.getArtifact(completed.artifactId)
          artifact?.markComplete(completed.fileKey, completed.validatedHash)
        }

        for (const [specId, deps] of specDependsOnUpdates) {
          freshChange.setSpecDependsOn(specId, deps)
        }
      })
    }

    return { passed: failures.length === 0, failures, warnings, files }
  }

  /**
   * Computes a content hash of the given string.
   *
   * @param content - The content to hash
   * @returns A hash string in `algorithm:hex` format
   */
  private _sha256(content: string): string {
    return this._hasher.hash(content)
  }

  /**
   * Applies a sequence of pre-hash cleanup rules to the content string.
   *
   * @param content - The content to clean
   * @param cleanups - The cleanup rules to apply in order
   * @returns The cleaned content string
   */
  private _applyCleanup(content: string, cleanups: readonly PreHashCleanup[]): string {
    return applyPreHashCleanup(content, cleanups)
  }

  /**
   * Builds a status-aware dependency-blocked failure description for validation.
   *
   * @param args - Dependency blocker context.
   * @param args.artifactId - Artifact currently being validated.
   * @param args.dependencyId - Dependency artifact that blocks validation.
   * @param args.dependencyStatus - Effective status of the blocking dependency.
   * @param args.blockedByParent - Optional parent artifact context for recursive review blockers.
   * @returns Human-readable failure description
   */
  private _dependencyBlockedDescription(args: {
    readonly artifactId: string
    readonly dependencyId: string
    readonly dependencyStatus: ArtifactStatus
    readonly blockedByParent: {
      readonly artifactId: string
      readonly status: ArtifactStatus
    } | null
  }): string {
    const base = `Artifact '${args.artifactId}'`
    const dependency = `'${args.dependencyId}'`
    switch (args.dependencyStatus) {
      case 'pending-parent-artifact-review': {
        if (args.blockedByParent !== null) {
          return `${base} is blocked by review of dependency ${dependency} [status: pending-parent-artifact-review, parent: '${args.blockedByParent.artifactId}' (${args.blockedByParent.status})]`
        }
        return `${base} is blocked by review of dependency ${dependency} [status: pending-parent-artifact-review]`
      }
      case 'pending-review':
      case 'drifted-pending-review':
        return `${base} is blocked by dependency ${dependency} requiring review [status: ${args.dependencyStatus}]`
      case 'missing':
      case 'in-progress':
        return `${base} is blocked by incomplete dependency ${dependency} [status: ${args.dependencyStatus}]`
      default:
        return `${base} is blocked by dependency ${dependency} [status: ${args.dependencyStatus}]`
    }
  }
}

/** Minimal tracked-file view needed during validation filename resolution. */
interface TrackedValidationFile {
  readonly filename: string
  readonly validatedHash: string | undefined
}

/**
 * Returns whether a tracked change-artifact filename is delta-backed.
 *
 * @param filename - Change-directory filename under validation
 * @returns `true` when the tracked file lives under `deltas/`
 */
function isDeltaTrackedFilename(filename: string): boolean {
  return filename.startsWith('deltas/')
}

/**
 * Resolves the authoritative filename to validate for an artifact.
 *
 * Preserves tracked filenames once validated, but still repairs legacy or
 * unvalidated representation-class mismatches back to the current expected path.
 *
 * @param trackedFile - Tracked artifact file from the change, when present
 * @param expectedFilename - Current schema-derived expected filename
 * @returns Filename to validate
 */
function resolveArtifactValidationFilename(
  trackedFile: TrackedValidationFile | undefined,
  expectedFilename: string,
): string {
  if (trackedFile === undefined) return expectedFilename
  if (
    trackedFile.validatedHash === undefined &&
    isDeltaTrackedFilename(trackedFile.filename) !== isDeltaTrackedFilename(expectedFilename)
  ) {
    return expectedFilename
  }
  return trackedFile.filename
}

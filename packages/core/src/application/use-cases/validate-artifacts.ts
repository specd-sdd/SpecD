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
import { type MetadataExtractorEntry } from '../../domain/value-objects/metadata-extraction.js'
import { applyPreHashCleanup } from '../../domain/services/pre-hash-cleanup.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { evaluateRules } from '../../domain/services/rule-evaluator.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { extractMetadata, type SubtreeRenderer } from '../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../domain/services/selector-matching.js'
import * as path from 'node:path'
import { createExtractorTransformContext } from './_shared/extractor-transform-context.js'

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
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface ValidationWarning {
  /** The artifact type ID this warning pertains to. */
  readonly artifactId: string
  /** Human-readable description suitable for CLI output. */
  readonly description: string
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
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    actor: ActorResolver,
    hasher: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
  ) {
    this._changes = changes
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._actor = actor
    this._hasher = hasher
    this._extractorTransforms = extractorTransforms
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
        }
      }
    }

    const actor: ActorIdentity = await this._actor.identity()
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    const completedValidations: Array<{
      readonly artifactId: string
      readonly fileKey: string
      readonly validatedHash: string
    }> = []
    const specDependsOnUpdates = new Map<string, readonly string[]>()

    const { workspace, capPath: capabilityPath } = parseSpecId(input.specPath)
    const specRepo = this._specs.get(workspace)

    // --- Required artifacts check (skipped when artifactId is provided) ---
    if (input.artifactId === undefined) {
      for (const artifactType of schema.artifacts()) {
        if (!artifactType.optional && change.effectiveStatus(artifactType.id) === 'missing') {
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
          const diskPath = this._resolveFilePath(file.filename)
          const artifactContent = await this._changes.artifact(change, diskPath)
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
      const effectiveStatus = change.effectiveStatus(artifactType.id)
      if (effectiveStatus === 'skipped' || effectiveStatus === 'missing') continue

      const blockedBy = artifactType.requires.find((reqId) => {
        const depStatus = change.effectiveStatus(reqId)
        return depStatus !== 'complete' && depStatus !== 'skipped'
      })
      if (blockedBy !== undefined) {
        failures.push({
          artifactId: artifactType.id,
          description: `Artifact '${artifactType.id}' is blocked by incomplete dependency '${blockedBy}'`,
        })
        continue
      }

      const changeArtifact = change.getArtifact(artifactType.id)
      if (changeArtifact === null) continue

      // Determine which file(s) to validate for this specPath
      const fileKey = artifactType.scope === 'change' ? artifactType.id : input.specPath
      const file = changeArtifact.getFile(fileKey)
      if (file === undefined || file.status === 'missing' || file.status === 'skipped') continue

      // Detect whether the tracked file is a delta or a primary artifact.
      // When the repo resolved a delta path (e.g. deltas/.../spec.md.delta.yaml),
      // the filename ends with .delta.yaml — in that case, read it as the delta file
      // directly rather than looking for a separate delta alongside a primary.
      const isDeltaFile = file.filename.endsWith('.delta.yaml')
      const outputBasename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(outputBasename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      const yamlParser = this._parsers.get('yaml')

      let validationContent: string | null = null
      let artifactFailed = false
      let extractedMetadataForArtifact: ReturnType<typeof extractMetadata> | undefined

      // --- Delta processing ---
      if (artifactType.delta) {
        // Resolve the delta file — either the tracked file IS the delta, or look for it alongside
        let deltaFile: SpecArtifact | null = null
        if (isDeltaFile) {
          deltaFile = await this._changes.artifact(change, file.filename)
        } else {
          const fileBasename = path.basename(file.filename)
          const deltaFilename =
            capabilityPath.length > 0
              ? `deltas/${workspace}/${capabilityPath}/${fileBasename}.delta.yaml`
              : `deltas/${workspace}/${fileBasename}.delta.yaml`
          deltaFile = await this._changes.artifact(change, deltaFilename)
        }

        if (deltaFile !== null) {
          // --- No-op bypass ---
          // If the delta contains only no-op entries, skip deltaValidations,
          // delta application, and structural validation. Go straight to markComplete.
          if (yamlParser !== undefined) {
            const deltaEntries = yamlParser.parseDelta(deltaFile.content)
            if (deltaEntries.length > 0 && deltaEntries.every((e) => e.op === 'no-op')) {
              const cleanedContent = this._applyCleanup(
                deltaFile.content,
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
            const deltaAST = yamlParser.parse(deltaFile.content)
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
            if (specRepo !== undefined && capabilityPath.length > 0) {
              try {
                const specPath = SpecPath.parse(capabilityPath)
                const spec = await specRepo.get(specPath)
                if (spec !== null) {
                  const actualBasename = isDeltaFile
                    ? path.basename(file.filename).replace(/\.delta\.yaml$/, '')
                    : path.basename(file.filename)
                  const baseArtifact = await specRepo.artifact(spec, actualBasename)
                  if (baseArtifact !== null) {
                    const baseAST = parser.parse(baseArtifact.content)
                    const deltaEntries = yamlParser.parseDelta(deltaFile.content)
                    const mergedAST = parser.apply(baseAST, deltaEntries)
                    validationContent = parser.serialize(mergedAST)
                  }
                }
              } catch (err) {
                if (err instanceof DeltaApplicationError) {
                  failures.push({
                    artifactId: artifactType.id,
                    description: `Delta application failed: ${err.message}`,
                  })
                  artifactFailed = true
                } else {
                  throw err
                }
              }
            }
          }
        }
      }

      // For non-delta artifacts or when no delta was found, read the primary file
      if (validationContent === null && !isDeltaFile) {
        const primaryFile = await this._changes.artifact(change, file.filename)
        if (primaryFile !== null) {
          validationContent = primaryFile.content
        }
      }

      // Nothing to validate — skip
      if (validationContent === null) continue

      // --- Structural validation ---
      if (!artifactFailed && artifactType.validations.length > 0 && parser !== undefined) {
        const ast = parser.parse(validationContent)
        const result = evaluateRules(artifactType.validations, ast.root, artifactType.id, parser)
        failures.push(...result.failures)
        warnings.push(...result.warnings)
        if (result.failures.length > 0) artifactFailed = true
      }

      // --- MetadataExtraction validation ---
      if (!artifactFailed) {
        const extraction = schema.metadataExtraction()
        if (extraction !== undefined) {
          // Check if this artifact has any extraction rules targeting it
          const hasExtractionRules = Object.values(extraction).some((entry) => {
            if (entry === undefined) return false
            if (Array.isArray(entry)) {
              return entry.some((e: MetadataExtractorEntry) => e.artifact === artifactType.id)
            }
            return (entry as MetadataExtractorEntry).artifact === artifactType.id
          })

          if (!hasExtractionRules) {
            // No extraction rules for this artifact, skip
          } else if (parser !== undefined) {
            try {
              const astsByArtifact = new Map<string, { root: SelectorNode }>()
              const renderers = new Map<string, SubtreeRenderer>()
              const transformContexts = new Map()
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
                  path.basename(file.filename),
                ),
              )

              const extracted = extractMetadata(
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
                })
                artifactFailed = true
              }
            } catch (err) {
              failures.push({
                artifactId: artifactType.id,
                description: `MetadataExtraction validation failed: ${(err as Error).message}`,
              })
              artifactFailed = true
            }
          }
        }
      }

      // --- Mark complete ---
      if (!artifactFailed) {
        // For delta files, hash the raw delta content (what's on disk) so that
        // _deriveFileStatus can compare against it. For primary files, hash the
        // validation content (which may be merged or cleaned).
        const rawFile = await this._changes.artifact(change, file.filename)
        const contentToHash = rawFile !== null ? rawFile.content : validationContent
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

    return { passed: failures.length === 0, failures, warnings }
  }

  /**
   * Returns the on-disk filename (relative to change dir) for a file within
   * an artifact. For scope:change this is the basename (e.g. `"proposal.md"`);
   * for scope:spec this is the full relative path computed by `syncArtifacts`
   * (e.g. `"specs/core/retry-policy/spec.md"`).
   *
   * @param filename - The filename stored on the `ArtifactFile`
   * @returns Relative path within the change directory
   */
  private _resolveFilePath(filename: string): string {
    return filename
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
}

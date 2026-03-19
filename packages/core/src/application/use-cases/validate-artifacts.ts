import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../errors/schema-mismatch-error.js'
import { SpecNotInChangeError } from '../errors/spec-not-in-change-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { DeltaApplicationError } from '../../domain/errors/delta-application-error.js'
import { type ActorResolver } from '../ports/actor-resolver.js'
import {
  type ActorIdentity,
  type SpecApprovedEvent,
  type SignedOffEvent,
} from '../../domain/entities/change.js'
import { type PreHashCleanup } from '../../domain/value-objects/validation-rule.js'
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
  private readonly _schemas: SchemaRegistry
  private readonly _parsers: ArtifactParserRegistry
  private readonly _actor: ActorResolver
  private readonly _hasher: ContentHasher
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new `ValidateArtifacts` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param parsers - Registry of artifact format parsers
   * @param actor - Resolver for the actor identity
   * @param hasher - Content hasher for computing artifact hashes
   * @param schemaRef - Schema reference string (e.g. `"@specd/schema-std"`)
   * @param workspaceSchemasPaths - Map of workspace name to absolute schemas directory path
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    parsers: ArtifactParserRegistry,
    actor: ActorResolver,
    hasher: ContentHasher,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemas = schemas
    this._parsers = parsers
    this._actor = actor
    this._hasher = hasher
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
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

    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(this._schemaRef)

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
    if (approval !== undefined || signoff !== undefined) {
      let invalidated = false
      for (const artifactType of schema.artifacts()) {
        if (invalidated) break
        const changeArtifact = change.getArtifact(artifactType.id)
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        for (const [fileKey, file] of changeArtifact.files) {
          if (invalidated) break
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
            change.invalidate('artifact-change', actor)
            invalidated = true
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

      // --- Mark complete ---
      if (!artifactFailed) {
        // For delta files, hash the raw delta content (what's on disk) so that
        // _deriveFileStatus can compare against it. For primary files, hash the
        // validation content (which may be merged or cleaned).
        const rawFile = await this._changes.artifact(change, file.filename)
        const contentToHash = rawFile !== null ? rawFile.content : validationContent
        const cleanedContent = this._applyCleanup(contentToHash, artifactType.preHashCleanup)
        changeArtifact.markComplete(fileKey, this._sha256(cleanedContent))

        // --- Extract dependsOn from validated content ---
        if (artifactType.scope === 'spec') {
          const extraction = schema.metadataExtraction()
          if (
            extraction?.dependsOn !== undefined &&
            extraction.dependsOn.artifact === artifactType.id
          ) {
            const deps = await this._extractDependsOn(
              validationContent,
              artifactType,
              extraction,
              input.specPath,
            )
            if (deps !== undefined && deps.length > 0) {
              change.setSpecDependsOn(input.specPath, deps)
            }
          }
        }
      }
    }

    await this._changes.save(change)
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
   * Extracts `dependsOn` spec IDs from validated artifact content using
   * the schema's `metadataExtraction` declarations.
   *
   * The content is already merged (base + delta) for delta artifacts, so
   * dependencies from both the original spec and the delta are captured.
   *
   * @param content - The validated (possibly merged) artifact content
   * @param artifactType - The artifact type being validated
   * @param artifactType.id - The artifact type identifier
   * @param artifactType.format - The declared file format, or undefined
   * @param extraction - The schema's metadataExtraction declarations
   * @param specPath - The specId being validated (for path resolution)
   * @returns Resolved spec IDs, or undefined if extraction yields nothing
   */
  private async _extractDependsOn(
    content: string,
    artifactType: { id: string; format?: string | undefined },
    extraction: import('../../domain/value-objects/metadata-extraction.js').MetadataExtraction,
    specPath: string,
  ): Promise<string[] | undefined> {
    const format = artifactType.format ?? inferFormat(path.basename(artifactType.id)) ?? 'plaintext'
    const parser = this._parsers.get(format)
    if (parser === undefined) return undefined

    const ast = parser.parse(content)
    const astsByArtifact = new Map<string, { root: SelectorNode }>([[artifactType.id, ast]])
    const renderers = new Map<string, SubtreeRenderer>([
      [artifactType.id, parser as SubtreeRenderer],
    ])

    const extracted = extractMetadata(extraction, astsByArtifact, renderers)
    if (extracted.dependsOn === undefined || extracted.dependsOn.length === 0) return undefined

    // Resolve raw paths (e.g. relative markdown links) to full specIds
    const { workspace, capPath } = parseSpecId(specPath)
    const specRepo = this._specs.get(workspace)
    if (specRepo === undefined) return extracted.dependsOn

    const resolved: string[] = []
    for (const raw of extracted.dependsOn) {
      const result = await specRepo.resolveFromPath(raw, SpecPath.parse(capPath))
      if (result === null) continue
      if ('specId' in result) {
        resolved.push(result.specId)
      } else {
        // Cross-workspace hint — try other repos
        const hint = result.crossWorkspaceHint.join('/')
        for (const [, otherRepo] of this._specs) {
          if (otherRepo === specRepo) continue
          const found = await otherRepo.get(SpecPath.parse(hint))
          if (found !== null) {
            resolved.push(otherRepo.workspace() + ':' + hint)
            break
          }
        }
      }
    }

    return resolved.length > 0 ? resolved : undefined
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

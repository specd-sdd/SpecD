import { createHash } from 'node:crypto'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArtifactParserRegistry, DeltaApplicationError } from '../ports/artifact-parser.js'
import { type GitAdapter } from '../ports/git-adapter.js'
import {
  type GitIdentity,
  type SpecApprovedEvent,
  type SignedOffEvent,
} from '../../domain/entities/change.js'
import { type PreHashCleanup } from '../../domain/value-objects/validation-rule.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { evaluateRules } from '../../domain/services/rule-evaluator.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type WorkspaceContext } from '../ports/workspace-context.js'

/** Input for the {@link ValidateArtifacts} use case. */
export interface ValidateArtifactsInput extends WorkspaceContext {
  /** The change name to validate. */
  readonly name: string
  /**
   * The spec path to validate — must be one of `change.specIds`.
   * Encoded as `<workspace>/<capability-path>` (e.g. `"default/auth/oauth"`).
   */
  readonly specPath: string
}

/** A single validation failure — missing artifact, failed rule, or application error. */
export interface ValidationFailure {
  /** The artifact type ID this failure pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** A non-fatal rule mismatch (`required: false` rule that was absent). */
export interface ValidationWarning {
  /** The artifact type ID this warning pertains to. */
  artifactId: string
  /** Human-readable description suitable for CLI output. */
  description: string
}

/** Result returned by {@link ValidateArtifacts.execute}. */
export interface ValidateArtifactsResult {
  /**
   * `true` only if all required artifacts are present and all validations
   * pass with no errors.
   */
  passed: boolean
  /** One entry per failed rule, missing artifact, or `DeltaApplicationError`. */
  failures: ValidationFailure[]
  /** One entry per `required: false` rule that was absent. */
  warnings: ValidationWarning[]
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
  private readonly _git: GitAdapter

  /**
   * Creates a new `ValidateArtifacts` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param specs - Spec repositories keyed by workspace name
   * @param schemas - Registry for resolving schema references
   * @param parsers - Registry of artifact format parsers
   * @param git - Adapter for resolving the actor identity
   */
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    parsers: ArtifactParserRegistry,
    git: GitAdapter,
  ) {
    this._changes = changes
    this._specs = specs
    this._schemas = schemas
    this._parsers = parsers
    this._git = git
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

    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

    const actor: GitIdentity = await this._git.identity()
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []

    const slashIdx = input.specPath.indexOf('/')
    const workspace = slashIdx >= 0 ? input.specPath.slice(0, slashIdx) : input.specPath
    const capabilityPath = slashIdx >= 0 ? input.specPath.slice(slashIdx + 1) : ''
    const specRepo = this._specs.get(workspace)

    // --- Required artifacts check ---
    for (const artifactType of schema.artifacts()) {
      if (!artifactType.optional() && change.effectiveStatus(artifactType.id()) === 'missing') {
        failures.push({
          artifactId: artifactType.id(),
          description: `Required artifact '${artifactType.id()}' is missing`,
        })
      }
    }

    // --- Approval invalidation check ---
    const approval: SpecApprovedEvent | undefined = change.activeSpecApproval
    const signoff: SignedOffEvent | undefined = change.activeSignoff
    if (approval !== undefined || signoff !== undefined) {
      let invalidated = false
      for (const artifactType of schema.artifacts()) {
        if (invalidated) break
        const changeArtifact = change.getArtifact(artifactType.id())
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        const artifactFile = await this._changes.artifact(change, changeArtifact.filename)
        if (artifactFile === null) continue
        const cleanedContent = this._applyCleanup(
          artifactFile.content,
          artifactType.preHashCleanup(),
        )
        const cleanedHash = this._sha256(cleanedContent)
        const approvalHash = approval?.artifactHashes[artifactType.id()]
        const signoffHash = signoff?.artifactHashes[artifactType.id()]
        if (
          (approvalHash !== undefined && approvalHash !== cleanedHash) ||
          (signoffHash !== undefined && signoffHash !== cleanedHash)
        ) {
          change.invalidate('artifact-change', actor)
          invalidated = true
        }
      }
    }

    // --- Per-artifact validation ---
    for (const artifactType of schema.artifacts()) {
      const effectiveStatus = change.effectiveStatus(artifactType.id())
      if (effectiveStatus === 'skipped' || effectiveStatus === 'missing') continue

      const blockedBy = artifactType.requires().find((reqId) => {
        const depStatus = change.effectiveStatus(reqId)
        return depStatus !== 'complete' && depStatus !== 'skipped'
      })
      if (blockedBy !== undefined) {
        failures.push({
          artifactId: artifactType.id(),
          description: `Artifact '${artifactType.id()}' is blocked by incomplete dependency '${blockedBy}'`,
        })
        continue
      }

      const changeArtifact = change.getArtifact(artifactType.id())
      if (changeArtifact === null) continue
      const artifactFile = await this._changes.artifact(change, changeArtifact.filename)
      if (artifactFile === null) continue

      const format = artifactType.format() ?? inferFormat(changeArtifact.filename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      const yamlParser = this._parsers.get('yaml')

      let validationContent = artifactFile.content
      let artifactFailed = false

      // --- Delta processing ---
      if (artifactType.delta()) {
        const deltaFilename =
          capabilityPath.length > 0
            ? `deltas/${workspace}/${capabilityPath}/${changeArtifact.filename}.delta.yaml`
            : `deltas/${workspace}/${changeArtifact.filename}.delta.yaml`
        const deltaFile = await this._changes.artifact(change, deltaFilename)

        if (deltaFile !== null) {
          if (artifactType.deltaValidations().length > 0 && yamlParser !== undefined) {
            const deltaAST = yamlParser.parse(deltaFile.content)
            const result = evaluateRules(
              artifactType.deltaValidations(),
              deltaAST.root,
              artifactType.id(),
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
                  const baseArtifact = await specRepo.artifact(spec, changeArtifact.filename)
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
                    artifactId: artifactType.id(),
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

      // --- Structural validation ---
      if (!artifactFailed && artifactType.validations().length > 0 && parser !== undefined) {
        const ast = parser.parse(validationContent)
        const result = evaluateRules(
          artifactType.validations(),
          ast.root,
          artifactType.id(),
          parser,
        )
        failures.push(...result.failures)
        warnings.push(...result.warnings)
        if (result.failures.length > 0) artifactFailed = true
      }

      // --- Mark complete ---
      if (!artifactFailed) {
        const cleanedContent = this._applyCleanup(
          artifactFile.content,
          artifactType.preHashCleanup(),
        )
        changeArtifact.markComplete(this._sha256(cleanedContent))
      }
    }

    await this._changes.save(change)
    return { passed: failures.length === 0, failures, warnings }
  }

  /**
   * Computes a SHA-256 hash of the given content string.
   *
   * @param content - The content to hash
   * @returns A hex digest prefixed with `sha256:`
   */
  private _sha256(content: string): string {
    return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }

  /**
   * Applies a sequence of pre-hash cleanup rules to the content string.
   *
   * @param content - The content to clean
   * @param cleanups - The cleanup rules to apply in order
   * @returns The cleaned content string
   */
  private _applyCleanup(content: string, cleanups: readonly PreHashCleanup[]): string {
    let result = content
    for (const cleanup of cleanups) {
      const re = safeRegex(cleanup.pattern, 'g')
      if (re !== null) {
        result = result.replace(re, cleanup.replacement)
      }
    }
    return result
  }
}

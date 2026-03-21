import path from 'node:path'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ArtifactType } from '../../domain/value-objects/artifact-type.js'
import { type ValidationFailure, type ValidationWarning } from './validate-artifacts.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { evaluateRules } from '../../domain/services/rule-evaluator.js'
import { inferFormat } from '../../domain/services/format-inference.js'

/** Input for the {@link ValidateSpecs} use case. */
export interface ValidateSpecsInput {
  /** Single spec path in `workspace:capability-path` format (e.g. `"default:auth/login"`). */
  readonly specPath?: string
  /** Validate all specs in this workspace. */
  readonly workspace?: string
}

/** Validation result for a single spec. */
export interface SpecValidationEntry {
  /** Qualified label `workspace:path`. */
  readonly spec: string
  /** `true` if all artifacts pass validation. */
  readonly passed: boolean
  /** All validation failures for this spec. */
  readonly failures: ValidationFailure[]
  /** All validation warnings for this spec. */
  readonly warnings: ValidationWarning[]
}

/** Aggregated result of validating one or more specs. */
export interface ValidateSpecsResult {
  /** Per-spec validation results. */
  readonly entries: SpecValidationEntry[]
  /** Total number of specs validated. */
  readonly totalSpecs: number
  /** Number of specs that passed. */
  readonly passed: number
  /** Number of specs that failed. */
  readonly failed: number
}

/**
 * Validates spec artifacts against the active schema's structural rules.
 *
 * Supports validating a single spec, all specs in a workspace, or all specs
 * across all workspaces. Only `scope: 'spec'` artifacts from the schema are
 * validated — change-scoped artifacts are ignored.
 */
export class ValidateSpecs {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _schemaProvider: SchemaProvider
  private readonly _parsers: ArtifactParserRegistry

  /**
   * Creates a new `ValidateSpecs` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
  ) {
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
  }

  /**
   * Executes the use case.
   *
   * @param input - Validation parameters
   * @returns Aggregated validation result
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: ValidateSpecsInput): Promise<ValidateSpecsResult> {
    const schema = await this._schemaProvider.get()
    if (schema === null) throw new SchemaNotFoundError('(provider)')

    const specArtifactTypes = schema.artifacts().filter((a) => a.scope === 'spec')
    const entries: SpecValidationEntry[] = []

    if (input.specPath !== undefined) {
      const { workspace, capPath: capabilityPath } = parseSpecId(input.specPath)
      const specRepo = this._specs.get(workspace)
      if (specRepo === undefined) {
        throw new WorkspaceNotFoundError(workspace)
      }
      const specPath = SpecPath.parse(capabilityPath)
      const spec = await specRepo.get(specPath)
      if (spec === null) {
        throw new SpecNotFoundError(input.specPath)
      }
      const entry = await this._validateSpec(
        specRepo,
        spec.workspace,
        capabilityPath,
        spec.filenames,
        specArtifactTypes,
      )
      entries.push(entry)
    } else if (input.workspace !== undefined) {
      const specRepo = this._specs.get(input.workspace)
      if (specRepo === undefined) {
        throw new WorkspaceNotFoundError(input.workspace)
      }
      const specs = await specRepo.list()
      for (const spec of specs) {
        const entry = await this._validateSpec(
          specRepo,
          spec.workspace,
          spec.name.toFsPath('/'),
          spec.filenames,
          specArtifactTypes,
        )
        entries.push(entry)
      }
    } else {
      for (const [, specRepo] of this._specs) {
        const specs = await specRepo.list()
        for (const spec of specs) {
          const entry = await this._validateSpec(
            specRepo,
            spec.workspace,
            spec.name.toFsPath('/'),
            spec.filenames,
            specArtifactTypes,
          )
          entries.push(entry)
        }
      }
    }

    const passed = entries.filter((e) => e.passed).length
    return {
      entries,
      totalSpecs: entries.length,
      passed,
      failed: entries.length - passed,
    }
  }

  /**
   * Validates all spec-scoped artifacts for a single spec.
   *
   * @param specRepo - Repository to read artifacts from
   * @param workspace - Workspace name for the spec label
   * @param capabilityPath - Capability path within the workspace
   * @param filenames - Filenames present in the spec directory
   * @param specArtifactTypes - Spec-scoped artifact types from the active schema
   * @returns Validation entry with failures and warnings
   */
  private async _validateSpec(
    specRepo: SpecRepository,
    workspace: string,
    capabilityPath: string,
    filenames: readonly string[],
    specArtifactTypes: readonly ArtifactType[],
  ): Promise<SpecValidationEntry> {
    const label = `${workspace}:${capabilityPath}`
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    const specPath = SpecPath.parse(capabilityPath)
    const spec = await specRepo.get(specPath)

    for (const artifactType of specArtifactTypes) {
      const filename = path.basename(artifactType.output)
      const hasFile = filenames.includes(filename)

      if (!hasFile) {
        if (!artifactType.optional) {
          failures.push({
            artifactId: artifactType.id,
            description: `Required artifact '${artifactType.id}' is missing`,
          })
        }
        continue
      }

      if (artifactType.validations.length === 0) continue
      if (spec === null) continue

      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) continue

      const format = artifactType.format ?? inferFormat(filename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      if (parser === undefined) continue

      const ast = parser.parse(artifact.content)
      const result = evaluateRules(artifactType.validations, ast.root, artifactType.id, parser)
      failures.push(...result.failures)
      warnings.push(...result.warnings)
    }

    return {
      spec: label,
      passed: failures.length === 0,
      failures,
      warnings,
    }
  }
}

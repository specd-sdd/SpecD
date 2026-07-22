import path from 'node:path'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ArtifactType } from '../../domain/value-objects/artifact-type.js'
import { type CrossArtifactValidationRule } from '../../domain/value-objects/cross-artifact-validation.js'
import { type ValidationFailure, type ValidationWarning } from './validate-artifacts.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { evaluateRules } from '../../domain/services/rule-evaluator.js'
import { evaluateCrossArtifactRule } from '../../domain/services/cross-artifact-rule-evaluator.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
import { type ReadyArtifactParticipant } from './_shared/cross-artifact-participant-state.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import { type Schema } from '../../domain/value-objects/schema.js'

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
  private readonly _hasher: ContentHasher
  private readonly _extractorTransforms: ExtractorTransformRegistry
  private readonly _workspaceRoutes: readonly SpecWorkspaceRoute[]

  /**
   * Creates a new `ValidateSpecs` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param hasher - Content hasher for metadata freshness validation
   * @param extractorTransforms - Shared extractor transform registry
   * @param workspaceRoutes - Workspace routing metadata for cross-workspace resolution
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    hasher?: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry = new Map(),
    workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
  ) {
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._hasher = hasher ?? {
      hash(content: string): string {
        return content
      },
    }
    this._extractorTransforms = extractorTransforms
    this._workspaceRoutes = workspaceRoutes
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
    const crossRules = schema.crossArtifactValidations().filter((rule) => rule.scope === 'spec')

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
        crossRules,
        schema,
      )
      entries.push(entry)
    } else if (input.workspace !== undefined) {
      const specRepo = this._specs.get(input.workspace)
      if (specRepo === undefined) {
        throw new WorkspaceNotFoundError(input.workspace)
      }
      const listed = await specRepo.list(undefined)
      for (const entry of listed.items) {
        const spec = await specRepo.get(SpecPath.parse(entry.path))
        if (spec === null) continue
        const entryResult = await this._validateSpec(
          specRepo,
          spec.workspace,
          spec.name.toFsPath('/'),
          spec.filenames,
          specArtifactTypes,
          crossRules,
          schema,
        )
        entries.push(entryResult)
      }
    } else {
      for (const [, specRepo] of this._specs) {
        const listed = await specRepo.list(undefined)
        for (const row of listed.items) {
          const spec = await specRepo.get(SpecPath.parse(row.path))
          if (spec === null) continue
          const entryResult = await this._validateSpec(
            specRepo,
            spec.workspace,
            spec.name.toFsPath('/'),
            spec.filenames,
            specArtifactTypes,
            crossRules,
            schema,
          )
          entries.push(entryResult)
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
   * @param crossRules - Cross-artifact validation rules scoped to spec artifacts
   * @param schema - Active schema governing extraction and validation behavior
   * @returns Validation entry with failures and warnings
   */
  private async _validateSpec(
    specRepo: SpecRepository,
    workspace: string,
    capabilityPath: string,
    filenames: readonly string[],
    specArtifactTypes: readonly ArtifactType[],
    crossRules: readonly CrossArtifactValidationRule[],
    schema: Schema,
  ): Promise<SpecValidationEntry> {
    const label = `${workspace}:${capabilityPath}`
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    const specPath = SpecPath.parse(capabilityPath)
    const spec = await specRepo.get(specPath)
    const readyParticipants = new Map<string, ReadyArtifactParticipant>()

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
      if (spec === null) continue

      const artifact = await specRepo.artifact(spec, filename)
      if (artifact === null) continue

      const format = artifactType.format ?? inferFormat(filename)
      const parser = format !== undefined ? this._parsers.get(format) : undefined
      if (parser === undefined) continue
      const hasCrossRuleForArtifact = crossRules.some((rule) =>
        rule.participants.some((participant) => participant.artifact === artifactType.id),
      )
      if (artifactType.validations.length === 0 && !hasCrossRuleForArtifact) continue

      const ast = parser.parse(artifact.content)
      let artifactFailed = false
      if (artifactType.validations.length > 0) {
        const result = evaluateRules(artifactType.validations, ast.root, artifactType.id, parser)
        failures.push(...result.failures)
        warnings.push(...result.warnings)
        artifactFailed = result.failures.length > 0
      }
      if (!artifactFailed) {
        readyParticipants.set(artifactType.id, {
          artifactId: artifactType.id,
          key: label,
          scope: artifactType.scope,
          root: ast.root,
          parser,
          filename,
        })
      }
    }

    for (const rule of crossRules) {
      const participantInputs = new Map()
      let deferred = false
      for (const participant of rule.participants) {
        const ready = readyParticipants.get(participant.artifact)
        if (ready === undefined) {
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

    if (spec !== null) {
      await this._validateMetadataConsistency({
        specRepo,
        spec,
        label,
        schema,
        specArtifactTypes,
        failures,
      })
    }

    return {
      spec: label,
      passed: failures.length === 0,
      failures,
      warnings,
    }
  }

  /**
   * Validates that persisted semantic state and cached metadata remain aligned.
   *
   * @param args - Metadata consistency inputs for one spec
   * @param args.specRepo - Repository that owns the spec
   * @param args.spec - Spec entity under validation
   * @param args.label - Fully-qualified spec id used in diagnostics
   * @param args.schema - Effective schema for extraction checks
   * @param args.specArtifactTypes - Spec artifact definitions from the schema
   * @param args.failures - Mutable validation failures sink
   */
  private async _validateMetadataConsistency(args: {
    readonly specRepo: SpecRepository
    readonly spec: import('../../domain/entities/spec.js').Spec
    readonly label: string
    readonly schema: Schema
    readonly specArtifactTypes: readonly ArtifactType[]
    readonly failures: ValidationFailure[]
  }): Promise<void> {
    const metadata = await args.specRepo.metadata(args.spec)
    if (metadata === null) {
      return
    }

    if (metadata.freshness === 'stale') {
      args.failures.push({
        artifactId: 'metadata',
        description: `Metadata for '${args.label}' has stale or incomplete contentHashes`,
      })
    }

    const persistedDependsOn = await args.specRepo.readPersistedDependsOn(args.spec)
    if (persistedDependsOn !== null) {
      if (
        metadata.dependsOn === undefined ||
        !DependsOnOverwriteError.areSame(metadata.dependsOn, persistedDependsOn)
      ) {
        args.failures.push({
          artifactId: 'metadata',
          description: `Metadata for '${args.label}' has dependsOn that does not match persisted dependencies`,
        })
      }

      const extractedDependsOn = await this._extractDependsOn(args)
      if (
        extractedDependsOn !== undefined &&
        !DependsOnOverwriteError.areSame(extractedDependsOn, persistedDependsOn)
      ) {
        args.failures.push({
          artifactId: 'metadata',
          description: `Extracted dependsOn for '${args.label}' does not match persisted dependencies`,
        })
      }
    }
  }

  /**
   * Extracts `dependsOn` from spec artifacts when the schema declares it.
   *
   * @param args - Metadata consistency inputs for one spec
   * @param args.specRepo - Repository that owns the spec
   * @param args.spec - Spec entity under validation
   * @param args.label - Fully-qualified spec id used in diagnostics
   * @param args.schema - Effective schema for extraction checks
   * @param args.specArtifactTypes - Spec artifact definitions from the schema
   * @returns Extracted dependsOn values, or `undefined` when extraction is not declared
   */
  private async _extractDependsOn(args: {
    readonly specRepo: SpecRepository
    readonly spec: import('../../domain/entities/spec.js').Spec
    readonly label: string
    readonly schema: Schema
    readonly specArtifactTypes: readonly ArtifactType[]
  }): Promise<readonly string[] | undefined> {
    const extraction = args.schema.metadataExtraction()
    if (extraction?.dependsOn === undefined) {
      return undefined
    }

    const artifacts: MetadataArtifactInput[] = []
    for (const artifactType of args.specArtifactTypes) {
      const filename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const artifact = await args.specRepo.artifact(args.spec, filename)
      if (artifact === null) continue

      artifacts.push({
        artifactId: artifactType.id,
        filename,
        format,
        content: artifact.content,
      })
    }

    const { workspace, capPath } = parseSpecId(args.label)
    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: args.schema,
      workspace,
      specPath: SpecPath.parse(capPath),
      artifacts,
      parsers: this._parsers,
      extractorTransforms: this._extractorTransforms,
      repositories: this._specs,
      workspaceRoutes: this._workspaceRoutes,
    })
    return extracted.metadata.dependsOn
  }
}

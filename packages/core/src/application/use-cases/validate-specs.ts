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
import { type ReadyArtifactParticipant } from './_shared/cross-artifact-participant-state.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type SpecWorkspaceRoute } from './_shared/spec-reference-resolver.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import {
  ValidationResultCache,
  type SpecValidationEntry,
} from '../ports/validation-result-cache.js'
import {
  VALIDATE_SPECS_ENGINE_VERSION,
  computeSchemaFingerprintFromSchema,
} from './_shared/validate-specs-cache-fingerprints.js'
import {
  listEntryHasMeta,
  specFromListEntry,
  stampsFromListEntry,
} from './_shared/validation-source-stamps.js'
import { type GetSpecMetadata } from './get-spec-metadata.js'

/** Input for the {@link ValidateSpecs} use case. */
export interface ValidateSpecsInput {
  /** Single spec path in `workspace:capability-path` format (e.g. `"default:auth/login"`). */
  readonly specPath?: string
  /** Validate all specs in this workspace. */
  readonly workspace?: string
}

/** Validation result for a single spec. */
export type { SpecValidationEntry } from '../ports/validation-result-cache.js'

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
  private readonly _validationResultCaches: ReadonlyMap<string, ValidationResultCache>
  private readonly _getMetadata: GetSpecMetadata

  /**
   * Creates a new `ValidateSpecs` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param schemaProvider - Provider for the fully-resolved schema
   * @param parsers - Registry of artifact format parsers
   * @param getMetadata - Metadata materialization use case
   * @param hasher - Content hasher for metadata freshness validation
   * @param _extractorTransforms - Unused compatibility argument; metadata extraction is delegated
   * @param _workspaceRoutes - Unused compatibility argument; metadata routing is delegated
   * @param validationResultCaches - Validation result caches keyed by workspace name
   */
  constructor(
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    getMetadata: GetSpecMetadata,
    hasher?: ContentHasher,
    _extractorTransforms: ExtractorTransformRegistry = new Map(),
    _workspaceRoutes: readonly SpecWorkspaceRoute[] = [],
    validationResultCaches: ReadonlyMap<string, ValidationResultCache> = new Map(),
  ) {
    this._specs = specs
    this._schemaProvider = schemaProvider
    this._parsers = parsers
    this._getMetadata = getMetadata
    this._hasher = hasher ?? {
      hash(content: string): string {
        return content
      },
    }
    this._validationResultCaches = validationResultCaches
    // Preserve constructor slots while extraction and routing belong to metadata materialization.
    void _extractorTransforms
    void _workspaceRoutes
  }

  /**
   * Executes the use case.
   *
   * @param input - Validation parameters
   * @returns Aggregated validation result
   * @throws {InvalidSpecIdError} If a requested spec ID is empty, blank, or malformed
   * @throws {WorkspaceNotFoundError} If a requested spec ID names an unknown workspace
   * @throws {SpecNotFoundError} If a requested spec does not exist
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: ValidateSpecsInput): Promise<ValidateSpecsResult> {
    const schema = await this._schemaProvider.get()
    const crossRules = schema.crossArtifactValidations().filter((rule) => rule.scope === 'spec')

    const specArtifactTypes = schema.artifacts().filter((a) => a.scope === 'spec')
    const schemaFingerprint = computeSchemaFingerprintFromSchema(schema, this._hasher)
    const engineVersion = VALIDATE_SPECS_ENGINE_VERSION
    const entries: SpecValidationEntry[] = []

    if (input.specPath !== undefined) {
      const {
        workspace,
        capPath: capabilityPath,
        specId,
      } = parseSpecId(input.specPath, { workspaces: this._specs.keys() })
      const specRepo = this._specs.get(workspace)!
      const specPath = SpecPath.parse(capabilityPath)
      const spec = await specRepo.get(specPath)
      if (spec === null) {
        throw new SpecNotFoundError(specId)
      }
      const entry = await this._validateSpecWithCache({
        specRepo,
        spec,
        workspace,
        capabilityPath,
        specArtifactTypes,
        crossRules,
        schema,
        schemaFingerprint,
        engineVersion,
      })
      entries.push(entry)
    } else if (input.workspace !== undefined) {
      const specRepo = this._specs.get(input.workspace)
      if (specRepo === undefined) {
        throw new WorkspaceNotFoundError(input.workspace)
      }
      const listed = await specRepo.list(undefined, { includeMeta: true })
      for (const row of listed.items) {
        const entryResult = await this._validateListedSpecWithCache({
          specRepo,
          row,
          specArtifactTypes,
          crossRules,
          schema,
          schemaFingerprint,
          engineVersion,
        })
        entries.push(entryResult)
      }
    } else {
      for (const [, specRepo] of this._specs) {
        const listed = await specRepo.list(undefined, { includeMeta: true })
        for (const row of listed.items) {
          const entryResult = await this._validateListedSpecWithCache({
            specRepo,
            row,
            specArtifactTypes,
            crossRules,
            schema,
            schemaFingerprint,
            engineVersion,
          })
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
   * Validates one listed spec using projected Meta stamps when available.
   *
   * @param args - Validation context for a single listed spec
   * @param args.specRepo - Repository for the spec workspace
   * @param args.row - Listed spec row, optionally including Meta stamps
   * @param args.specArtifactTypes - Spec-scoped artifact types from the schema
   * @param args.crossRules - Cross-artifact validation rules
   * @param args.schema - Fully-resolved schema
   * @param args.schemaFingerprint - Schema fingerprint used for cache lookup
   * @param args.engineVersion - Validation engine version used for cache lookup
   * @returns Validation result for the listed spec
   */
  private async _validateListedSpecWithCache(args: {
    readonly specRepo: SpecRepository
    readonly row: import('../ports/spec-repository.js').SpecListEntry
    readonly specArtifactTypes: readonly ArtifactType[]
    readonly crossRules: readonly CrossArtifactValidationRule[]
    readonly schema: Schema
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<SpecValidationEntry> {
    if (listEntryHasMeta(args.row)) {
      const spec = specFromListEntry(args.row)
      const stamps = stampsFromListEntry(args.row)
      const cache = this._validationResultCaches.get(spec.workspace)
      if (cache !== undefined) {
        const lookup = await cache.lookup({
          spec,
          schemaFingerprint: args.schemaFingerprint,
          engineVersion: args.engineVersion,
          stamps,
        })
        if (lookup.kind === 'hit') {
          return this._fromCacheEntry(lookup.entry)
        }
      }

      const loaded = await args.specRepo.get(SpecPath.parse(args.row.path))
      if (loaded === null) {
        throw new SpecNotFoundError(`${args.row.workspace}:${args.row.path}`)
      }

      return this._validateSpecWithCache({
        specRepo: args.specRepo,
        spec: loaded,
        workspace: loaded.workspace,
        capabilityPath: loaded.name.toFsPath('/'),
        specArtifactTypes: args.specArtifactTypes,
        crossRules: args.crossRules,
        schema: args.schema,
        schemaFingerprint: args.schemaFingerprint,
        engineVersion: args.engineVersion,
      })
    }

    const spec = await args.specRepo.get(SpecPath.parse(args.row.path))
    if (spec === null) {
      throw new SpecNotFoundError(`${args.row.workspace}:${args.row.path}`)
    }
    return this._validateSpecWithCache({
      specRepo: args.specRepo,
      spec,
      workspace: spec.workspace,
      capabilityPath: spec.name.toFsPath('/'),
      specArtifactTypes: args.specArtifactTypes,
      crossRules: args.crossRules,
      schema: args.schema,
      schemaFingerprint: args.schemaFingerprint,
      engineVersion: args.engineVersion,
    })
  }

  /**
   * Validates one spec using the result cache when configured for its workspace.
   *
   * @param args - Per-spec validation and cache context
   * @param args.specRepo - Repository owning the spec
   * @param args.spec - Spec metadata with artifact stamps
   * @param args.workspace - Workspace name for the spec label
   * @param args.capabilityPath - Capability path within the workspace
   * @param args.specArtifactTypes - Spec-scoped artifact types from the active schema
   * @param args.crossRules - Cross-artifact validation rules scoped to spec artifacts
   * @param args.schema - Active schema governing extraction and validation behavior
   * @param args.schemaFingerprint - Active schema validation surface fingerprint
   * @param args.engineVersion - Active validate-specs engine version
   * @returns Validation entry for the spec
   */
  private async _validateSpecWithCache(args: {
    readonly specRepo: SpecRepository
    readonly spec: import('../../domain/entities/spec.js').Spec
    readonly workspace: string
    readonly capabilityPath: string
    readonly specArtifactTypes: readonly ArtifactType[]
    readonly crossRules: readonly CrossArtifactValidationRule[]
    readonly schema: Schema
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<SpecValidationEntry> {
    const cache = this._validationResultCaches.get(args.workspace)
    if (cache === undefined) {
      return this._validateSpec(
        args.specRepo,
        args.spec,
        args.workspace,
        args.capabilityPath,
        args.specArtifactTypes,
        args.crossRules,
      )
    }

    const lookup = await cache.lookup({
      spec: args.spec,
      schemaFingerprint: args.schemaFingerprint,
      engineVersion: args.engineVersion,
    })
    if (lookup.kind === 'hit') {
      return this._fromCacheEntry(lookup.entry)
    }

    const entry = await this._validateSpec(
      args.specRepo,
      args.spec,
      args.workspace,
      args.capabilityPath,
      args.specArtifactTypes,
      args.crossRules,
    )
    await cache.upsert({
      entry: this._toCacheEntry(entry),
      spec: args.spec,
      schemaFingerprint: args.schemaFingerprint,
      engineVersion: args.engineVersion,
    })
    return entry
  }

  /**
   * Converts a cached entry into the public validation result shape.
   *
   * @param entry - Cached validation entry
   * @returns Public validation entry
   */
  private _fromCacheEntry(entry: SpecValidationEntry): SpecValidationEntry {
    return {
      spec: entry.spec,
      passed: entry.passed,
      failures: [...entry.failures],
      warnings: [...entry.warnings],
    }
  }

  /**
   * Converts a validation result into the cache entry shape.
   *
   * @param entry - Public validation entry
   * @returns Cache entry payload
   */
  private _toCacheEntry(entry: SpecValidationEntry): SpecValidationEntry {
    return {
      spec: entry.spec,
      passed: entry.passed,
      failures: entry.failures,
      warnings: entry.warnings,
    }
  }

  /**
   * Validates all spec-scoped artifacts for a single spec.
   *
   * @param specRepo - Repository to read artifacts from
   * @param spec - Spec metadata with artifact stamps
   * @param workspace - Workspace name for the spec label
   * @param capabilityPath - Capability path within the workspace
   * @param specArtifactTypes - Spec-scoped artifact types from the active schema
   * @param crossRules - Cross-artifact validation rules scoped to spec artifacts
   * @returns Validation entry with failures and warnings
   */
  private async _validateSpec(
    specRepo: SpecRepository,
    spec: import('../../domain/entities/spec.js').Spec,
    workspace: string,
    capabilityPath: string,
    specArtifactTypes: readonly ArtifactType[],
    crossRules: readonly CrossArtifactValidationRule[],
  ): Promise<SpecValidationEntry> {
    const label = `${workspace}:${capabilityPath}`
    const failures: ValidationFailure[] = []
    const warnings: ValidationWarning[] = []
    const readyParticipants = new Map<string, ReadyArtifactParticipant>()

    for (const artifactType of specArtifactTypes) {
      const filename = path.basename(artifactType.output)
      const hasFile = spec.hasArtifact(filename)

      if (!hasFile) {
        if (!artifactType.optional) {
          failures.push({
            artifactId: artifactType.id,
            description: `Required artifact '${artifactType.id}' is missing`,
          })
        }
        continue
      }

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

    await this._validateMetadataMaterialization({
      label,
      failures,
      warnings,
    })

    return {
      spec: label,
      passed: failures.length === 0,
      failures,
      warnings,
    }
  }

  /**
   * Accepts usable metadata and propagates materialization failures and warnings.
   *
   * @param args - Metadata materialization inputs for one spec
   * @param args.label - Fully-qualified spec id used in diagnostics
   * @param args.failures - Mutable validation failures sink
   * @param args.warnings - Mutable validation warnings sink
   */
  private async _validateMetadataMaterialization(args: {
    readonly label: string
    readonly failures: ValidationFailure[]
    readonly warnings: ValidationWarning[]
  }): Promise<void> {
    try {
      const result = await this._getMetadata.execute({ specId: args.label })
      for (const warning of result.warnings) {
        args.warnings.push({
          artifactId: 'metadata',
          description: `${warning.kind} for '${warning.specId}': ${warning.error}`,
        })
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      args.failures.push({
        artifactId: 'metadata',
        description: `Metadata for '${args.label}' could not be materialized: ${reason}`,
      })
    }
  }
}

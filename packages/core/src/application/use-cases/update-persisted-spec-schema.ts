import path from 'node:path'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { PersistedSchemaDependencyConflictError } from '../../domain/errors/persisted-schema-dependency-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../domain/errors/read-only-workspace-error.js'
import { SpecNotInitializedError } from '../../domain/errors/spec-not-initialized-error.js'
import { DependsOnOverwriteError } from '../../domain/errors/depends-on-overwrite-error.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { type GetActiveSchema } from './get-active-schema.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './_shared/extract-metadata-from-spec-artifacts.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'

/** Input for the {@link UpdatePersistedSpecSchema} use case. */
export interface UpdatePersistedSpecSchemaInput {
  /** Target spec identifier. */
  readonly specId: string
  /** Schema reference to apply to persisted state. */
  readonly schemaRef: string
}

/** Result returned by a successful {@link UpdatePersistedSpecSchema} execution. */
export interface UpdatePersistedSpecSchemaResult {
  /** The spec ID whose schema was updated. */
  readonly specId: string
  /** The resulting persisted schema identity. */
  readonly schema: { readonly name: string; readonly version: number }
  /** The resulting dependency list after the update. */
  readonly dependsOn: readonly string[]
  /** Whether the persisted schema identity changed. */
  readonly changed: boolean
}

/**
 * Updates the persisted schema identity for an initialized spec.
 */
export class UpdatePersistedSpecSchema {
  /**
   * Creates a new `UpdatePersistedSpecSchema` use case instance.
   *
   * @param specRepositories - Spec repositories keyed by workspace name
   * @param getActiveSchema - Use case resolving the active project schema
   * @param resolveDepsDeps - Dependencies for dependency extraction during schema changes
   * @param resolveDepsDeps.parsers - Artifact parser registry
   * @param resolveDepsDeps.extractorTransforms - Metadata extractor transforms
   * @param resolveDepsDeps.hasher - Content hasher for metadata freshness
   */
  constructor(
    private readonly specRepositories: ReadonlyMap<string, SpecRepository>,
    private readonly getActiveSchema: GetActiveSchema,
    private readonly resolveDepsDeps: {
      readonly parsers: ArtifactParserRegistry
      readonly extractorTransforms: ExtractorTransformRegistry
      readonly hasher: ContentHasher
    },
  ) {}

  /**
   * Executes the persisted schema update.
   *
   * @param input - Update parameters
   * @returns The resulting schema identity and dependency list
   * @throws {WorkspaceNotFoundError} If the workspace does not exist
   * @throws {ReadOnlyWorkspaceError} If the workspace is read-only
   * @throws {SpecNotFoundError} If the spec does not exist
   * @throws {SpecNotInitializedError} If persisted state has not been initialized
   * @throws {PersistedSchemaDependencyConflictError} If extracted dependencies conflict with persisted deps
   */
  async execute(input: UpdatePersistedSpecSchemaInput): Promise<UpdatePersistedSpecSchemaResult> {
    const { workspace, capPath } = parseSpecId(input.specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }
    if (repo.ownership() === 'readOnly') {
      throw new ReadOnlyWorkspaceError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const current = await repo.readPersistedState(spec)
    if (current === null) {
      throw new SpecNotInitializedError(input.specId)
    }

    const schemaResult = await this.getActiveSchema.execute({ mode: 'ref', ref: input.schemaRef })
    if (schemaResult.raw) throw new Error('schema resolution failed')
    const targetSchema = {
      name: schemaResult.schema.name(),
      version: schemaResult.schema.version(),
    }

    if (
      current.schema.name === targetSchema.name &&
      current.schema.version === targetSchema.version
    ) {
      return {
        specId: input.specId,
        schema: current.schema,
        dependsOn: current.dependsOn,
        changed: false,
      }
    }

    const extractedDependsOn = await this._extractDependsOn(
      input.specId,
      workspace,
      spec,
      repo,
      schemaResult.schema,
    )
    const nextDependsOn = current.dependsOn
    if (
      extractedDependsOn !== undefined &&
      !DependsOnOverwriteError.areSame(extractedDependsOn, nextDependsOn)
    ) {
      throw new PersistedSchemaDependencyConflictError(
        input.specId,
        nextDependsOn,
        extractedDependsOn,
      )
    }

    const state = {
      schema: targetSchema,
      dependsOn: nextDependsOn,
      implementation: current.implementation,
      ...(current.optimizations !== undefined ? { optimizations: current.optimizations } : {}),
    }
    await repo.writePersistedState(spec, state, { expectedRevision: current.originalHash })
    return {
      specId: input.specId,
      schema: targetSchema,
      dependsOn: nextDependsOn,
      changed: true,
    }
  }

  /**
   * Extracts `dependsOn` from spec artifacts for schema migration checks.
   *
   * @param specId - Target spec identifier
   * @param workspace - Workspace name
   * @param spec - Resolved spec entity
   * @param repo - Workspace spec repository
   * @param schema - Effective target schema
   * @returns Extracted dependency list, if configured by the schema
   */
  private async _extractDependsOn(
    specId: string,
    workspace: string,
    spec: import('../../domain/entities/spec.js').Spec,
    repo: SpecRepository,
    schema: import('../../domain/value-objects/schema.js').Schema,
  ): Promise<readonly string[] | undefined> {
    if (schema.metadataExtraction()?.dependsOn === undefined) {
      return undefined
    }

    const artifacts: MetadataArtifactInput[] = []
    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope !== 'spec') continue
      const filename = path.basename(artifactType.output)
      const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
      const parser = this.resolveDepsDeps.parsers.get(format)
      if (parser === undefined) continue
      const artifact = await repo.artifact(spec, filename)
      if (artifact === null) continue
      artifacts.push({ artifactId: artifactType.id, filename, format, content: artifact.content })
    }

    const extracted = await extractMetadataFromSpecArtifacts({
      effectiveSpecSchema: schema,
      workspace,
      specPath: spec.name,
      artifacts,
      parsers: this.resolveDepsDeps.parsers,
      extractorTransforms: this.resolveDepsDeps.extractorTransforms,
      repositories: this.specRepositories,
      workspaceRoutes: [],
      hasher: this.resolveDepsDeps.hasher,
    })
    return extracted.metadata.dependsOn
  }
}

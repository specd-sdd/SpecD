import { join } from 'node:path'
import { ConfigNotFoundError } from '../errors/config-not-found-error.js'
import {
  type ProjectMetadata,
  type UpdateProjectMetadataPayload,
} from '../../domain/services/project-metadata.js'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecdConfig } from '../specd-config.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type FileReader } from '../ports/file-reader.js'
import { type FileWriter } from '../ports/file-writer.js'
import { listMatchingSpecs, type ResolvedSpec } from './_shared/spec-pattern-matching.js'
import { type ListWorkspaces } from './list-workspaces.js'

/** Input for the {@link UpdateProjectMetadata} use case. */
export interface UpdateProjectMetadataInput {
  /** The payload containing LLM-optimized context. */
  readonly payload: UpdateProjectMetadataPayload
}

/** Result returned by a successful {@link UpdateProjectMetadata} execution. */
export interface UpdateProjectMetadataResult {
  /** Absolute path to the saved `project-metadata.json`. */
  readonly path: string
}

/**
 * Updates project-level metadata with agent-provided optimizations.
 *
 * Algorithm:
 * 1. Resolve all current project context inputs (config, context files, specs).
 * 2. Compute SHA-256 hashes for each using `ContentHasher`.
 * 3. Construct the full `ProjectMetadata` structure.
 * 4. Persist atomically to `{configPath}/project-metadata.json`.
 */
export class UpdateProjectMetadata {
  /**
   * Creates a new `UpdateProjectMetadata` use case.
   *
   * @param _config - Project configuration
   * @param _listWorkspaces - Use case to list workspaces
   * @param _specRepos - Map of spec repositories
   * @param _files - File reader for config and context files
   * @param _fileWriter - File writer for persisting metadata
   * @param _hasher - Content hasher for invalidation hashes
   */
  constructor(
    private readonly _config: SpecdConfig,
    private readonly _listWorkspaces: ListWorkspaces,
    private readonly _specRepos: ReadonlyMap<string, SpecRepository>,
    private readonly _files: FileReader,
    private readonly _fileWriter: FileWriter,
    private readonly _hasher: ContentHasher,
  ) {}

  /**
   * Executes the project metadata update.
   *
   * @param input - Optimized payload
   * @returns Result indicating the save location
   */
  async execute(input: UpdateProjectMetadataInput): Promise<UpdateProjectMetadataResult> {
    // 1. Resolve inputs and compute hashes
    const configYamlPath = join(this._config.projectRoot, 'specd.yaml')
    const configContent = await this._files.read(configYamlPath)
    if (configContent === null) {
      throw new ConfigNotFoundError(configYamlPath)
    }

    const freshnessInputs: ProjectMetadata['freshness']['inputs'] = {
      config: {
        path: 'specd.yaml',
        hash: this._hasher.hash(configContent),
      },
      contextFiles: [],
      specMetadata: [],
    }

    // Hash context files
    for (const entry of this._config.context ?? []) {
      if ('file' in entry) {
        const content = await this._files.read(entry.file)
        if (content !== null) {
          freshnessInputs.contextFiles.push({
            path: entry.file,
            hash: this._hasher.hash(content),
          })
        }
      }
    }

    // Hash spec metadata
    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))
    const specs = new Map<string, ResolvedSpec>()

    for (const pattern of this._config.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, [])
      for (const spec of matches) {
        specs.set(`${spec.workspace}:${spec.capPath}`, spec)
      }
    }

    for (const pattern of this._config.contextExcludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, [])
      for (const spec of matches) {
        specs.delete(`${spec.workspace}:${spec.capPath}`)
      }
    }

    for (const [id, spec] of specs) {
      const repo = this._specRepos.get(spec.workspace)
      if (repo) {
        const metadata = await repo.metadata(
          new Spec(spec.workspace, SpecPath.parse(spec.capPath), []),
        )
        if (metadata?.contentHashes) {
          // Use the combined hash of spec files as the spec's metadata hash
          const combinedHash = Object.values(metadata.contentHashes).sort().join(',')
          freshnessInputs.specMetadata.push({
            id,
            hash: this._hasher.hash(combinedHash),
          })
        }
      }
    }

    // 2. Compute combined hash
    const allHashes = [
      freshnessInputs.config.hash,
      ...freshnessInputs.contextFiles.map((f) => f.hash).sort(),
      ...freshnessInputs.specMetadata.map((s) => s.hash).sort(),
    ].join('|')
    const combinedHash = this._hasher.hash(allHashes)

    // 3. Construct result
    const metadata: ProjectMetadata = {
      version: 1,
      optimized: {
        context: input.payload.optimizedContext,
      },
      freshness: {
        algorithm: 'sha256',
        inputs: freshnessInputs,
        combinedHash,
      },
      generated: {
        at: new Date().toISOString(),
      },
    }

    // 4. Persist
    const targetPath = join(this._config.configPath, 'project-metadata.json')
    await this._fileWriter.write(targetPath, JSON.stringify(metadata, null, 2))

    return { path: targetPath }
  }
}

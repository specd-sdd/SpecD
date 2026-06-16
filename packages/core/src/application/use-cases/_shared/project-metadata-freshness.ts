import { join } from 'node:path'
import {
  projectMetadataSchema,
  type ProjectMetadata,
} from '../../../domain/services/project-metadata.js'
import { Spec } from '../../../domain/entities/spec.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type CompileContextConfig } from '../compile-context.js'
import { type ContentHasher } from '../../ports/content-hasher.js'
import { type FileReader } from '../../ports/file-reader.js'
import { listMatchingSpecs, type ResolvedSpec } from './spec-pattern-matching.js'
import { type ProjectWorkspace } from '../list-workspaces.js'
import { type ContextWarning } from './context-warning.js'

/**
 * Result of checking project-level metadata freshness.
 */
export interface ProjectMetadataFreshnessResult {
  /** The fresh metadata if available and valid. */
  readonly metadata: ProjectMetadata | null
  /** Whether the metadata is fresh. */
  readonly isFresh: boolean
  /** Any warnings generated during the check. */
  readonly warnings: readonly ContextWarning[]
}

/**
 * Checks whether the project-level optimized context is fresh.
 *
 * @param config - The compile context configuration
 * @param files - File reader for reading config and metadata
 * @param hasher - Content hasher for verifying hashes
 * @param workspaceMap - Map of project workspaces
 * @returns Freshness result with metadata and warnings
 */
export async function checkProjectMetadataFreshness(
  config: CompileContextConfig,
  files: FileReader,
  hasher: ContentHasher,
  workspaceMap: Map<string, ProjectWorkspace>,
): Promise<ProjectMetadataFreshnessResult> {
  if (!config.llmOptimizedContext || !config.configPath || !config.projectRoot) {
    return { metadata: null, isFresh: false, warnings: [] }
  }

  const metadataPath = join(config.configPath, 'project-metadata.json')
  const metadataContent = await files.read(metadataPath)

  if (metadataContent === null) {
    return {
      metadata: null,
      isFresh: false,
      warnings: [
        {
          type: 'stale-optimization',
          message:
            'Project-level optimized context is missing. Launch specd-project-context-optimizer agent to generate it.',
        },
      ],
    }
  }

  try {
    const projectMeta: ProjectMetadata = projectMetadataSchema.parse(JSON.parse(metadataContent))

    // Verify config hash
    const configYamlPath = join(config.projectRoot, 'specd.yaml')
    const currentConfigContent = await files.read(configYamlPath)
    const configFresh =
      currentConfigContent !== null &&
      hasher.hash(currentConfigContent) === projectMeta.freshness.inputs.config.hash

    if (!configFresh) {
      return {
        metadata: projectMeta,
        isFresh: false,
        warnings: [
          {
            type: 'stale-optimization',
            message:
              'Project-level optimized context is stale (config changed). Launch specd-project-context-optimizer agent to regenerate.',
          },
        ],
      }
    }

    // Verify context files
    for (const fileInput of projectMeta.freshness.inputs.contextFiles) {
      const content = await files.read(fileInput.path)
      if (content === null || hasher.hash(content) !== fileInput.hash) {
        return {
          metadata: projectMeta,
          isFresh: false,
          warnings: [
            {
              type: 'stale-optimization',
              message: `Project-level optimized context is stale (file '${fileInput.path}' changed). Launch specd-project-context-optimizer agent to regenerate.`,
            },
          ],
        }
      }
    }

    // Collect current specs to check their metadata freshness
    const currentSpecs = new Map<string, ResolvedSpec>()
    for (const pattern of config.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, [])
      for (const spec of matches) {
        currentSpecs.set(`${spec.workspace}:${spec.capPath}`, spec)
      }
    }
    for (const pattern of config.contextExcludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, [])
      for (const spec of matches) {
        currentSpecs.delete(`${spec.workspace}:${spec.capPath}`)
      }
    }

    if (currentSpecs.size !== projectMeta.freshness.inputs.specMetadata.length) {
      return {
        metadata: projectMeta,
        isFresh: false,
        warnings: [
          {
            type: 'stale-optimization',
            message:
              'Project-level optimized context is stale (spec selection changed). Launch specd-project-context-optimizer agent to regenerate.',
          },
        ],
      }
    }

    for (const specInput of projectMeta.freshness.inputs.specMetadata) {
      const spec = currentSpecs.get(specInput.id)
      if (!spec) {
        return {
          metadata: projectMeta,
          isFresh: false,
          warnings: [
            {
              type: 'stale-optimization',
              message: `Project-level optimized context is stale (spec '${specInput.id}' no longer in context). Launch specd-project-context-optimizer agent to regenerate.`,
            },
          ],
        }
      }
      const ws = workspaceMap.get(spec.workspace)
      const repo = ws?.specRepo
      if (!repo) {
        return {
          metadata: projectMeta,
          isFresh: false,
          warnings: [
            {
              type: 'stale-optimization',
              message: `Project-level optimized context is stale (workspace '${spec.workspace}' not found). Launch specd-project-context-optimizer agent to regenerate.`,
            },
          ],
        }
      }
      const metadata = await repo.metadata(
        new Spec(spec.workspace, SpecPath.parse(spec.capPath), []),
      )
      if (!metadata?.contentHashes) {
        return {
          metadata: projectMeta,
          isFresh: false,
          warnings: [
            {
              type: 'stale-optimization',
              message: `Project-level optimized context is stale (spec '${specInput.id}' metadata missing). Launch specd-project-context-optimizer agent to regenerate.`,
            },
          ],
        }
      }
      const combinedHash = Object.values(metadata.contentHashes).sort().join(',')
      if (hasher.hash(combinedHash) !== specInput.hash) {
        return {
          metadata: projectMeta,
          isFresh: false,
          warnings: [
            {
              type: 'stale-optimization',
              message: `Project-level optimized context is stale (spec '${specInput.id}' changed). Launch specd-project-context-optimizer agent to regenerate.`,
            },
          ],
        }
      }
    }

    return { metadata: projectMeta, isFresh: true, warnings: [] }
  } catch (err) {
    return {
      metadata: null,
      isFresh: false,
      warnings: [
        {
          type: 'stale-optimization',
          message: `Project-level optimized context is invalid: ${err instanceof Error ? err.message : String(err)}. Launch specd-project-context-optimizer agent to regenerate.`,
        },
      ],
    }
  }
}

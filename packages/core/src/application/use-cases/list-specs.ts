import { parse as parseYaml } from 'yaml'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type Spec } from '../../domain/entities/spec.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'
import { type SpecMetadataStatus, checkMetadataFreshness } from './_shared/metadata-freshness.js'

export type { SpecMetadataStatus }

/**
 * A spec entry returned by {@link ListSpecs}, with resolved title and
 * optional summary.
 */
export interface SpecListEntry {
  /** The workspace this spec belongs to. */
  readonly workspace: string
  /** The spec's capability path within the workspace (e.g. `auth/login`). */
  readonly path: string
  /**
   * Human-readable title: the `title` field from `.specd-metadata.yaml` when
   * present and non-empty, otherwise the last segment of the capability path.
   */
  readonly title: string
  /**
   * Short summary, present only when `includeSummary` was requested and a
   * summary could be resolved. Sources in priority order:
   * 1. `description` field from `.specd-metadata.yaml`
   * 2. Extracted from `spec.md` via {@link extractSpecSummary}
   */
  readonly summary?: string | undefined
  /**
   * Metadata freshness status, present only when `includeMetadataStatus` was requested.
   * - `fresh`: metadata exists and all content hashes match current files
   * - `stale`: metadata exists but hashes are missing or don't match
   * - `missing`: no `.specd-metadata.yaml` file
   */
  readonly metadataStatus?: SpecMetadataStatus | undefined
}

/**
 * Lists all specs across all configured workspaces, resolving title (always)
 * and optionally a short summary per spec.
 *
 * Receives a map of workspace name → `SpecRepository` so that use cases that
 * coordinate across workspaces work correctly. Results are ordered by workspace
 * declaration order, then by spec name within each workspace.
 */
export class ListSpecs {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>

  /**
   * Creates a new `ListSpecs` use case instance.
   *
   * @param specRepos - Map of workspace name to its spec repository
   */
  constructor(specRepos: ReadonlyMap<string, SpecRepository>) {
    this._specRepos = specRepos
  }

  /**
   * Executes the use case.
   *
   * @param options - Execution options
   * @param options.includeSummary - When `true`, resolves a short summary for
   *   each spec in addition to the title. Default: `false`.
   * @param options.includeMetadataStatus - When `true`, resolves metadata freshness
   *   status for each spec. Default: `false`.
   * @returns All specs across all workspaces with resolved titles
   */
  async execute(options?: {
    includeSummary?: boolean
    includeMetadataStatus?: boolean
  }): Promise<SpecListEntry[]> {
    const includeSummary = options?.includeSummary ?? false
    const includeMetadataStatus = options?.includeMetadataStatus ?? false
    const results: SpecListEntry[] = []

    for (const [, repo] of this._specRepos) {
      const specs = await repo.list()
      for (const spec of specs) {
        results.push(await this._resolveEntry(repo, spec, includeSummary, includeMetadataStatus))
      }
    }

    return results
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves title, optional summary, and optional status for a single spec.
   *
   * @param repo - Spec repository to read artifacts from
   * @param spec - The spec entity to resolve
   * @param includeSummary - Whether to resolve a summary
   * @param includeMetadataStatus - Whether to resolve metadata freshness status
   * @returns Resolved spec list entry
   */
  private async _resolveEntry(
    repo: SpecRepository,
    spec: Spec,
    includeSummary: boolean,
    includeMetadataStatus: boolean,
  ): Promise<SpecListEntry> {
    let title: string | undefined
    let description: string | undefined
    let contentHashes: Record<string, string> | undefined
    let hasMetadata = false

    // Read .specd-metadata.yaml for title, description, and contentHashes
    try {
      const artifact = await repo.artifact(spec, '.specd-metadata.yaml')
      if (artifact !== null) {
        hasMetadata = true
        const parsed = parseYaml(artifact.content) as Record<string, unknown> | null
        if (parsed !== null && typeof parsed === 'object') {
          if (typeof parsed['title'] === 'string' && parsed['title'].trim().length > 0) {
            title = parsed['title'].trim()
          }
          if (
            typeof parsed['description'] === 'string' &&
            parsed['description'].trim().length > 0
          ) {
            description = parsed['description'].trim()
          }
          if (
            includeMetadataStatus &&
            parsed['contentHashes'] !== null &&
            typeof parsed['contentHashes'] === 'object' &&
            !Array.isArray(parsed['contentHashes'])
          ) {
            contentHashes = parsed['contentHashes'] as Record<string, string>
          }
        }
      }
    } catch {
      // Silently ignore metadata read errors — title fallback applies below
    }

    // Title fallback: last segment of the capability path
    const pathStr = spec.name.toFsPath('/')
    const resolvedTitle = title ?? pathStr.split('/').at(-1) ?? pathStr

    // Summary resolution (only when requested)
    let summary: string | undefined
    if (includeSummary) {
      if (description !== undefined) {
        summary = description
      } else if (spec.filenames.includes('spec.md')) {
        try {
          const specArtifact = await repo.artifact(spec, 'spec.md')
          if (specArtifact !== null) {
            const extracted = extractSpecSummary(specArtifact.content)
            if (extracted !== null) summary = extracted
          }
        } catch {
          // Silently ignore — spec is still listed without summary
        }
      }
    }

    // Status resolution (only when requested)
    let metadataStatus: SpecMetadataStatus | undefined
    if (includeMetadataStatus) {
      metadataStatus = await this._resolveStatus(repo, spec, hasMetadata, contentHashes)
    }

    return {
      workspace: spec.workspace,
      path: pathStr,
      title: resolvedTitle,
      ...(summary !== undefined ? { summary } : {}),
      ...(metadataStatus !== undefined ? { metadataStatus } : {}),
    }
  }

  /**
   * Resolves metadata freshness status for a single spec.
   *
   * @param repo - Spec repository to read artifacts from
   * @param spec - The spec to check
   * @param hasMetadata - Whether `.specd-metadata.yaml` exists
   * @param contentHashes - Recorded content hashes from metadata, if any
   * @returns The resolved freshness status
   */
  private async _resolveStatus(
    repo: SpecRepository,
    spec: Spec,
    hasMetadata: boolean,
    contentHashes: Record<string, string> | undefined,
  ): Promise<SpecMetadataStatus> {
    if (!hasMetadata) return 'missing'

    const result = await checkMetadataFreshness(contentHashes, async (filename) => {
      try {
        const artifact = await repo.artifact(spec, filename)
        return artifact?.content ?? null
      } catch {
        return null
      }
    })
    return result.allFresh ? 'fresh' : 'stale'
  }
}

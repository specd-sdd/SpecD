import { type SpecRepository } from '../ports/spec-repository.js'
import { type YamlSerializer } from '../ports/yaml-serializer.js'
import { type Spec } from '../../domain/entities/spec.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'
import { strictSpecMetadataSchema } from '../../domain/services/parse-metadata.js'
import { type SpecMetadataStatus } from './_shared/metadata-freshness.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ListWorkspaces } from './list-workspaces.js'

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
   * Human-readable title: the `title` field from `metadata.json` when
   * present and non-empty, otherwise the last segment of the capability path.
   */
  readonly title: string
  /**
   * Short summary, present only when `includeSummary` was requested and a
   * summary could be resolved. Sources in priority order:
   * 1. `description` field from `metadata.json`
   * 2. Extracted from `spec.md` via {@link extractSpecSummary}
   */
  readonly summary?: string | undefined
  /**
   * Metadata freshness status, present only when `includeMetadataStatus` was requested.
   * - `fresh`: metadata exists, is structurally valid, and all content hashes match current files
   * - `stale`: metadata exists and is valid but hashes are missing or don't match
   * - `invalid`: metadata file exists but fails structural validation
   * - `missing`: no `metadata.json` file
   */
  readonly metadataStatus?: SpecMetadataStatus | undefined
}

/**
 * Use case that enumerates specs across all configured workspaces, resolving
 * titles and optionally summaries and metadata status.
 *
 * It uses the project orchestrator to discover repositories and aggregates
 * results ranked by workspace declaration order, then by spec name within
 * each workspace.
 */
export class ListSpecs {
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _yaml: YamlSerializer

  /**
   * Creates a new `ListSpecs` use case instance.
   *
   * @param listWorkspaces - The project orchestrator
   * @param hasher - Content hasher for metadata freshness checks
   * @param yaml - YAML serializer for parsing metadata content
   */
  constructor(listWorkspaces: ListWorkspaces, hasher: ContentHasher, yaml: YamlSerializer) {
    this._listWorkspaces = listWorkspaces
    this._yaml = yaml
    void hasher
  }

  /**
   * Executes the use case.
   *
   * @param options - Execution options
   * @param options.includeSummary - When `true`, resolves a short summary for
   *   each spec in addition to the title. Default: `false`.
   * @param options.includeMetadataStatus - When `true`, resolves metadata freshness
   *   status for each spec. Default: `false`.
   * @param options.workspaces - When provided, only include specs from these workspaces.
   *   Omitted or empty means all workspaces.
   * @returns All specs across all (or filtered) workspaces with resolved titles
   */
  async execute(options?: {
    includeSummary?: boolean
    includeMetadataStatus?: boolean
    workspaces?: readonly string[]
  }): Promise<SpecListEntry[]> {
    const workspaces = await this._listWorkspaces.execute()
    const includeSummary = options?.includeSummary ?? false
    const includeMetadataStatus = options?.includeMetadataStatus ?? false
    const workspaceFilter =
      options?.workspaces !== undefined && options.workspaces.length > 0
        ? new Set(options.workspaces)
        : null
    const results: SpecListEntry[] = []

    for (const ws of workspaces) {
      if (workspaceFilter !== null && !workspaceFilter.has(ws.name)) continue
      const specs = await ws.specRepo.list()
      for (const spec of specs) {
        results.push(
          await this._resolveEntry(ws.specRepo, spec, includeSummary, includeMetadataStatus),
        )
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
    let optimizedDescription: string | undefined
    let hasMetadata = false
    let metadataValid = true
    let metadataStatus: SpecMetadataStatus | undefined

    // Read metadata for title, description, and freshness state.
    try {
      const meta = await repo.metadata(spec)
      if (meta !== null) {
        hasMetadata = true

        if (includeMetadataStatus) {
          const { originalHash, freshness, ...persisted } = meta
          void originalHash
          metadataValid = strictSpecMetadataSchema.safeParse(persisted).success
          metadataStatus = metadataValid ? freshness : 'invalid'
        }

        if (meta.title !== undefined && meta.title.trim().length > 0) {
          title = meta.title.trim()
        }
        if (meta.description !== undefined && meta.description.trim().length > 0) {
          description = meta.description.trim()
        }
        if (
          meta.optimizedDescription !== undefined &&
          meta.optimizedDescription.trim().length > 0
        ) {
          optimizedDescription = meta.optimizedDescription.trim()
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
      if (optimizedDescription !== undefined) {
        summary = optimizedDescription
      } else if (description !== undefined) {
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
    if (includeMetadataStatus) {
      metadataStatus = this._resolveStatus(hasMetadata, metadataValid, metadataStatus)
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
   * @param hasMetadata - Whether `metadata.json` exists
   * @param metadataValid - Whether the metadata passes structural validation
   * @param metadataStatus - Repository-reported freshness status, if available
   * @returns The resolved freshness status
   */
  private _resolveStatus(
    hasMetadata: boolean,
    metadataValid: boolean,
    metadataStatus: SpecMetadataStatus | undefined,
  ): SpecMetadataStatus {
    if (!hasMetadata) return 'missing'
    if (!metadataValid) return 'invalid'
    return metadataStatus ?? 'stale'
  }
}

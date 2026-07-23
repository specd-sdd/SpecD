import {
  type SpecRepository,
  type SpecSearchResult,
  type SpecSearchMatch,
} from '../ports/spec-repository.js'
import { type YamlSerializer } from '../ports/yaml-serializer.js'
import { type Spec } from '../../domain/entities/spec.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type ListWorkspaces, type ProjectWorkspace } from './list-workspaces.js'

export type { SpecSearchMatch }

/** A spec entry returned by {@link SearchSpecs}, with resolved title, score, and matches. */
export interface SpecSearchEntry {
  /** The workspace name where the spec lives. */
  readonly workspace: string
  /** The spec path within the workspace (slash-separated). */
  readonly path: string
  /** The resolved title from metadata or H1 extraction. */
  readonly title: string
  /** The resolved summary from metadata or first paragraph. */
  readonly summary?: string
  /** The relevance score (e.g. from BM25). */
  readonly score: number
  /** The match locations found in the artifacts. */
  readonly matches: readonly SpecSearchMatch[]
}

/** Optional filters and enrichment flags for {@link SearchSpecs}. */
export interface SearchSpecsOptions {
  /** When provided, only search within these workspace names. */
  readonly workspaces?: readonly string[]
  /** When `true`, resolves a summary for each result result. Default: `false`. */
  readonly includeSummary?: boolean
  /** Maximum number of total results to return across all workspaces. */
  readonly limit?: number
}

/**
 * Searches spec content across all configured workspaces, resolving title and
 * optionally summary per result.
 *
 * It uses the project orchestrator to discover repositories and aggregates
 * results ranked by score descending.
 */
export class SearchSpecs {
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _hasher: ContentHasher
  private readonly _yaml: YamlSerializer

  /**
   * Creates a new SearchSpecs instance.
   *
   * @param listWorkspaces - The project orchestrator.
   * @param hasher - Content hasher for spec hashing.
   * @param yaml - YAML serializer for parsing artifacts.
   */
  constructor(listWorkspaces: ListWorkspaces, hasher: ContentHasher, yaml: YamlSerializer) {
    this._listWorkspaces = listWorkspaces
    this._hasher = hasher
    this._yaml = yaml
  }

  /**
   * Executes the spec search across all workspaces.
   *
   * @param query - The search query string.
   * @param options - Optional search options (workspaces, includeSummary, limit).
   * @returns Array of search results ordered by score descending.
   */
  async execute(query: string, options?: SearchSpecsOptions): Promise<SpecSearchEntry[]> {
    const workspaces = await this._listWorkspaces.execute()
    const workspaceFilter =
      options?.workspaces !== undefined && options.workspaces.length > 0
        ? new Set(options.workspaces)
        : null
    const includeSummary = options?.includeSummary ?? false
    const allResults: Array<{ result: SpecSearchResult; workspace: ProjectWorkspace }> = []

    for (const ws of workspaces) {
      if (workspaceFilter !== null && !workspaceFilter.has(ws.name)) continue
      try {
        const results = await ws.specRepo.search(
          query,
          options?.limit !== undefined ? { limit: options.limit } : undefined,
        )
        for (const result of results) {
          allResults.push({ result, workspace: ws })
        }
      } catch {
        // Silent error handling — skip this workspace
      }
    }

    allResults.sort((a, b) => b.result.score - a.result.score)

    const entries = allResults.map(async ({ result, workspace }) => {
      const spec = result.spec
      const pathStr = spec.name.toFsPath('/')
      const title = await this._resolveTitle(workspace.specRepo, spec)
      const entry: SpecSearchEntry = {
        workspace: workspace.name,
        path: pathStr,
        title,
        score: result.score,
        matches: result.matches,
      }

      if (includeSummary) {
        const summary = await this._resolveSummary(workspace.specRepo, spec)
        if (summary !== undefined) {
          return { ...entry, summary }
        }
      }

      return entry
    })

    const resolved = await Promise.all(entries)

    if (options?.limit !== undefined && options.limit > 0) {
      return resolved.slice(0, options.limit)
    }

    return resolved
  }

  /**
   * Resolves the display title for a spec.
   *
   * @param repo - Repository to read metadata or artifacts from.
   * @param spec - The spec to resolve title for.
   * @returns The resolved title string.
   */
  private async _resolveTitle(repo: SpecRepository, spec: Spec): Promise<string> {
    try {
      const meta = await repo.metadata(spec)
      if (meta?.title !== undefined && meta.title.trim().length > 0) {
        return meta.title.trim()
      }
    } catch {
      // fall through
    }

    if (spec.hasArtifact('spec.md')) {
      try {
        const specArtifact = await repo.artifact(spec, 'spec.md')
        if (specArtifact !== null) {
          const headingMatch = /^#\s+(.+)/m.exec(specArtifact.content)
          if (headingMatch !== null && headingMatch[1] !== undefined) {
            return headingMatch[1].trim()
          }
        }
      } catch {
        // fall through
      }
    }

    return spec.name.toString()
  }

  /**
   * Resolves the display summary for a spec.
   *
   * @param repo - Repository to read metadata or artifacts from.
   * @param spec - The spec to resolve summary for.
   * @returns The resolved summary string, or undefined if not found.
   */
  private async _resolveSummary(repo: SpecRepository, spec: Spec): Promise<string | undefined> {
    try {
      const meta = await repo.metadata(spec)
      if (meta?.description !== undefined && meta.description.trim().length > 0) {
        return meta.description.trim()
      }
    } catch {
      // fall through
    }

    if (spec.hasArtifact('spec.md')) {
      try {
        const specArtifact = await repo.artifact(spec, 'spec.md')
        if (specArtifact !== null) {
          const extracted = extractSpecSummary(specArtifact.content)
          if (extracted !== null) return extracted
        }
      } catch {
        // fall through
      }
    }

    return undefined
  }
}

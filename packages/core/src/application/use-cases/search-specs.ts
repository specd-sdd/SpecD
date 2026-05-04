import {
  type SpecRepository,
  type SpecSearchResult,
  type SpecSearchMatch,
} from '../ports/spec-repository.js'
import { type YamlSerializer } from '../ports/yaml-serializer.js'
import { type Spec } from '../../domain/entities/spec.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'
import { type ContentHasher } from '../ports/content-hasher.js'

export type { SpecSearchMatch }

/** A spec entry returned by {@link SearchSpecs}, with resolved title, score, and matches. */
export interface SpecSearchEntry {
  readonly workspace: string
  readonly path: string
  readonly title: string
  readonly score: number
  readonly matches: readonly SpecSearchMatch[]
  readonly summary?: string
}

/** Options for {@link SearchSpecs.execute}. */
export interface SearchSpecsOptions {
  readonly workspaces?: readonly string[]
  readonly includeSummary?: boolean
  readonly limit?: number
}

/**
 * Searches spec content across all configured workspaces, resolving title and
 * optionally summary per result.
 *
 * Receives a map of workspace name → `SpecRepository` so that search
 * coordinates across workspaces. Results are ordered by score descending.
 */
export class SearchSpecs {
  private readonly _specRepos: ReadonlyMap<string, SpecRepository>
  private readonly _hasher: ContentHasher
  private readonly _yaml: YamlSerializer

  /**
   * Creates a new SearchSpecs instance.
   * @param specRepos - Map of workspace name to SpecRepository.
   * @param hasher - Content hasher for spec hashing.
   * @param yaml - YAML serializer for parsing artifacts.
   */
  constructor(
    specRepos: ReadonlyMap<string, SpecRepository>,
    hasher: ContentHasher,
    yaml: YamlSerializer,
  ) {
    this._specRepos = specRepos
    this._hasher = hasher
    this._yaml = yaml
  }

  /**
   * Executes the spec search across all workspaces.
   * @param query - The search query string.
   * @param options - Optional search options (workspaces, includeSummary, limit).
   * @returns Array of search results ordered by score descending.
   */
  async execute(query: string, options?: SearchSpecsOptions): Promise<SpecSearchEntry[]> {
    const workspaceFilter =
      options?.workspaces !== undefined && options.workspaces.length > 0
        ? new Set(options.workspaces)
        : null
    const includeSummary = options?.includeSummary ?? false
    const allResults: Array<{ result: SpecSearchResult; workspace: string }> = []

    for (const [wsName, repo] of this._specRepos) {
      if (workspaceFilter !== null && !workspaceFilter.has(wsName)) continue
      try {
        const results = await repo.search(
          query,
          options?.limit !== undefined ? { limit: options.limit } : undefined,
        )
        for (const result of results) {
          allResults.push({ result, workspace: wsName })
        }
      } catch {
        // Silent error handling — skip this workspace
      }
    }

    allResults.sort((a, b) => b.result.score - a.result.score)

    const entries = allResults.map(async ({ result, workspace }) => {
      const repo = repoForWorkspace(this._specRepos, workspace)
      const spec = result.spec
      const pathStr = spec.name.toFsPath('/')
      const title = await this._resolveTitle(repo, spec)
      const entry: SpecSearchEntry = {
        workspace,
        path: pathStr,
        title,
        score: result.score,
        matches: result.matches,
      }

      if (includeSummary) {
        const summary = await this._resolveSummary(repo, spec)
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
   * @param repo - The spec repository.
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
    const pathStr = spec.name.toFsPath('/')
    return pathStr.split('/').at(-1) ?? pathStr
  }

  /**
   * Resolves the summary/description for a spec.
   * @param repo - The spec repository.
   * @param spec - The spec to resolve summary for.
   * @returns The resolved summary string or undefined.
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

    if (spec.filenames.includes('spec.md')) {
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

/**
 * Looks up a SpecRepository by workspace name.
 * @param repos - Map of workspace name to repository.
 * @param workspace - The workspace name to look up.
 * @returns The SpecRepository for that workspace.
 * @throws Error if no repository exists for the workspace.
 */
function repoForWorkspace(
  repos: ReadonlyMap<string, SpecRepository>,
  workspace: string,
): SpecRepository {
  const repo = repos.get(workspace)
  if (repo === undefined) throw new Error(`no repository for workspace "${workspace}"`)
  return repo
}

import { parse as parseYaml } from 'yaml'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type Spec } from '../../domain/entities/spec.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'

/**
 * A spec entry returned by {@link ListSpecs}, with resolved title and
 * optional summary.
 */
export interface SpecListEntry {
  /** The workspace this spec belongs to. */
  workspace: string
  /** The spec's capability path within the workspace (e.g. `auth/login`). */
  path: string
  /**
   * Human-readable title: the `title` field from `.specd-metadata.yaml` when
   * present and non-empty, otherwise the last segment of the capability path.
   */
  title: string
  /**
   * Short summary, present only when `includeSummary` was requested and a
   * summary could be resolved. Sources in priority order:
   * 1. `description` field from `.specd-metadata.yaml`
   * 2. Extracted from `spec.md` via {@link extractSpecSummary}
   */
  summary?: string | undefined
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
   * @returns All specs across all workspaces with resolved titles
   */
  async execute(options?: { includeSummary?: boolean }): Promise<SpecListEntry[]> {
    const includeSummary = options?.includeSummary ?? false
    const results: SpecListEntry[] = []

    for (const [, repo] of this._specRepos) {
      const specs = await repo.list()
      for (const spec of specs) {
        results.push(await this._resolveEntry(repo, spec, includeSummary))
      }
    }

    return results
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves title and optional summary for a single spec.
   *
   * @param repo - Spec repository to read artifacts from
   * @param spec - The spec entity to resolve
   * @param includeSummary - Whether to resolve a summary
   * @returns Resolved spec list entry
   */
  private async _resolveEntry(
    repo: SpecRepository,
    spec: Spec,
    includeSummary: boolean,
  ): Promise<SpecListEntry> {
    let title: string | undefined
    let description: string | undefined

    // Read .specd-metadata.yaml for title and description
    try {
      const artifact = await repo.artifact(spec, '.specd-metadata.yaml')
      if (artifact !== null) {
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

    return {
      workspace: spec.workspace,
      path: pathStr,
      title: resolvedTitle,
      ...(summary !== undefined ? { summary } : {}),
    }
  }
}

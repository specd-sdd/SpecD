import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { type ContextWarning } from './_shared/context-warning.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { checkMetadataFreshness } from './_shared/metadata-freshness.js'
import { type ContentHasher } from '../ports/content-hasher.js'

/** Valid section filter flags for spec context queries. */
export type SpecContextSectionFlag = 'rules' | 'constraints' | 'scenarios'

/** Input for the {@link GetSpecContext} use case. */
export interface GetSpecContextInput {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly workspace: string
  /** The spec path within the workspace. */
  readonly specPath: SpecPath
  /** When `true`, follows `dependsOn` links transitively. */
  readonly followDeps?: boolean
  /** Limits dependency traversal depth. Only meaningful when `followDeps` is `true`. */
  readonly depth?: number
  /** When present, restricts output to the listed section types. */
  readonly sections?: ReadonlyArray<SpecContextSectionFlag>
}

/** A resolved spec entry in the context result. */
export interface SpecContextEntry {
  /** Display label for the spec (e.g. `'default:auth/login'`). */
  readonly spec: string
  /** Spec title from metadata. */
  readonly title?: string
  /** Spec description from metadata. */
  readonly description?: string
  /** Extracted rules from metadata. */
  readonly rules?: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  /** Extracted constraints from metadata. */
  readonly constraints?: readonly string[]
  /** Extracted scenarios from metadata. */
  readonly scenarios?: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
  /** Whether the metadata is stale or absent. */
  readonly stale: boolean
}

/** Result returned by the {@link GetSpecContext} use case. */
export interface GetSpecContextResult {
  /** Resolved context entries for the spec and its dependencies. */
  readonly entries: readonly SpecContextEntry[]
  /** Advisory warnings encountered during resolution. */
  readonly warnings: readonly ContextWarning[]
}

/**
 * Builds structured context entries for a single spec, optionally following
 * `dependsOn` links transitively.
 *
 * Checks metadata freshness using SHA-256 content hashes. When metadata is
 * stale or absent, returns a minimal stale entry. Dependency traversal uses
 * DFS with cycle detection.
 */
export class GetSpecContext {
  private readonly _specs: ReadonlyMap<string, SpecRepository>
  private readonly _hasher: ContentHasher

  /**
   * Creates a new `GetSpecContext` use case instance.
   *
   * @param specs - Spec repositories keyed by workspace name
   * @param hasher - Content hasher for metadata freshness checks
   */
  constructor(specs: ReadonlyMap<string, SpecRepository>, hasher: ContentHasher) {
    this._specs = specs
    this._hasher = hasher
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns Structured context entries and warnings
   */
  async execute(input: GetSpecContextInput): Promise<GetSpecContextResult> {
    const warnings: ContextWarning[] = []
    const entries: SpecContextEntry[] = []

    const repo = this._specs.get(input.workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(input.workspace)
    }

    const spec = await repo.get(input.specPath)
    if (spec === null) {
      throw new SpecNotFoundError(`${input.workspace}:${input.specPath.toString()}`)
    }

    const rootLabel = `${input.workspace}:${input.specPath.toString()}`
    const metadata = await repo.metadata(spec)
    entries.push(await this._buildEntry(rootLabel, repo, spec, metadata, input.sections, warnings))

    if (input.followDeps) {
      const maxDepth = input.depth
      const seen = new Set<string>([rootLabel])
      await this._traverseDeps(
        metadata,
        input.workspace,
        entries,
        seen,
        warnings,
        input.sections,
        maxDepth,
        0,
      )
    }

    return { entries, warnings }
  }

  /**
   * Builds a context entry from a spec's metadata.
   *
   * @param specLabel - Display label for the spec
   * @param repo - Repository for artifact content resolution
   * @param spec - The spec entity
   * @param metadata - Parsed metadata, or `null` if absent
   * @param sections - Optional section filter flags
   * @param warnings - Mutable array to collect warnings
   * @returns The constructed context entry
   */
  private async _buildEntry(
    specLabel: string,
    repo: SpecRepository,
    spec: import('../../domain/entities/spec.js').Spec,
    metadata: SpecMetadata | null,
    sections: ReadonlyArray<SpecContextSectionFlag> | undefined,
    warnings: ContextWarning[],
  ): Promise<SpecContextEntry> {
    const showAll = sections === undefined || sections.length === 0

    if (metadata !== null) {
      const freshnessResult = await checkMetadataFreshness(
        metadata.contentHashes,
        async (filename) => {
          const artifact = await repo.artifact(spec, filename)
          return artifact?.content ?? null
        },
        (c) => this._hasher.hash(c),
      )

      if (!freshnessResult.allFresh) {
        warnings.push({
          type: 'stale-metadata',
          path: specLabel,
          message: `Metadata for '${specLabel}' is stale`,
        })
      }

      if (freshnessResult.allFresh) {
        return {
          spec: specLabel,
          stale: false,
          ...(showAll && metadata.title !== undefined ? { title: metadata.title } : {}),
          ...(showAll && metadata.description !== undefined
            ? { description: metadata.description }
            : {}),
          ...((showAll || sections?.includes('rules')) &&
          metadata.rules !== undefined &&
          metadata.rules.length > 0
            ? { rules: metadata.rules }
            : {}),
          ...((showAll || sections?.includes('constraints')) &&
          metadata.constraints !== undefined &&
          metadata.constraints.length > 0
            ? { constraints: metadata.constraints }
            : {}),
          ...((showAll || sections?.includes('scenarios')) &&
          metadata.scenarios !== undefined &&
          metadata.scenarios.length > 0
            ? { scenarios: metadata.scenarios }
            : {}),
        }
      }
    }

    return { spec: specLabel, stale: true }
  }

  /**
   * Recursively traverses `dependsOn` links from a spec's metadata.
   *
   * @param metadata - Parsed metadata of the current spec, or `null` if absent
   * @param defaultWorkspace - Workspace to assume when deps omit one
   * @param entries - Mutable array collecting resolved entries
   * @param seen - Set of already-visited spec labels for cycle detection
   * @param warnings - Mutable array to collect warnings
   * @param sections - Optional section filter flags
   * @param maxDepth - Maximum traversal depth, or undefined for unlimited
   * @param currentDepth - Current recursion depth
   */
  private async _traverseDeps(
    metadata: SpecMetadata | null,
    defaultWorkspace: string,
    entries: SpecContextEntry[],
    seen: Set<string>,
    warnings: ContextWarning[],
    sections: ReadonlyArray<SpecContextSectionFlag> | undefined,
    maxDepth: number | undefined,
    currentDepth: number,
  ): Promise<void> {
    if (metadata === null) {
      warnings.push({
        type: 'missing-metadata',
        path: `${defaultWorkspace}:unknown`,
        message: `No metadata found — dependency traversal may be incomplete. Run metadata generation to fix.`,
      })
      return
    }

    if (metadata.dependsOn === undefined || metadata.dependsOn.length === 0) return

    if (maxDepth !== undefined && currentDepth >= maxDepth) return

    for (const dep of metadata.dependsOn) {
      const { workspace: depWorkspace, capPath: depCapPath } = parseSpecId(dep, defaultWorkspace)
      const depLabel = `${depWorkspace}:${depCapPath}`

      if (seen.has(depLabel)) continue
      seen.add(depLabel)

      const repo = this._specs.get(depWorkspace)
      if (repo === undefined) {
        warnings.push({
          type: 'unknown-workspace',
          message: `Dependency workspace '${depWorkspace}' not found`,
        })
        continue
      }

      const depSpec = await repo.get(SpecPath.parse(depCapPath))
      if (depSpec === null) {
        warnings.push({
          type: 'missing-spec',
          path: depLabel,
          message: `Dependency '${depLabel}' not found`,
        })
        continue
      }

      const depMetadata = await repo.metadata(depSpec)
      entries.push(await this._buildEntry(depLabel, repo, depSpec, depMetadata, sections, warnings))

      await this._traverseDeps(
        depMetadata,
        depWorkspace,
        entries,
        seen,
        warnings,
        sections,
        maxDepth,
        currentDepth + 1,
      )
    }
  }
}

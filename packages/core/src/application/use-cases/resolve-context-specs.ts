import { InvalidInputError } from '../../domain/errors/index.js'
import { type CompileContextConfig } from './compile-context.js'
import { type ListWorkspaces } from './list-workspaces.js'
import {
  type ConfiguredContextSpecSource,
  resolveConfiguredContextSpecs,
} from './_shared/resolve-configured-context-specs.js'
import { type ResolvedSpec } from './_shared/spec-pattern-matching.js'

/** Optional filters for configured context specs. */
export interface ResolveContextSpecsInput {
  /** Named workspaces whose workspace-level patterns are active. Omitted or empty means all configured workspaces. */
  readonly workspaces?: readonly string[]
  /**
   * When true, skip project-level include/exclude patterns entirely.
   * The result's `project` array is always empty; only workspace-level patterns run.
   */
  readonly workspacesOnly?: boolean
}

/**
 * Spec IDs partitioned by the configuration layer that included them.
 *
 * **Dual listing is required:** when project-level patterns and a workspace's
 * patterns both include the same ID (and it survives excludes), that ID MUST
 * appear under `project` **and** under the corresponding `workspaces[name]`
 * entry. Callers rely on this to distinguish project vs workspace provenance.
 */
export interface ResolveContextSpecsResult {
  /** Specs included by project-level patterns that remain after all excludes. */
  readonly project: readonly string[]
  /** Specs included by each workspace's patterns that remain after all excludes. */
  readonly workspaces: Readonly<Record<string, readonly string[]>>
}

/** Resolves context spec IDs without rendering context content. */
export class ResolveContextSpecs {
  /**
   * Creates a resolver from workspace discovery and context configuration.
   *
   * @param _listWorkspaces - Configured workspace provider.
   * @param _config - Context pattern configuration.
   */
  constructor(
    private readonly _listWorkspaces: ListWorkspaces,
    private readonly _config: CompileContextConfig,
  ) {}

  /**
   * Resolves the configured spec IDs for the requested scope, partitioned by include source.
   *
   * @param input - Optional workspace filter / workspaces-only mode.
   * @returns Project-layer and per-workspace IDs that remain after excludes.
   */
  async execute(input: ResolveContextSpecsInput = {}): Promise<ResolveContextSpecsResult> {
    const workspaces = await this._listWorkspaces.execute()
    const workspaceMap = new Map(workspaces.map((workspace) => [workspace.name, workspace]))
    const requested = [...new Set(input.workspaces ?? [])]
    const unknown = requested.filter((name) => !workspaceMap.has(name))
    if (unknown.length === 1) {
      throw new InvalidInputError(`Unknown workspace '${unknown[0]}'`)
    }
    if (unknown.length > 1) {
      throw new InvalidInputError(
        `Unknown workspaces: ${unknown.map((name) => `'${name}'`).join(', ')}`,
      )
    }
    const activeWorkspaces = new Set(
      requested.length === 0 ? workspaces.map((workspace) => workspace.name) : requested,
    )
    const workspacesOnly = input.workspacesOnly === true

    /** Effective set — same collector semantics CompileContext uses. */
    const collected = new Map<string, ResolvedSpec>()
    /** Include provenance for IDs still present in {@link collected}. */
    const sourcesById = new Map<string, Set<string>>()

    const addSource = (specId: string, source: ConfiguredContextSpecSource): void => {
      const bucket = sourcesById.get(specId) ?? new Set()
      bucket.add(source.kind === 'project' ? 'project' : source.workspace)
      sourcesById.set(specId, bucket)
    }

    await resolveConfiguredContextSpecs({
      config: workspacesOnly
        ? { ...this._config, contextIncludeSpecs: [], contextExcludeSpecs: [] }
        : this._config,
      activeWorkspaces,
      workspaceMap,
      warnings: [],
      collector: {
        include: (spec) => collected.set(`${spec.workspace}:${spec.capPath}`, spec),
        exclude: (spec) => {
          const specId = `${spec.workspace}:${spec.capPath}`
          collected.delete(specId)
          sourcesById.delete(specId)
        },
      },
      onOperation: (op, spec, source) => {
        if (op === 'include') addSource(`${spec.workspace}:${spec.capPath}`, source)
      },
    })

    const project: string[] = []
    const workspaceBuckets = new Map<string, string[]>()
    for (const specId of collected.keys()) {
      const sources = sourcesById.get(specId)
      if (sources === undefined) continue
      if (!workspacesOnly && sources.has('project')) project.push(specId)
      for (const source of sources) {
        if (source === 'project') continue
        const list = workspaceBuckets.get(source) ?? []
        list.push(specId)
        workspaceBuckets.set(source, list)
      }
    }

    const workspacesOut: Record<string, readonly string[]> = {}
    for (const workspace of workspaces) {
      if (!activeWorkspaces.has(workspace.name)) continue
      workspacesOut[workspace.name] = workspaceBuckets.get(workspace.name) ?? []
    }

    return { project, workspaces: workspacesOut }
  }
}

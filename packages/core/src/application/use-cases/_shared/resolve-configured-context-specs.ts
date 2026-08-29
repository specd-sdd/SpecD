import { type CompileContextConfig } from '../compile-context.js'
import { type ProjectWorkspace } from '../list-workspaces.js'
import { type ContextWarning } from './context-warning.js'
import { listMatchingSpecs, type ResolvedSpec } from './spec-pattern-matching.js'

/** Origin of a configured context include/exclude operation. */
export type ConfiguredContextSpecSource =
  | { readonly kind: 'project' }
  | { readonly kind: 'workspace'; readonly workspace: string }

/**
 * Effective-set collector — same include/exclude surface CompileContext used
 * before the shared-helper extraction (no provenance arguments).
 */
export interface ConfiguredContextSpecCollector {
  /** Records a spec matched by an include pattern. */
  include(spec: ResolvedSpec): void
  /** Removes a spec matched by an exclude pattern. */
  exclude(spec: ResolvedSpec): void
}

/** Optional provenance callback for callers that need project vs workspace origin. */
export type ConfiguredContextSpecOperationListener = (
  op: 'include' | 'exclude',
  spec: ResolvedSpec,
  source: ConfiguredContextSpecSource,
) => void

/** Input for {@link resolveConfiguredContextSpecs}. */
export interface ResolveConfiguredContextSpecsInput {
  /** Project and workspace context-pattern configuration. */
  readonly config: CompileContextConfig
  /** Workspaces whose workspace-level patterns are active. */
  readonly activeWorkspaces: ReadonlySet<string>
  /** Initialized workspaces by name. */
  readonly workspaceMap: ReadonlyMap<string, ProjectWorkspace>
  /**
   * Effective-set collector. Receives the same ordered include/exclude stream
   * CompileContext observed before extraction (`all` path — no source args).
   */
  readonly collector: ConfiguredContextSpecCollector
  /** Diagnostic sink used by the existing pattern matcher. */
  readonly warnings: ContextWarning[]
  /**
   * Optional provenance sink. Fired for every include/exclude with the layer
   * that produced the match. Does not replace or alter {@link collector}.
   */
  readonly onOperation?: ConfiguredContextSpecOperationListener
}

/**
 * Resolves project and active-workspace context patterns in compilation order.
 *
 * This is intentionally content-free: callers decide how inclusion and exclusion
 * affect their own collection, while all glob semantics remain centralized here.
 *
 * @param input - Configuration, active workspaces, and collection callbacks.
 */
export async function resolveConfiguredContextSpecs(
  input: ResolveConfiguredContextSpecsInput,
): Promise<void> {
  const { config, activeWorkspaces, workspaceMap, collector, warnings, onOperation } = input
  const projectSource: ConfiguredContextSpecSource = { kind: 'project' }

  const include = (spec: ResolvedSpec, source: ConfiguredContextSpecSource): void => {
    collector.include(spec)
    onOperation?.('include', spec, source)
  }
  const exclude = (spec: ResolvedSpec, source: ConfiguredContextSpecSource): void => {
    collector.exclude(spec)
    onOperation?.('exclude', spec, source)
  }

  for (const pattern of config.contextIncludeSpecs ?? []) {
    const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, warnings)
    for (const spec of matches) include(spec, projectSource)
  }

  for (const pattern of config.contextExcludeSpecs ?? []) {
    const matches = await listMatchingSpecs(pattern, 'default', true, workspaceMap, warnings)
    for (const spec of matches) exclude(spec, projectSource)
  }

  for (const [workspace, workspaceConfig] of Object.entries(config.workspaces ?? {})) {
    if (!activeWorkspaces.has(workspace)) continue
    const source: ConfiguredContextSpecSource = { kind: 'workspace', workspace }
    for (const pattern of workspaceConfig.contextIncludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, workspace, false, workspaceMap, warnings)
      for (const spec of matches) include(spec, source)
    }
  }

  for (const [workspace, workspaceConfig] of Object.entries(config.workspaces ?? {})) {
    if (!activeWorkspaces.has(workspace)) continue
    const source: ConfiguredContextSpecSource = { kind: 'workspace', workspace }
    for (const pattern of workspaceConfig.contextExcludeSpecs ?? []) {
      const matches = await listMatchingSpecs(pattern, workspace, false, workspaceMap, warnings)
      for (const spec of matches) exclude(spec, source)
    }
  }
}

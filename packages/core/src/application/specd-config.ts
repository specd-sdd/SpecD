/**
 * A lifecycle hook declared in the project-level `workflow` section of `specd.yaml`.
 *
 * Project-level hooks use the same run/instruction discriminant as schema hooks.
 * Unlike schema workflow steps, project-level steps may not declare `requires`.
 */
export type SpecdWorkflowHook =
  | { readonly type: 'run'; readonly command: string }
  | { readonly type: 'instruction'; readonly text: string }

/**
 * A project-level workflow step from `specd.yaml`.
 *
 * Project-level workflow entries may not declare `requires` — only `step` and
 * `hooks` are valid. `requires` is schema-only.
 */
export interface SpecdWorkflowStep {
  /** The step name matching a schema workflow step (e.g. `'implementing'`). */
  readonly step: string
  /** Hooks to fire before and after the step. */
  readonly hooks: {
    readonly pre: readonly SpecdWorkflowHook[]
    readonly post: readonly SpecdWorkflowHook[]
  }
}

/**
 * A project-level context entry from the `context` section of `specd.yaml`.
 *
 * Each entry is either an inline instruction or a file reference. The file
 * content is read and injected verbatim at context-compilation time.
 */
export type SpecdContextEntry = { readonly file: string } | { readonly instruction: string }

/** Per-workspace configuration resolved from `specd.yaml`. */
export interface SpecdWorkspaceConfig {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly name: string
  /** Absolute path to the specs root for this workspace. */
  readonly specsPath: string
  /**
   * Absolute path to the schemas directory for this workspace.
   *
   * `null` when not configured (non-`default` workspaces that omit `schemas`
   * have no local schemas — schema references targeting them produce
   * `SchemaNotFoundError`).
   */
  readonly schemasPath: string | null
  /** Absolute path to the implementation code root for this workspace. */
  readonly codeRoot: string
  /** Ownership relationship this project has with this workspace's specs. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /**
   * `true` when `specsPath` is outside the git repository root.
   *
   * Inferred by `FsConfigLoader` — not declared in `specd.yaml`.
   */
  readonly isExternal: boolean
  /**
   * Workspace-level context spec include patterns.
   *
   * Applied only when this workspace is active in the current change.
   * Omitting the workspace qualifier resolves to this workspace.
   */
  readonly contextIncludeSpecs?: readonly string[]
  /**
   * Workspace-level context spec exclude patterns.
   *
   * Applied only when this workspace is active in the current change.
   */
  readonly contextExcludeSpecs?: readonly string[]
}

/** Storage paths resolved from the `storage` section of `specd.yaml`. */
export interface SpecdStorageConfig {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /**
   * Optional pattern controlling the archive directory structure.
   *
   * Supports variables: `{{change.name}}`, `{{change.archivedName}}`,
   * `{{change.workspace}}`, `{{year}}`, `{{date}}`. Defaults to
   * `{{change.archivedName}}`.
   */
  readonly archivePattern?: string
}

/**
 * Fully-resolved project configuration derived from `specd.yaml`.
 *
 * All paths are absolute. `isExternal` is inferred — not declared in the YAML.
 * Delivery mechanisms (`@specd/cli`, `@specd/mcp`) receive a `SpecdConfig`
 * from `ConfigLoader` and pass it to `createKernel()` or individual
 * use-case factory functions.
 */
export interface SpecdConfig {
  /** Absolute path to the directory containing the active `specd.yaml`. */
  readonly projectRoot: string
  /** Schema reference string as declared in `specd.yaml` (e.g. `'@specd/schema-std'`). */
  readonly schemaRef: string
  /** All configured workspaces. Must contain exactly one `name === 'default'` entry. */
  readonly workspaces: readonly SpecdWorkspaceConfig[]
  /** Resolved storage paths. */
  readonly storage: SpecdStorageConfig
  /** Approval gate settings (both default to `false`). */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  /** Project-level workflow hook additions (matched to schema steps by `step` name). */
  readonly workflow?: readonly SpecdWorkflowStep[]
  /** Per-artifact constraint strings injected after the schema instruction. */
  readonly artifactRules?: Readonly<Record<string, readonly string[]>>
  /** Freeform context entries prepended to the compiled context. */
  readonly context?: readonly SpecdContextEntry[]
  /** When `true`, specd may invoke an LLM for enriched output (default: `false`). */
  readonly llmOptimizedContext?: boolean
}

/**
 * Type guard that returns `true` when `v` is a {@link SpecdConfig}.
 *
 * Used in factory function overloads to distinguish the two call signatures:
 * `createX(config: SpecdConfig)` vs `createX(context, options)`.
 *
 * @param v - The value to test
 * @returns `true` when `v` is a `SpecdConfig`
 */
export function isSpecdConfig(v: unknown): v is SpecdConfig {
  return (
    typeof v === 'object' && v !== null && 'projectRoot' in v && 'workspaces' in v && 'storage' in v
  )
}

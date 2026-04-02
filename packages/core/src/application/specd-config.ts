import { z } from 'zod'
import { type SchemaOperations } from '../domain/services/merge-schema-layers.js'

/**
 * A project-level context entry from the `context` section of `specd.yaml`.
 *
 * Each entry is either an inline instruction or a file reference. The file
 * content is read and injected verbatim at context-compilation time.
 */
export type SpecdContextEntry = { readonly file: string } | { readonly instruction: string }

/** Per-workspace code graph configuration from `specd.yaml`. */
export interface SpecdWorkspaceGraphConfig {
  /**
   * Whether `.gitignore` files are loaded and applied during file discovery.
   * Defaults to `true`. When `false`, only `excludePaths` governs exclusion.
   */
  readonly respectGitignore?: boolean
  /**
   * Gitignore-syntax exclusion patterns applied during file discovery.
   * Supports `!` negation. When absent, built-in defaults apply.
   * When present, replaces built-in defaults entirely.
   */
  readonly excludePaths?: readonly string[]
}

/**
 * Named adapter binding preserved from `specd.yaml`.
 *
 * `config` is adapter-owned opaque data. The built-in `fs` loader continues to
 * resolve absolute paths onto the legacy `*Path` fields for compatibility, but
 * the kernel uses these bindings to select the concrete factory implementation.
 */
export interface SpecdAdapterBinding {
  /** Registered adapter name, e.g. `"fs"`. */
  readonly adapter: string
  /** Adapter-owned configuration payload preserved from YAML. */
  readonly config: Record<string, unknown>
}

/** Per-workspace configuration resolved from `specd.yaml`. */
export interface SpecdWorkspaceConfig {
  /** The workspace name (e.g. `'default'`, `'billing'`). */
  readonly name: string
  /**
   * Optional logical path prefix for all specs in this workspace.
   *
   * When set, a spec at `architecture/` on disk becomes `<prefix>/architecture`
   * in the specd model. When omitted, specs use bare capability paths.
   */
  readonly prefix?: string
  /** Absolute path to the specs root for this workspace. */
  readonly specsPath: string
  /** Named adapter binding for the workspace specs repository. */
  readonly specsAdapter: SpecdAdapterBinding
  /**
   * Absolute path to the schemas directory for this workspace.
   *
   * `null` when not configured (non-`default` workspaces that omit `schemas`
   * have no local schemas — schema references targeting them produce
   * `SchemaNotFoundError`).
   */
  readonly schemasPath: string | null
  /** Named adapter binding for the workspace schema repository. */
  readonly schemasAdapter: SpecdAdapterBinding | null
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
  /** Code graph configuration for this workspace. */
  readonly graph?: SpecdWorkspaceGraphConfig
}

/** Storage paths resolved from the `storage` section of `specd.yaml`. */
export interface SpecdStorageConfig {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Named adapter binding for the active changes repository. */
  readonly changesAdapter: SpecdAdapterBinding
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Named adapter binding for the shelved drafts repository. */
  readonly draftsAdapter: SpecdAdapterBinding
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Named adapter binding for the discarded changes repository. */
  readonly discardedAdapter: SpecdAdapterBinding
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /** Named adapter binding for the archive repository. */
  readonly archiveAdapter: SpecdAdapterBinding
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
  /** Absolute path to the specd-owned config root. */
  readonly configPath: string
  /** Schema reference string as declared in `specd.yaml` (e.g. `'@specd/schema-std'`). */
  readonly schemaRef: string
  /** All configured workspaces. Must contain exactly one `name === 'default'` entry. */
  readonly workspaces: readonly SpecdWorkspaceConfig[]
  /** Resolved storage paths. */
  readonly storage: SpecdStorageConfig
  /** Approval gate settings (both default to `false`). */
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  /** Per-artifact constraint strings injected after the schema instruction. */
  readonly artifactRules?: Readonly<Record<string, readonly string[]>>
  /** Freeform context entries prepended to the compiled context. */
  readonly context?: readonly SpecdContextEntry[]
  /**
   * Project-level context spec include patterns. Always applied regardless of active workspace.
   * Defaults to `['default:*']` when absent.
   */
  readonly contextIncludeSpecs?: readonly string[]
  /**
   * Project-level context spec exclude patterns. Always applied regardless of active workspace.
   */
  readonly contextExcludeSpecs?: readonly string[]
  /**
   * Controls how `CompileContext` renders specs in the compiled context.
   *
   * - `'lazy'` (default) — tier 1 specs (specIds + specDependsOn) rendered in full;
   *   tier 2 specs (include patterns + dependsOn traversal) rendered as summaries.
   * - `'full'` — all collected specs rendered with full content.
   *
   * Project-level only — not valid inside workspace entries.
   */
  readonly contextMode?: 'full' | 'lazy'
  /** When `true`, specd may invoke an LLM for enriched output (default: `false`). */
  readonly llmOptimizedContext?: boolean
  /** Schema plugin references from `specd.yaml`, in declaration order. */
  readonly schemaPlugins?: readonly string[]
  /** Inline schema override operations from `specd.yaml`. */
  readonly schemaOverrides?: SchemaOperations
}

/** Minimal shape check for {@link isSpecdConfig} — validates the structural signature. */
const specdConfigShape = z.object({
  projectRoot: z.string(),
  configPath: z.string(),
  schemaRef: z.string(),
  workspaces: z.array(z.object({ name: z.string() })),
  storage: z.object({ changesPath: z.string() }),
  approvals: z.object({ spec: z.boolean(), signoff: z.boolean() }),
})

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
  return specdConfigShape.safeParse(v).success
}

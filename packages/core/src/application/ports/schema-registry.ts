import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaYamlData } from '../../domain/services/build-schema.js'

export type { Schema }

/**
 * Intermediate result from {@link SchemaRegistry.resolveRaw}, containing the
 * parsed YAML data, loaded templates, and the resolved file path.
 *
 * Used by `ResolveSchema` to access the intermediate representation needed for
 * the merge pipeline before domain construction.
 */
export interface SchemaRawResult {
  /** The parsed and Zod-validated intermediate data (before domain construction). */
  readonly data: SchemaYamlData
  /** Loaded template content keyed by relative path. */
  readonly templates: ReadonlyMap<string, string>
  /** The absolute path of the resolved schema file (used for extends cycle detection). */
  readonly resolvedPath: string
}

/**
 * A discovered schema entry returned by {@link SchemaRegistry.list}.
 *
 * Contains enough metadata for display and selection without loading the full
 * schema. Pass `ref` directly to {@link SchemaRegistry.resolve} to get the
 * complete {@link Schema}.
 */
export interface SchemaEntry {
  /**
   * The full reference string — pass this to `resolve()` to load the schema.
   * Examples: `"@specd/schema-std"`, `"#spec-driven"`, `"#billing:my-schema"`.
   */
  readonly ref: string

  /**
   * The schema name as it appears in its directory or package, without prefix
   * or workspace qualifier. Suitable for display.
   * Examples: `"schema-std"`, `"spec-driven"`, `"my-billing-schema"`.
   */
  readonly name: string

  /** Where this schema was discovered. */
  readonly source: 'npm' | 'workspace'

  /**
   * The workspace whose `schemasPath` contains this schema.
   * Present only when `source` is `"workspace"`.
   */
  readonly workspace?: string
}

/**
 * Port for routing schema references and resolving schemas.
 *
 * Resolution is prefix-driven — no implicit multi-level fallback:
 *
 * - `@scope/name` — npm package; loaded from `node_modules/@scope/name/schema.yaml`
 * - `#workspace:name` — workspace-qualified; delegated to `SchemaRepository` for that workspace
 * - `#name` or bare name — equivalent to `#default:name`; delegated to the `default` workspace's `SchemaRepository`
 * - relative or absolute path — loaded directly from that path
 *
 * Implementations receive a `ReadonlyMap<string, SchemaRepository>` at construction
 * time, mapping workspace names to their corresponding `SchemaRepository` instances.
 */
export interface SchemaRegistry {
  /**
   * Resolves a schema reference and returns the fully-parsed {@link Schema}.
   *
   * The `ref` value is the `schema` field from `specd.yaml` verbatim.
   * Returns `null` if the resolved file does not exist; the caller is
   * responsible for converting a `null` result to `SchemaNotFoundError`.
   *
   * Workspace schema resolution is delegated to the corresponding
   * `SchemaRepository` instance.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   *   (e.g. `"@specd/schema-std"`, `"#billing:my-schema"`, `"spec-driven"`, `"./custom/schema.yaml"`)
   * @returns The resolved schema, or `null` if the file was not found
   */
  resolve(ref: string): Promise<Schema | null>

  /**
   * Resolves a schema reference and returns the intermediate representation
   * (parsed YAML data, templates, and resolved path) without building the
   * final domain `Schema`.
   *
   * Used by `ResolveSchema` for the merge pipeline where raw data is needed.
   * Workspace schema resolution is delegated to the corresponding
   * `SchemaRepository` instance.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @returns The raw resolution result, or `null` if the file was not found
   */
  resolveRaw(ref: string): Promise<SchemaRawResult | null>

  /**
   * Lists all schemas discoverable from workspace repositories and installed
   * npm packages. Does not load or validate schema file contents — use
   * `resolve()` to get a fully-parsed {@link Schema}.
   *
   * Results are grouped by source: workspace entries first (in workspace
   * declaration order), npm entries last.
   *
   * @returns All discoverable schema entries
   */
  list(): Promise<SchemaEntry[]>
}

import { type Schema } from '../../domain/value-objects/schema.js'

export type { Schema }

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
 * Port for discovering and resolving schemas.
 *
 * Resolution is prefix-driven — no implicit multi-level fallback:
 *
 * - `@scope/name` — npm package; loaded from `node_modules/@scope/name/schema.yaml`
 * - `#workspace:name` — workspace-qualified; loaded from `workspaceSchemasPaths.get(workspace)/<name>/schema.yaml`
 * - `#name` or bare name — equivalent to `#default:name`
 * - relative or absolute path — loaded directly from that path
 *
 * Unlike the repository ports, `SchemaRegistry` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface SchemaRegistry {
  /**
   * Resolves a schema reference and returns the fully-parsed {@link Schema}.
   *
   * The `ref` value is the `schema` field from `specd.yaml` verbatim.
   * `workspaceSchemasPaths` is a map of workspace name → resolved `schemasPath`
   * for that workspace, derived from config by the application layer. Returns
   * `null` if the resolved file does not exist; the caller is responsible for
   * converting a `null` result to `SchemaNotFoundError`.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   *   (e.g. `"@specd/schema-std"`, `"#billing:my-schema"`, `"spec-driven"`, `"./custom/schema.yaml"`)
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns The resolved schema, or `null` if the file was not found
   */
  resolve(ref: string, workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<Schema | null>

  /**
   * Lists all schemas discoverable from the given workspace schema paths and
   * installed npm packages. Does not load or validate schema file contents —
   * use `resolve()` to get a fully-parsed {@link Schema}.
   *
   * Results are grouped by source: workspace entries first (in workspace
   * declaration order), npm entries last.
   *
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns All discoverable schema entries
   */
  list(workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<SchemaEntry[]>
}

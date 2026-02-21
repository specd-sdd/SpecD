import { type Schema } from '../../domain/value-objects/schema.js'

export type { Schema }

/**
 * Port for resolving schemas by name.
 *
 * Implementations perform a three-level lookup in priority order:
 *
 * 1. `specd/schemas/<name>/schema.yaml` — project-local (version-controlled)
 * 2. `~/.local/share/specd/schemas/<name>/` — user-level override
 * 3. `node_modules/@specd/schema-<name>/` — npm-distributed package
 *
 * This allows teams to version-control customised schemas in the repository,
 * override them per-machine without publishing, or rely on a community
 * package. The CLI command `specd schema fork <source> <name>` copies any
 * schema to project-local for customisation.
 *
 * Unlike the repository ports, `SchemaRegistry` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface SchemaRegistry {
  /**
   * Resolves a schema by name and returns the fully-parsed {@link Schema}.
   *
   * Searches the three lookup levels in priority order and returns the first
   * match. Returns `null` if no schema with the given name is found at any
   * level.
   *
   * @param name - The schema name as declared in `specd.yaml`
   *   (e.g. `"@specd/schema-std"`, `"my-team-schema"`)
   * @returns The resolved schema, or `null` if not found
   */
  resolve(name: string): Promise<Schema | null>
}

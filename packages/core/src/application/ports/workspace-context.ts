/**
 * Shared input fields for use cases that need to resolve a schema
 * within the context of one or more workspaces.
 */
export interface WorkspaceContext {
  /** The schema reference string (e.g. `"@specd/schema-std"`). */
  readonly schemaRef: string
  /** Map of workspace name to absolute schemas directory path. */
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
}

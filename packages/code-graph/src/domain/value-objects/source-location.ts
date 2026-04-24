/**
 * Source-code location for analysis facts emitted by language adapters.
 */
export interface SourceLocation {
  /** Workspace-prefixed file path containing the source location. */
  readonly filePath: string
  /** One-based start line. */
  readonly line: number
  /** Zero-based start column. */
  readonly column: number
  /** One-based end line, when known. */
  readonly endLine: number | undefined
  /** Zero-based end column, when known. */
  readonly endColumn: number | undefined
}

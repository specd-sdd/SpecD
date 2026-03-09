/** Advisory warning emitted during context compilation. */
export interface ContextWarning {
  /** The warning category. */
  readonly type:
    | 'stale-metadata'
    | 'missing-spec'
    | 'unknown-workspace'
    | 'missing-file'
    | 'cycle'
    | 'missing-parser'
  /** The affected spec path, workspace name, or file path. */
  readonly path?: string
  /** Human-readable description of the warning. */
  readonly message: string
}

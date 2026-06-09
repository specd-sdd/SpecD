/** Advisory warning emitted while resolving spec context. */
export interface SpecContextWarningDto {
  readonly type:
    | 'stale-metadata'
    | 'missing-spec'
    | 'unknown-workspace'
    | 'missing-file'
    | 'cycle'
    | 'missing-parser'
    | 'missing-metadata'
    | 'preview'
    | 'stale-optimization'
  readonly path?: string
  readonly message: string
}

/** A single structured entry returned by `GET /v1/workspaces/{ws}/specs/{path}/context`. */
export interface SpecContextEntryDto {
  readonly spec: string
  readonly source: 'root' | 'dependency'
  readonly mode: 'list' | 'summary' | 'full'
  readonly title?: string
  readonly description?: string
  readonly rules?: readonly {
    readonly requirement: string
    readonly rules: readonly string[]
  }[]
  readonly constraints?: readonly string[]
  readonly scenarios?: readonly {
    readonly requirement: string
    readonly name: string
    readonly given?: readonly string[]
    readonly when?: readonly string[]
    readonly then?: readonly string[]
  }[]
  readonly stale: boolean
  readonly optimizedContent?: string
}

/** Structured spec context wire shape used by the Studio spec inspector. */
export interface SpecContextDto {
  readonly entries: readonly SpecContextEntryDto[]
  readonly warnings: readonly SpecContextWarningDto[]
}

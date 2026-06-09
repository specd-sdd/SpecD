/**
 * Structured warning emitted by the spec context endpoint.
 */
export interface SpecContextWarningDto {
  readonly type: string
  readonly path?: string
  readonly message: string
}

/**
 * Structured entry returned by `GET /v1/workspaces/{ws}/specs/{path}/context`.
 */
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

/**
 * Structured spec context response for the Studio spec inspector.
 */
export interface SpecContextDto {
  readonly entries: readonly SpecContextEntryDto[]
  readonly warnings: readonly SpecContextWarningDto[]
}

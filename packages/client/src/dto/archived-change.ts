/** `GET /v1/archived-changes` list item. */
export interface ArchivedChangeListItemDto {
  readonly name: string
  readonly archivedName: string
}

/** `GET /v1/archived-changes/{name}` wire shape. */
export interface ArchivedChangeDetailDto {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: string
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number | string
  readonly artifacts: readonly string[]
}

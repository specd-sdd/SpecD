/**
 *
 */
export interface WorkspaceSpecTreeDto {
  readonly workspace: string
  readonly specs: readonly {
    readonly specId: string
    readonly path: string
    readonly title?: string
  }[]
}

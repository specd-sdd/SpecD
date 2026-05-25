/**
 *
 */
export interface ProjectDto {
  readonly name: string
  readonly projectRoot: string
  readonly schemaRef: string
  readonly workspaces: readonly {
    readonly name: string
    readonly prefix?: string
    readonly ownership?: string
  }[]
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  readonly auth: { readonly type: string }
}

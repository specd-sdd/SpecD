/** `GET /v1/workspaces/{ws}/specs/{path}` wire shape. */
export interface SpecDetailDto {
  readonly specId: string
  readonly workspace: string
  readonly path: string
  readonly title?: string
  readonly description?: string
  readonly artifacts: readonly { readonly filename: string; readonly hash?: string }[]
  readonly dependsOn?: readonly string[]
  readonly linkedChanges?: readonly {
    readonly name: string
    readonly description?: string
    readonly state: string
  }[]
}

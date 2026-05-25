/** Workspace entry on {@link ProjectDto}. */
export interface WorkspaceSummaryDto {
  readonly name: string
  readonly ownership?: string
  readonly specsPath?: string
  readonly codeRoots?: readonly string[]
}

/** `GET /v1/project` wire shape. */
export interface ProjectDto {
  readonly name: string
  readonly schemaRef: string
  readonly workspaces: readonly WorkspaceSummaryDto[]
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
  readonly auth: { readonly type: string }
}

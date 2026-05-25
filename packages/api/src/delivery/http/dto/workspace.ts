/**
 *
 */
export interface WorkspaceDto {
  readonly name: string
  readonly prefix?: string
  readonly ownership?: string
  readonly specsPath: string
  readonly codeRoots: readonly string[]
}

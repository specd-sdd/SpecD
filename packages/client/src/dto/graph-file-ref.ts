/** Reusable file reference returned by graph endpoints. */
export interface GraphFileRefDto {
  readonly id: string
  readonly workspace: string
  readonly workspaceRelativePath: string
  readonly projectRelativePath: string
}

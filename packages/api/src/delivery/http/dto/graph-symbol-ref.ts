/** Reusable symbol reference returned by graph endpoints. */
export interface GraphSymbolRefDto {
  readonly id: string
  readonly workspace: string
  readonly workspaceRelativePath: string
  readonly projectRelativePath: string
  readonly filePath: string
  readonly name: string
  readonly kind: string
  readonly line: number
  readonly column: number
}

/** `POST /workspaces/{ws}/specs/validate` wire shape. */
export interface WorkspaceSpecsValidateResultDto {
  readonly passed: boolean
  readonly totalSpecs: number
  readonly passedCount: number
  readonly failedCount: number
  readonly entries: readonly {
    readonly spec: string
    readonly passed: boolean
    readonly failures: readonly {
      readonly description: string
      readonly artifactId: string
      readonly filename?: string
    }[]
    readonly warnings: readonly {
      readonly description: string
      readonly artifactId: string
      readonly filename?: string
    }[]
  }[]
}

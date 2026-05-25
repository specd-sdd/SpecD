/**
 *
 */
export interface SpecDetailDto {
  readonly specId: string
  readonly workspace: string
  readonly path: string
  readonly title?: string
  readonly description?: string
  readonly dependsOn: readonly string[]
  readonly artifacts: readonly {
    readonly filename: string
    readonly hash?: string
  }[]
  readonly linkedChanges: readonly string[]
}

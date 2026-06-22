/** `GET /changes/:name/artifacts/:artifactId/instruction` wire shape. */
export interface ArtifactInstructionDto {
  readonly artifactId: string
  readonly rulesPre: readonly string[]
  readonly instruction: string | null
  readonly template: string | null
  readonly delta: {
    readonly formatInstructions: string
    readonly domainInstructions: string | null
    readonly availableOutlines: readonly string[]
  } | null
  readonly rulesPost: readonly string[]
}

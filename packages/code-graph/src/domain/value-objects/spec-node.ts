/**
 * Represents a specification document node in the code graph.
 */
export interface SpecNode {
  readonly specId: string
  readonly path: string
  readonly title: string
  readonly contentHash: string
  readonly dependsOn: readonly string[]
}

/**
 * Creates a new SpecNode with a normalized path.
 * @param params - The spec node properties.
 * @param params.specId - The spec identifier.
 * @param params.path - The spec directory path.
 * @param params.title - The spec title.
 * @param params.contentHash - Content hash for incremental diffing.
 * @param params.dependsOn - Optional dependency spec identifiers.
 * @returns A SpecNode value object.
 */
export function createSpecNode(params: {
  specId: string
  path: string
  title: string
  contentHash: string
  dependsOn?: readonly string[]
}): SpecNode {
  return {
    specId: params.specId,
    path: params.path.replaceAll('\\', '/'),
    title: params.title,
    contentHash: params.contentHash,
    dependsOn: params.dependsOn ?? [],
  }
}

/**
 * Represents a specification document node in the code graph.
 */
export interface SpecNode {
  readonly specId: string
  readonly path: string
  readonly title: string
  readonly description: string
  readonly contentHash: string
  readonly content: string
  readonly dependsOn: readonly string[]
  readonly workspace: string
}

/**
 * Creates a new SpecNode with a normalized path.
 * @param params - The spec node properties.
 * @param params.specId - The spec identifier.
 * @param params.path - The spec directory path.
 * @param params.title - The spec title (from `SpecRepository.metadata()`).
 * @param params.description - The spec description (from `SpecRepository.metadata()`).
 * @param params.contentHash - Hash of concatenated artifacts.
 * @param params.content - Concatenated artifact text (spec.md first if present, rest alphabetical).
 * @param params.dependsOn - Optional dependency spec identifiers.
 * @param params.workspace - Workspace name this spec belongs to.
 * @returns A SpecNode value object.
 */
export function createSpecNode(params: {
  specId: string
  path: string
  title: string
  description?: string
  contentHash: string
  content?: string
  dependsOn?: readonly string[]
  workspace: string
}): SpecNode {
  return {
    specId: params.specId,
    path: params.path.replaceAll('\\', '/'),
    title: params.title,
    description: params.description ?? '',
    contentHash: params.contentHash,
    content: params.content ?? '',
    dependsOn: params.dependsOn ?? [],
    workspace: params.workspace,
  }
}

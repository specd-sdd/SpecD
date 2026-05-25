import type { SpecSummaryDto } from '@specd/client'

export type SpecPathTreeNode = {
  readonly name: string
  readonly fullPath: string
  readonly specId?: string
  readonly children: SpecPathTreeNode[]
}

/**
 * Builds a folder tree from flat spec paths (`auth/login` → auth → login).
 */
export function buildSpecPathTree(specs: readonly SpecSummaryDto[]): SpecPathTreeNode[] {
  const root: SpecPathTreeNode[] = []

  for (const spec of specs) {
    const segments = spec.path.split('/').filter(Boolean)
    let level = root
    let pathSoFar = ''

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment
      const isLeaf = i === segments.length - 1

      let index = level.findIndex((n) => n.name === segment)
      if (index === -1) {
        level.push({
          name: segment,
          fullPath: pathSoFar,
          ...(isLeaf ? { specId: spec.specId } : {}),
          children: [],
        })
        index = level.length - 1
      } else if (isLeaf) {
        const existing = level[index]!
        level[index] = { ...existing, specId: spec.specId }
      }

      level = level[index]!.children
    }
  }

  const sortNodes = (nodes: SpecPathTreeNode[]): SpecPathTreeNode[] =>
    [...nodes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({ ...n, children: sortNodes(n.children) }))

  return sortNodes(root)
}

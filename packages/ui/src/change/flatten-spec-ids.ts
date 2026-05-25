import type { SpecSummaryDto } from '@specd/client'
import { sortSpecIds } from '../lib/sort-spec-ids.js'

/** Collects all `specId` values from workspace spec trees (sorted ascending). */
export function flattenWorkspaceSpecIds(
  entries: ReadonlyArray<{ readonly specs: readonly SpecSummaryDto[] }>,
): string[] {
  const out: string[] = []
  const walk = (nodes: readonly SpecSummaryDto[]) => {
    for (const node of nodes) {
      out.push(node.specId)
      if (node.children?.length) walk(node.children)
    }
  }
  for (const entry of entries) {
    walk(entry.specs)
  }
  return sortSpecIds(out)
}

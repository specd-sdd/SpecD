import { sortSpecIds } from '../lib/sort-spec-ids.js'

/** Delta between saved and draft spec scope for `PATCH /changes/{name}`. */
export type SpecScopeDelta = {
  readonly addSpecIds: readonly string[]
  readonly removeSpecIds: readonly string[]
}

/**
 * Computes add/remove spec ID lists for a scope PATCH.
 */
export function computeSpecScopeDelta(
  saved: readonly string[],
  draft: readonly string[],
): SpecScopeDelta {
  const savedSet = new Set(saved)
  const draftSet = new Set(draft)
  return {
    addSpecIds: draft.filter((id) => !savedSet.has(id)),
    removeSpecIds: saved.filter((id) => !draftSet.has(id)),
  }
}

/**
 * Whether draft spec scope differs from persisted `specIds`.
 */
export function hasSpecScopeDelta(saved: readonly string[], draft: readonly string[]): boolean {
  const { addSpecIds, removeSpecIds } = computeSpecScopeDelta(saved, draft)
  return addSpecIds.length > 0 || removeSpecIds.length > 0
}

/**
 * Confirmation copy before a scope PATCH that may invalidate approvals.
 */
export function buildScopeChangeConfirmMessage(changeName: string, delta: SpecScopeDelta): string {
  const lines: string[] = [
    `Update spec scope for change "${changeName}"?`,
    '',
    'Changing which specs are in scope will invalidate prior approvals and may remove scaffolded artifact directories for removed specs.',
    'Artifacts will return to review states per the change workflow.',
  ]
  if (delta.addSpecIds.length > 0) {
    lines.push('', 'Add:', ...sortSpecIds(delta.addSpecIds).map((id) => `  + ${id}`))
  }
  if (delta.removeSpecIds.length > 0) {
    lines.push('', 'Remove:', ...sortSpecIds(delta.removeSpecIds).map((id) => `  − ${id}`))
  }
  lines.push('', 'Continue?')
  return lines.join('\n')
}

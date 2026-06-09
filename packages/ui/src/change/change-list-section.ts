/** Which Changes sidebar list currently contains the open change. */
export type ChangeListSection = 'active' | 'draft' | 'discarded' | 'archived'

/** Drafts and discarded are shelved read-only in Studio (distinct from archived snapshots). */
export function isShelvedReadOnlySection(
  section: ChangeListSection | null | undefined,
): section is 'draft' | 'discarded' {
  return section === 'draft' || section === 'discarded'
}

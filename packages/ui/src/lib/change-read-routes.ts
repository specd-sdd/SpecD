import type {
  ArtifactContentDto,
  ChangeArtifactListItemDto,
  ChangeDetailDto,
  ChangeStatusDto,
  GetChangeStatusOptions,
  ReadOnlyChangeOrigin,
  SpecdDataPort,
} from '@specd/client'
import type { ChangeListSection } from '../change/change-list-section.js'

export type ChangeReadSection = ChangeListSection | 'archived' | null | undefined

/** Maps shell list section to read-only storage when applicable. */
export function readOnlyOriginFromListSection(
  section: ChangeReadSection,
): ReadOnlyChangeOrigin | null {
  if (section === 'draft' || section === 'discarded' || section === 'archived') return section
  return null
}

export function loadChangeDetail(
  port: SpecdDataPort,
  name: string,
  section: ChangeReadSection,
): Promise<ChangeDetailDto> {
  if (section === 'draft') return port.getDraft(name)
  if (section === 'discarded') return port.getDiscarded(name)
  return port.getChange(name)
}

export function loadChangeStatus(
  port: SpecdDataPort,
  name: string,
  section: ChangeReadSection,
  options?: GetChangeStatusOptions,
): Promise<ChangeStatusDto> {
  if (section === 'draft') return port.getDraftStatus(name, options)
  if (section === 'discarded') return port.getDiscardedStatus(name, options)
  return port.getChangeStatus(name, options)
}

export function listChangeArtifactsForSection(
  port: SpecdDataPort,
  name: string,
  section: ChangeReadSection,
): Promise<readonly ChangeArtifactListItemDto[]> {
  if (section === 'draft') return port.listDraftArtifacts(name)
  if (section === 'discarded') return port.listDiscardedArtifacts(name)
  if (section === 'archived') {
    throw new Error('Archived artifact lists must come from archived change detail.')
  }
  return port.listChangeArtifacts(name)
}

export function loadChangeArtifactForSection(
  port: SpecdDataPort,
  name: string,
  filename: string,
  section: ChangeReadSection,
): Promise<ArtifactContentDto> {
  const readOnlyOrigin = readOnlyOriginFromListSection(section)
  if (readOnlyOrigin !== null) {
    return port.getReadOnlyChangeArtifact(name, filename, readOnlyOrigin)
  }
  return port.getChangeArtifact(name, filename)
}

export function changeReadCacheKey(section: ChangeReadSection, suffix: string): string {
  const bucket =
    section === 'draft'
      ? 'draft'
      : section === 'discarded'
        ? 'discarded'
        : section === 'archived'
          ? 'archived'
          : 'active'
  return `${bucket}:${suffix}`
}

/** Prefer artifact-specific errors over misleading active-change 404s. */
export function formatChangeArtifactError(
  error: Error,
  context: { changeName: string; filename: string },
): string {
  const msg = error.message
  if (/Change\s+['"]/.test(msg) && msg.includes('not found')) {
    return `${context.filename} is not available for this change.`
  }
  if (/artifact/i.test(msg) && msg.includes('not found')) {
    return `${context.filename} is not available for this change.`
  }
  return msg
}

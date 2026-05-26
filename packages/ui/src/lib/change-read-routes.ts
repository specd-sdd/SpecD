import type {
  ArtifactContentDto,
  ChangeArtifactListItemDto,
  ChangeDetailDto,
  ChangeStatusDto,
  GetChangeStatusOptions,
  SpecdDataPort,
} from '@specd/client'
import type { ChangeListSection } from '../change/change-list-section.js'

export type ChangeReadSection = ChangeListSection | null | undefined

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
  return port.listChangeArtifacts(name)
}

export function loadChangeArtifactForSection(
  port: SpecdDataPort,
  name: string,
  filename: string,
  section: ChangeReadSection,
): Promise<ArtifactContentDto> {
  if (section === 'draft') return port.getDraftArtifact(name, filename)
  if (section === 'discarded') return port.getDiscardedArtifact(name, filename)
  return port.getChangeArtifact(name, filename)
}

export function changeReadCacheKey(section: ChangeReadSection, suffix: string): string {
  const bucket = section === 'draft' ? 'draft' : section === 'discarded' ? 'discarded' : 'active'
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

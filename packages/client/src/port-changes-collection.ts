import type { ChangeSummaryDto } from './dto/change-summary.js'
import type { ChangeDetailDto } from './dto/change-detail.js'
import type { ChangeOverlapsDto, CreateChangeInput } from './inputs.js'

/** Change list and create operations (`api:routes-changes-collection`). */
export interface PortChangesCollection {
  listChanges(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]>
  listDrafts(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]>
  listDiscarded(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]>
  listArchived(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]>
  detectOverlaps(signal?: AbortSignal): Promise<ChangeOverlapsDto>
  createChange(input: CreateChangeInput, signal?: AbortSignal): Promise<ChangeDetailDto>
}

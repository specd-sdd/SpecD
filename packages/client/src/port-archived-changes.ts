import type { ChangeDetailDto } from './dto/change-detail.js'

/** Archived change read (`api:routes-archived-changes`). */
export interface PortArchivedChanges {
  getArchivedChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
}

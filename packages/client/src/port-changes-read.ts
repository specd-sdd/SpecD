import type { ArtifactContentDto } from './dto/artifact-content.js'
import type { ChangeDetailDto } from './dto/change-detail.js'
import type { ChangeStatusDto } from './dto/change-status.js'
import type { CompiledContextDto } from './dto/compiled-context.js'
import type { ImplementationReviewDto } from './dto/implementation-tracking.js'
import type { PreviewResultDto } from './dto/preview-result.js'
import type {
  ChangeContextQuery,
  GetChangeStatusOptions,
  OutlineChangeArtifactInput,
  PreviewChangeDraftInput,
  PreviewChangeQuery,
} from './inputs.js'

/** Change artifact row in list response. */
export interface ChangeArtifactListItemDto {
  readonly filename: string
  readonly artifactType: string
  readonly state?: string
}

/** Read-only change operations (`api:routes-changes-read`). */
export interface PortChangesRead {
  getChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  getChangeStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto>
  listChangeArtifacts(name: string, signal?: AbortSignal): Promise<readonly ChangeArtifactListItemDto[]>
  getChangeArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>
  getChangeContext(
    name: string,
    query?: ChangeContextQuery,
  ): Promise<CompiledContextDto>
  previewChange(name: string, query: PreviewChangeQuery): Promise<PreviewResultDto>
  previewChangeDraft(name: string, input: PreviewChangeDraftInput): Promise<PreviewResultDto>
  outlineChangeArtifact(
    name: string,
    filename: string,
    input?: OutlineChangeArtifactInput,
  ): Promise<readonly Record<string, unknown>[]>
  getHookInstructions(name: string, signal?: AbortSignal): Promise<CompiledContextDto>
  getArtifactInstruction(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<CompiledContextDto>
  getImplementationReview(name: string, signal?: AbortSignal): Promise<ImplementationReviewDto>
}

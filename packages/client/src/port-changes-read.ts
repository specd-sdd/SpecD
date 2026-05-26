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

/**
 * Non-active change storage for read-only Studio routes.
 * `archived` is reserved for when archived changes share the same read model.
 */
export type ReadOnlyChangeOrigin = 'draft' | 'discarded' | 'archived'

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
  listChangeArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]>
  getChangeArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>

  /** Read-only change artifact body (`/drafts`, `/discarded`, future `/archived`). */
  getReadOnlyChangeArtifact(
    name: string,
    filename: string,
    readOnlyOrigin: ReadOnlyChangeOrigin,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>

  /** Drafted change read-only operations (must NOT call active `/changes/*` routes). */
  getDraft(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  getDraftStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto>
  listDraftArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]>
  getDraftArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>

  /** Discarded change read-only operations (must NOT call active `/changes/*` routes). */
  getDiscarded(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  getDiscardedStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto>
  listDiscardedArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]>
  getDiscardedArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>
  getChangeContext(name: string, query?: ChangeContextQuery): Promise<CompiledContextDto>
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

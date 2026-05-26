import { withBearerAuth } from './adapter-bearer-auth.js'
import { withProblemJsonErrors } from './adapter-problem-json-errors.js'
import type { ArtifactContentDto } from './dto/artifact-content.js'
import type { ArchivedChangeDetailDto, ArchivedChangeListItemDto } from './dto/archived-change.js'
import type { ChangeDetailDto } from './dto/change-detail.js'
import type { ChangeGraphViewDto } from './dto/change-graph-view.js'
import type { ImplementationReviewDto } from './dto/implementation-tracking.js'
import type { ChangeStatusDto } from './dto/change-status.js'
import type { ChangeSummaryDto } from './dto/change-summary.js'
import type { CompiledContextDto } from './dto/compiled-context.js'
import type { GraphImpactDto } from './dto/graph-impact.js'
import type { GraphSearchResultDto } from './dto/graph-search.js'
import type { GraphStatusDto } from './dto/graph-status.js'
import type { PreviewResultDto } from './dto/preview-result.js'
import type { ProjectDto } from './dto/project.js'
import type { ProjectStatusDto } from './dto/project-status.js'
import type { SpecDetailDto } from './dto/spec-detail.js'
import type { ValidateBatchResultDto } from './dto/validate-batch-result.js'
import type { ValidateResultDto } from './dto/validate-result.js'
import type { WorkspaceSpecTreeDto } from './dto/workspace-spec-tree.js'
import type { WorkspaceSummaryDto } from './dto/project.js'
import type {
  ChangeContextQuery,
  OutlineChangeArtifactInput,
  OutlineSpecDraftInput,
  PreviewChangeDraftInput,
  PreviewChangeQuery,
  ChangeOverlapsDto,
  CreateChangeInput,
  GetChangeStatusOptions,
  GraphImpactInput,
  GraphSearchInput,
  PatchChangeInput,
  SaveChangeArtifactInput,
  TransitionChangeInput,
  ValidateChangeBatchInput,
  ValidateChangeInput,
} from './inputs.js'
import type { ChangeArtifactListItemDto } from './port-changes-read.js'
import type { AppendProjectLogInput, AppendStudioOutputInput } from './port-studio-panel.js'
import type { LogReadDto } from './dto/log-read.js'
import type { StudioOutputEntryDto } from './dto/studio-output.js'
import { createHttpTransport } from './port-http-transport.js'
import type { HttpTransport } from './port-http-transport.js'
import type { SpecdDataPort } from './specd-data-port.js'

export interface RemoteSpecdDataAdapterOptions {
  readonly apiBaseUrl: string
  readonly bearerToken?: string
}

function enc(segment: string): string {
  return encodeURIComponent(segment)
}

function specPathSegments(specPath: string): string {
  return specPath.split('/').map(enc).join('/')
}

function archivedDetailToChangeDetail(dto: ArchivedChangeDetailDto): ChangeDetailDto {
  return {
    name: dto.name,
    state: 'archived',
    specIds: [...dto.specIds],
    schemaName: dto.schemaName,
    schemaVersion: dto.schemaVersion,
    updatedAt: dto.archivedAt,
    description: `Archived as ${dto.archivedName}`,
    history: [{ type: 'archived', at: dto.archivedAt }],
    archivedMeta: {
      archivedName: dto.archivedName,
      archivedAt: dto.archivedAt,
      artifactTypes: [...dto.artifacts],
    },
  }
}

function buildTransport(options: RemoteSpecdDataAdapterOptions): HttpTransport {
  const base = createHttpTransport({ apiBaseUrl: options.apiBaseUrl })
  const withAuth = withBearerAuth(base, options.bearerToken)
  return withProblemJsonErrors(withAuth)
}

/**
 * HTTP implementation of {@link SpecdDataPort} for web and desktop remote profiles.
 */
export class RemoteSpecdDataAdapter implements SpecdDataPort {
  private readonly _transport: HttpTransport

  constructor(options: RemoteSpecdDataAdapterOptions) {
    this._transport = buildTransport(options)
  }

  getProject(signal?: AbortSignal): Promise<ProjectDto> {
    return this._transport.request({ method: 'GET', path: '/project', signal })
  }

  getProjectStatus(signal?: AbortSignal): Promise<ProjectStatusDto> {
    return this._transport.request({ method: 'GET', path: '/project/status', signal })
  }

  listChanges(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]> {
    return this._transport.request({ method: 'GET', path: '/changes', signal })
  }

  listDrafts(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]> {
    return this._transport.request({ method: 'GET', path: '/drafts', signal })
  }

  listDiscarded(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]> {
    return this._transport.request({ method: 'GET', path: '/discarded', signal })
  }

  async listArchived(signal?: AbortSignal): Promise<readonly ChangeSummaryDto[]> {
    const items = await this._transport.request<readonly ArchivedChangeListItemDto[]>({
      method: 'GET',
      path: '/archived-changes',
      signal,
    })
    return items.map((item) => ({
      name: item.name,
      state: 'archived',
      description: item.archivedName,
      updatedAt: undefined,
    }))
  }

  detectOverlaps(signal?: AbortSignal): Promise<ChangeOverlapsDto> {
    return this._transport.request({ method: 'GET', path: '/changes/overlaps', signal })
  }

  createChange(input: CreateChangeInput, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: '/changes',
      body: input,
      signal,
    })
  }

  getChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({ method: 'GET', path: `/changes/${enc(name)}`, signal })
  }

  getDraft(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({ method: 'GET', path: `/drafts/${enc(name)}`, signal })
  }

  getDiscarded(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({ method: 'GET', path: `/discarded/${enc(name)}`, signal })
  }

  getChangeStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/status`,
      query: {
        ifModifiedSince: options?.ifModifiedSince,
        refreshImplementation: options?.refreshImplementation,
      },
      signal: options?.signal,
    })
  }

  getDraftStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    return this._transport.request({
      method: 'GET',
      path: `/drafts/${enc(name)}/status`,
      query: { ifModifiedSince: options?.ifModifiedSince },
      signal: options?.signal,
    })
  }

  getDiscardedStatus(name: string, options?: GetChangeStatusOptions): Promise<ChangeStatusDto> {
    return this._transport.request({
      method: 'GET',
      path: `/discarded/${enc(name)}/status`,
      query: { ifModifiedSince: options?.ifModifiedSince },
      signal: options?.signal,
    })
  }

  listChangeArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/artifacts`,
      signal,
    })
  }

  listDraftArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]> {
    return this._transport.request({
      method: 'GET',
      path: `/drafts/${enc(name)}/artifacts`,
      signal,
    })
  }

  listDiscardedArtifacts(
    name: string,
    signal?: AbortSignal,
  ): Promise<readonly ChangeArtifactListItemDto[]> {
    return this._transport.request({
      method: 'GET',
      path: `/discarded/${enc(name)}/artifacts`,
      signal,
    })
  }

  getChangeArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/artifacts/${enc(filename)}`,
      signal,
    })
  }

  getDraftArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto> {
    return this._transport.request({
      method: 'GET',
      path: `/drafts/${enc(name)}/artifacts/${enc(filename)}`,
      signal,
    })
  }

  getDiscardedArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto> {
    return this._transport.request({
      method: 'GET',
      path: `/discarded/${enc(name)}/artifacts/${enc(filename)}`,
      signal,
    })
  }

  getChangeContext(name: string, query?: ChangeContextQuery): Promise<CompiledContextDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/context`,
      query: {
        step: query?.step,
        artifactType: query?.artifactType,
        ...(query?.includeChangeSpecs === false ? { includeChangeSpecs: 'false' } : {}),
        ...(query?.followDeps ? { followDeps: 'true' } : {}),
        ...(query?.depth !== undefined ? { depth: String(query.depth) } : {}),
        ...(query?.fingerprint !== undefined ? { fingerprint: query.fingerprint } : {}),
      },
      signal: query?.signal,
    })
  }

  previewChange(name: string, query: PreviewChangeQuery): Promise<PreviewResultDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/preview`,
      query: { specId: query.specId },
      signal: query.signal,
    })
  }

  previewChangeDraft(name: string, input: PreviewChangeDraftInput): Promise<PreviewResultDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/preview`,
      body: {
        specId: input.specId,
        ...(input.artifactOverrides !== undefined
          ? { artifactOverrides: input.artifactOverrides }
          : {}),
      },
      signal: input.signal,
    })
  }

  outlineChangeArtifact(
    name: string,
    filename: string,
    input: OutlineChangeArtifactInput = {},
  ): Promise<readonly Record<string, unknown>[]> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/artifacts/${enc(filename)}/outline`,
      ...(input.content !== undefined ? { body: { content: input.content } } : {}),
      signal: input.signal,
    })
  }

  getHookInstructions(name: string, signal?: AbortSignal): Promise<CompiledContextDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/hook-instructions`,
      signal,
    })
  }

  getArtifactInstruction(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<CompiledContextDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/artifacts/${enc(filename)}/instruction`,
      signal,
    })
  }

  getImplementationReview(name: string, signal?: AbortSignal): Promise<ImplementationReviewDto> {
    return this._transport.request({
      method: 'GET',
      path: `/changes/${enc(name)}/implementation-review`,
      signal,
    })
  }

  saveChangeArtifact(
    name: string,
    filename: string,
    input: SaveChangeArtifactInput,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto> {
    return this._transport.request({
      method: 'PUT',
      path: `/changes/${enc(name)}/artifacts/${enc(filename)}`,
      body: input,
      signal,
    })
  }

  validateChange(
    name: string,
    input?: ValidateChangeInput,
    signal?: AbortSignal,
  ): Promise<ValidateResultDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/validate`,
      body: input ?? {},
      signal,
    })
  }

  validateChangeAll(
    name: string,
    input?: ValidateChangeBatchInput,
    signal?: AbortSignal,
  ): Promise<ValidateBatchResultDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/validate-all`,
      body: input ?? {},
      signal,
    })
  }

  transitionChange(
    name: string,
    input: TransitionChangeInput,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/transition`,
      body: input,
      signal,
    })
  }

  patchChange(
    name: string,
    input: PatchChangeInput,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'PATCH',
      path: `/changes/${enc(name)}`,
      body: input,
      signal,
    })
  }

  draftChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/draft`,
      signal,
    })
  }

  restoreChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/restore`,
      signal,
    })
  }

  discardChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/discard`,
      signal,
    })
  }

  archiveChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/archive`,
      signal,
    })
  }

  approveSpec(name: string, specId: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/approve-spec`,
      body: { specId },
      signal,
    })
  }

  approveSignoff(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/approve-signoff`,
      signal,
    })
  }

  invalidateChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/invalidate`,
      signal,
    })
  }

  skipArtifact(name: string, filename: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'POST',
      path: `/changes/${enc(name)}/skip-artifact`,
      body: { filename },
      signal,
    })
  }

  updateSpecDependencies(
    name: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'PATCH',
      path: `/changes/${enc(name)}/spec-dependencies`,
      body,
      signal,
    })
  }

  updateImplementationTracking(
    name: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto> {
    return this._transport.request({
      method: 'PATCH',
      path: `/changes/${enc(name)}/implementation-tracking`,
      body,
      signal,
    })
  }

  async getArchivedChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto> {
    const dto = await this._transport.request<ArchivedChangeDetailDto>({
      method: 'GET',
      path: `/archived-changes/${enc(name)}`,
      signal,
    })
    return archivedDetailToChangeDetail(dto)
  }

  listWorkspaces(signal?: AbortSignal): Promise<readonly WorkspaceSummaryDto[]> {
    return this._transport.request({ method: 'GET', path: '/workspaces', signal })
  }

  listSpecs(workspace: string, signal?: AbortSignal): Promise<WorkspaceSpecTreeDto> {
    return this._transport.request({
      method: 'GET',
      path: `/workspaces/${enc(workspace)}/specs`,
      signal,
    })
  }

  getSpec(workspace: string, specPath: string, signal?: AbortSignal): Promise<SpecDetailDto> {
    return this._transport.request({
      method: 'GET',
      path: `/workspaces/${enc(workspace)}/specs/${specPathSegments(specPath)}`,
      signal,
    })
  }

  getSpecOutline(
    workspace: string,
    specPath: string,
    query: { readonly filename?: string; readonly signal?: AbortSignal } = {},
  ): Promise<readonly Record<string, unknown>[]> {
    return this._transport.request({
      method: 'GET',
      path: `/workspaces/${enc(workspace)}/specs/${specPathSegments(specPath)}/outline`,
      query: query.filename !== undefined ? { filename: query.filename } : undefined,
      signal: query.signal,
    })
  }

  outlineSpecDraft(
    workspace: string,
    specPath: string,
    input: OutlineSpecDraftInput,
  ): Promise<readonly Record<string, unknown>[]> {
    return this._transport.request({
      method: 'POST',
      path: `/workspaces/${enc(workspace)}/specs/${specPathSegments(specPath)}/outline`,
      body: { filename: input.filename, content: input.content },
      signal: input.signal,
    })
  }

  getSpecContext(
    workspace: string,
    specPath: string,
    query?: { readonly signal?: AbortSignal },
  ): Promise<CompiledContextDto> {
    return this._transport.request({
      method: 'GET',
      path: `/workspaces/${enc(workspace)}/specs/${specPathSegments(specPath)}/context`,
      signal: query?.signal,
    })
  }

  getSpecArtifact(
    workspace: string,
    specPath: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto> {
    return this._transport.request({
      method: 'GET',
      path: `/workspaces/${enc(workspace)}/specs/${specPathSegments(specPath)}/artifacts/${enc(filename)}`,
      signal,
    })
  }

  searchSpecs(query: {
    readonly q: string
    readonly workspace?: string
    readonly signal?: AbortSignal
  }): Promise<GraphSearchResultDto> {
    return this._transport.request({
      method: 'GET',
      path: '/specs/search',
      query: { q: query.q, workspace: query.workspace },
      signal: query.signal,
    })
  }

  getGraphStatus(signal?: AbortSignal): Promise<GraphStatusDto> {
    return this._transport.request({ method: 'GET', path: '/graph/status', signal })
  }

  indexGraph(signal?: AbortSignal): Promise<GraphStatusDto> {
    return this._transport.request({ method: 'POST', path: '/graph/index', signal })
  }

  searchGraph(query: GraphSearchInput): Promise<GraphSearchResultDto> {
    return this._transport.request({
      method: 'GET',
      path: '/graph/search',
      query: { q: query.q, workspace: query.workspace, kind: query.kind, limit: query.limit },
      signal: query.signal,
    })
  }

  getImpact(query: GraphImpactInput): Promise<GraphImpactDto> {
    return this._transport.request({
      method: 'GET',
      path: '/graph/impact',
      query: {
        symbol: query.symbol,
        file: query.file,
        direction: query.direction,
      },
      signal: query.signal,
    })
  }

  getHotspots(signal?: AbortSignal): Promise<readonly Record<string, unknown>[]> {
    return this._transport.request({ method: 'GET', path: '/graph/hotspots', signal })
  }

  getSpecGraphView(
    workspace: string,
    specPath: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this._transport.request({
      method: 'GET',
      path: `/graph/specs/${enc(workspace)}/${specPathSegments(specPath)}`,
      signal,
    })
  }

  getChangeGraphView(name: string, signal?: AbortSignal): Promise<ChangeGraphViewDto> {
    return this._transport.request({
      method: 'GET',
      path: `/graph/changes/${enc(name)}`,
      signal,
    })
  }

  async listStudioOutput(
    limit = 200,
    signal?: AbortSignal,
  ): Promise<readonly StudioOutputEntryDto[]> {
    const dto = await this._transport.request<{ entries: readonly StudioOutputEntryDto[] }>({
      method: 'GET',
      path: `/studio/output?limit=${limit}`,
      signal,
    })
    return dto.entries
  }

  async appendStudioOutput(
    input: AppendStudioOutputInput,
    signal?: AbortSignal,
  ): Promise<StudioOutputEntryDto> {
    return this._transport.request<StudioOutputEntryDto>({
      method: 'POST',
      path: '/studio/output',
      body: input,
      signal,
    })
  }

  async readProjectLogs(
    options?: { readonly limit?: number; readonly prettier?: boolean },
    signal?: AbortSignal,
  ): Promise<LogReadDto> {
    const params = new URLSearchParams()
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit))
    }
    if (options?.prettier) {
      params.set('prettier', 'true')
    }
    const q = params.toString()
    return this._transport.request<LogReadDto>({
      method: 'GET',
      path: q.length > 0 ? `/logs?${q}` : '/logs',
      signal,
    })
  }

  async appendProjectLog(input: AppendProjectLogInput, signal?: AbortSignal): Promise<void> {
    await this._transport.request<{ ok: true }>({
      method: 'POST',
      path: '/logs',
      body: input,
      signal,
    })
  }
}

/**
 * Factory for {@link RemoteSpecdDataAdapter}.
 *
 * @param options - Remote connection profile.
 * @returns {@link SpecdDataPort} instance.
 */
export function createRemoteSpecdDataAdapter(
  options: RemoteSpecdDataAdapterOptions,
): SpecdDataPort {
  return new RemoteSpecdDataAdapter(options)
}

/**
 * Probe `GET /v1/project` before persisting a remote connection profile.
 */
export async function testRemoteConnection(
  options: RemoteSpecdDataAdapterOptions,
): Promise<ProjectDto> {
  return createRemoteSpecdDataAdapter(options).getProject()
}

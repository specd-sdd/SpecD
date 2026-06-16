import type {
  AppendProjectLogInput,
  ArtifactContentDto,
  ChangeArtifactListItemDto,
  ChangeDetailDto,
  ChangeGraphViewDto,
  ChangeOverlapsDto,
  ChangeStatusDto,
  ChangeSummaryDto,
  CompiledContextDto,
  CreateChangeInput,
  GetChangeStatusOptions,
  GraphImpactDto,
  GraphImpactInput,
  GraphIndexInput,
  GraphIndexResultDto,
  GraphSearchInput,
  GraphSearchResultDto,
  GraphSpecCoverageDto,
  GraphStatusDto,
  ImplementationReviewDto,
  OutlineChangeArtifactInput,
  OutlineSpecDraftInput,
  PatchChangeInput,
  PreviewChangeDraftInput,
  PreviewChangeQuery,
  PreviewResultDto,
  ProjectDto,
  ProjectStatusDto,
  ReadOnlyChangeOrigin,
  SaveChangeArtifactInput,
  SpecContextDto,
  SpecDetailDto,
  SpecSummaryDto,
  SpecdDataPort,
  TransitionChangeInput,
  UpdateImplementationTrackingInput,
  UpdateImplementationTrackingResultDto,
  UpdateSpecDependenciesInput,
  UpdateSpecDependenciesResultDto,
  ValidateBatchResultDto,
  ValidateChangeBatchInput,
  ValidateChangeInput,
  ValidateResultDto,
  WorkspaceSpecTreeDto,
  WorkspaceSummaryDto,
} from '@specd/client'

type DesktopBridge = NonNullable<Window['specd']>

function withArtifactFilename(
  filename: string,
  dto: Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto,
): ArtifactContentDto {
  return {
    filename,
    content: dto.content,
    originalHash: dto.originalHash,
  }
}

/**
 * Invokes a typed IPC-backed `SpecdDataPort` method through the preload bridge.
 *
 * @param bridge - Preload bridge exposed on `window.specd`.
 * @param method - Logical port method name.
 * @param payload - Serialized method arguments.
 * @returns IPC result decoded as `TResult`.
 */
async function invokePortMethod<TResult>(
  bridge: DesktopBridge,
  method: string,
  payload?: unknown,
): Promise<TResult> {
  return bridge.invoke(method, payload) as Promise<TResult>
}

/**
 * Creates a desktop-local `SpecdDataPort` backed by the Electron preload bridge.
 *
 * @param bridge - Electron preload bridge.
 * @returns Local IPC implementation of `SpecdDataPort`.
 */
export function createDesktopLocalDataAdapter(bridge: DesktopBridge): SpecdDataPort {
  return {
    getProject: () => invokePortMethod<ProjectDto>(bridge, 'getProject'),
    getProjectStatus: () => invokePortMethod<ProjectStatusDto>(bridge, 'getProjectStatus'),
    listChanges: () => invokePortMethod<readonly ChangeSummaryDto[]>(bridge, 'listChanges'),
    listDrafts: () => invokePortMethod<readonly ChangeSummaryDto[]>(bridge, 'listDrafts'),
    listDiscarded: () => invokePortMethod<readonly ChangeSummaryDto[]>(bridge, 'listDiscarded'),
    listArchived: () => invokePortMethod<readonly ChangeSummaryDto[]>(bridge, 'listArchived'),
    detectOverlaps: () => invokePortMethod<ChangeOverlapsDto>(bridge, 'detectOverlaps'),
    createChange: (input: CreateChangeInput) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'createChange', [input]),
    getChange: (name: string) => invokePortMethod<ChangeDetailDto>(bridge, 'getChange', [name]),
    getDraft: (name: string) => invokePortMethod<ChangeDetailDto>(bridge, 'getDraft', [name]),
    getDiscarded: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'getDiscarded', [name]),
    getChangeStatus: (name: string, options?: GetChangeStatusOptions) =>
      invokePortMethod<ChangeStatusDto>(bridge, 'getChangeStatus', [name, options]),
    getDraftStatus: (name: string, options?: GetChangeStatusOptions) =>
      invokePortMethod<ChangeStatusDto>(bridge, 'getDraftStatus', [name, options]),
    getDiscardedStatus: (name: string, options?: GetChangeStatusOptions) =>
      invokePortMethod<ChangeStatusDto>(bridge, 'getDiscardedStatus', [name, options]),
    listChangeArtifacts: (name: string) =>
      invokePortMethod<readonly ChangeArtifactListItemDto[]>(bridge, 'listChangeArtifacts', [name]),
    listDraftArtifacts: (name: string) =>
      invokePortMethod<readonly ChangeArtifactListItemDto[]>(bridge, 'listDraftArtifacts', [name]),
    listDiscardedArtifacts: (name: string) =>
      invokePortMethod<readonly ChangeArtifactListItemDto[]>(bridge, 'listDiscardedArtifacts', [
        name,
      ]),
    getChangeArtifact: (name: string, filename: string) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'getChangeArtifact',
        [name, filename],
      ).then((dto) => withArtifactFilename(filename, dto)),
    getReadOnlyChangeArtifact: (
      name: string,
      filename: string,
      readOnlyOrigin: ReadOnlyChangeOrigin,
    ) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'getReadOnlyChangeArtifact',
        [name, filename, readOnlyOrigin],
      ).then((dto) => withArtifactFilename(filename, dto)),
    getDraftArtifact: (name: string, filename: string) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'getDraftArtifact',
        [name, filename],
      ).then((dto) => withArtifactFilename(filename, dto)),
    getDiscardedArtifact: (name: string, filename: string) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'getDiscardedArtifact',
        [name, filename],
      ).then((dto) => withArtifactFilename(filename, dto)),
    getChangeContext: (name: string, query?: { readonly signal?: AbortSignal }) =>
      invokePortMethod<CompiledContextDto>(bridge, 'getChangeContext', [name, query]),
    previewChange: (name: string, query: PreviewChangeQuery) =>
      invokePortMethod<PreviewResultDto>(bridge, 'previewChange', [name, query]),
    previewChangeDraft: (name: string, input: PreviewChangeDraftInput) =>
      invokePortMethod<PreviewResultDto>(bridge, 'previewChangeDraft', [name, input]),
    outlineChangeArtifact: (name: string, filename: string, input?: OutlineChangeArtifactInput) =>
      invokePortMethod<readonly Record<string, unknown>[]>(bridge, 'outlineChangeArtifact', [
        name,
        filename,
        input,
      ]),
    getHookInstructions: (name: string) =>
      invokePortMethod<CompiledContextDto>(bridge, 'getHookInstructions', [name]),
    getArtifactInstruction: (name: string, filename: string) =>
      invokePortMethod<CompiledContextDto>(bridge, 'getArtifactInstruction', [name, filename]),
    getImplementationReview: (name: string) =>
      invokePortMethod<ImplementationReviewDto>(bridge, 'getImplementationReview', [name]),
    saveChangeArtifact: (name: string, filename: string, input: SaveChangeArtifactInput) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'saveChangeArtifact',
        [name, filename, input],
      ).then((dto) => withArtifactFilename(filename, dto)),
    validateChange: (name: string, input?: ValidateChangeInput) =>
      invokePortMethod<ValidateResultDto>(bridge, 'validateChange', [name, input]),
    validateChangeAll: (name: string, input?: ValidateChangeBatchInput) =>
      invokePortMethod<ValidateBatchResultDto>(bridge, 'validateChangeAll', [name, input]),
    transitionChange: (name: string, input: TransitionChangeInput) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'transitionChange', [name, input]),
    patchChange: (name: string, input: PatchChangeInput) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'patchChange', [name, input]),
    draftChange: (name: string) => invokePortMethod<ChangeDetailDto>(bridge, 'draftChange', [name]),
    restoreChange: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'restoreChange', [name]),
    discardChange: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'discardChange', [name]),
    archiveChange: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'archiveChange', [name]),
    approveSpec: (name: string, specId: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'approveSpec', [name, specId]),
    approveSignoff: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'approveSignoff', [name]),
    invalidateChange: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'invalidateChange', [name]),
    skipArtifact: (name: string, artifactId: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'skipArtifact', [name, artifactId]),
    updateSpecDependencies: (name: string, body: UpdateSpecDependenciesInput) =>
      invokePortMethod<UpdateSpecDependenciesResultDto>(bridge, 'updateSpecDependencies', [
        name,
        body,
      ]),
    updateImplementationTracking: (name: string, body: UpdateImplementationTrackingInput) =>
      invokePortMethod<UpdateImplementationTrackingResultDto>(
        bridge,
        'updateImplementationTracking',
        [name, body],
      ),
    getArchivedChange: (name: string) =>
      invokePortMethod<ChangeDetailDto>(bridge, 'getArchivedChange', [name]),
    listWorkspaces: () =>
      invokePortMethod<readonly WorkspaceSummaryDto[]>(bridge, 'listWorkspaces'),
    listSpecs: (workspace: string) =>
      invokePortMethod<WorkspaceSpecTreeDto>(bridge, 'listSpecs', [workspace]),
    getSpec: (workspace: string, specPath: string) =>
      invokePortMethod<SpecDetailDto>(bridge, 'getSpec', [workspace, specPath]),
    getSpecOutline: (workspace: string, specPath: string, query?: { readonly filename?: string }) =>
      invokePortMethod<readonly Record<string, unknown>[]>(bridge, 'getSpecOutline', [
        workspace,
        specPath,
        query,
      ]),
    outlineSpecDraft: (workspace: string, specPath: string, input: OutlineSpecDraftInput) =>
      invokePortMethod<readonly Record<string, unknown>[]>(bridge, 'outlineSpecDraft', [
        workspace,
        specPath,
        input,
      ]),
    getSpecContext: (workspace: string, specPath: string) =>
      invokePortMethod<SpecContextDto>(bridge, 'getSpecContext', [workspace, specPath]),
    getSpecArtifact: (workspace: string, specPath: string, filename: string) =>
      invokePortMethod<Omit<ArtifactContentDto, 'filename'> | ArtifactContentDto>(
        bridge,
        'getSpecArtifact',
        [workspace, specPath, filename],
      ).then((dto) => withArtifactFilename(filename, dto)),
    searchSpecs: (query: { readonly q: string; readonly workspace?: string }) =>
      invokePortMethod<readonly SpecSummaryDto[]>(bridge, 'searchSpecs', [query]),
    getGraphStatus: () => invokePortMethod<GraphStatusDto>(bridge, 'getGraphStatus'),
    indexGraph: (input?: GraphIndexInput) =>
      invokePortMethod<GraphIndexResultDto>(bridge, 'indexGraph', [input]),
    searchGraph: (query: GraphSearchInput) =>
      invokePortMethod<GraphSearchResultDto>(bridge, 'searchGraph', [query]),
    getImpact: (query: GraphImpactInput) =>
      invokePortMethod<GraphImpactDto>(bridge, 'getImpact', [query]),
    getHotspots: () => invokePortMethod<readonly Record<string, unknown>[]>(bridge, 'getHotspots'),
    getSpecGraphView: (workspace: string, specPath: string) =>
      invokePortMethod<GraphSpecCoverageDto>(bridge, 'getSpecGraphView', [workspace, specPath]),
    getChangeGraphView: (name: string) =>
      invokePortMethod<ChangeGraphViewDto>(bridge, 'getChangeGraphView', [name]),
    readProjectLogs: (options?: { readonly limit?: number; readonly prettier?: boolean }) =>
      invokePortMethod(bridge, 'readProjectLogs', [options]),
    appendProjectLog: (input: AppendProjectLogInput) =>
      invokePortMethod<void>(bridge, 'appendProjectLog', [input]),
  }
}

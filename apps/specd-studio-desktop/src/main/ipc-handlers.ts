import path from 'node:path'
import { dialog } from 'electron'
import {
  readRecents,
  addRecentConnection,
  removeRecentConnection,
  clearRecentConnections,
  type RecentConnection,
} from './connection-store.js'
import { getSetting, setSetting, removeSetting } from './settings-store.js'

import {
  type SymbolKind,
  buildProjectGraphConfig,
  createCodeGraphProvider,
  createIndexProjectGraph,
  type IndexResult,
} from '@specd/code-graph-electron'
import {
  acquireGraphIndexLock,
  assertGraphIndexUnlocked,
  codeGraphVersion,
  createDefaultConfigLoader,
  createGetGraphHealth,
  createLogFormatter,
  createSdkContext,
  createVcsAdapter,
  createVcsActorResolver,
  Logger,
  LogRingBuffer,
  SpecPath,
  type ArchivedChange,
  type Change,
  type ChangeEvent,
  type ChangeState,
  type CompileContextResult,
  type GetArtifactInstructionResult,
  type GetChangeArtifactResult,
  type GetGraphHealthResult,
  type GetHookInstructionsResult,
  type GetImplementationReviewResult,
  type GetStatusResult,
  type Kernel,
  type ProjectWorkspace,
  type ReadOnlyChangeView,
  type SaveChangeArtifactResult,
  type SpecdConfig,
  type SpecListEntry,
  type SpecSearchEntry,
  type ValidateChangeBatchResult,
} from '@specd/sdk'
import {
  createIpcFailure,
  createIpcSuccess,
  isDraftAwareIpcMethod,
  type AppendProjectLogInput,
  type ArchivedChangeDetailDto,
  type ArtifactContentDto,
  type ArtifactInstructionDto,
  type ChangeArtifactListItemDto,
  type ChangeContextQuery,
  type ChangeDetailDto,
  type ChangeGraphViewDto,
  type ChangeHistoryEventDto,
  type ChangeStatusDto,
  type ChangeSummaryDto,
  type GraphFileRefDto,
  type GraphImpactDto,
  type GraphIndexInput,
  type GraphIndexResultDto,
  type GraphSearchResultDto,
  type GraphStatusDto,
  type GraphSymbolRefDto,
  type HookInstructionsDto,
  type ImplementationReviewDto,
  type IpcRequestEnvelope,
  type IpcResponseEnvelope,
  type PreviewChangeQuery,
  type ProjectDto,
  type ProjectStatusDto,
  type SpecDetailDto,
  type SpecSummaryDto,
  type TransitionChangeInput,
  type UpdateImplementationTrackingInput,
  type UpdateSpecDependenciesInput,
  type ValidateBatchResultDto,
  type WorkspaceSpecTreeDto,
  type WorkspaceSummaryDto,
  deriveGraphHealthWarnings,
  mapProjectStatusDto,
} from '@specd/client'
import type {
  OutlineChangeArtifactInput,
  OutlineSpecDraftInput,
  PreviewChangeDraftInput,
} from '@specd/client'

/**
 * Maps a core batch validation result to the client DTO.
 *
 * @param result - Use-case batch result.
 * @returns Batch validation DTO.
 */
function toValidateBatchResultDto(result: ValidateChangeBatchResult): ValidateBatchResultDto {
  return {
    passed: result.passed,
    total: result.total,
    results: result.results.map((step) => ({
      spec: step.spec,
      artifact: step.artifact,
      passed: step.passed,
      failures: step.failures.map((f) => ({
        message: f.description,
        artifactId: f.artifactId,
        ...(f.filename !== undefined ? { path: f.filename } : {}),
      })),
      warnings: step.warnings.map((w) => w.description),
      files: step.files.map((f) => f.filename),
    })),
  }
}

/**
 * Renders {@link CompileContextResult} as agent-facing markdown.
 */
function formatCompiledContextMarkdown(result: CompileContextResult): string {
  const parts: string[] = [`Context Fingerprint: ${result.contextFingerprint}`]

  for (const entry of result.projectContext) {
    if (entry.source === 'file' && entry.path !== undefined) {
      parts.push(`**Source: ${entry.path}**\n\n${entry.content}`)
    } else {
      parts.push(`**Source: instruction**\n\n${entry.content}`)
    }
  }

  const fullSpecs = result.specs.filter((s) => s.mode === 'full')
  if (fullSpecs.length > 0) {
    const specParts = fullSpecs.map(
      (s) => `### Spec: ${s.specId}\nMode: full\n\n${s.content ?? ''}`,
    )
    parts.push(`## Spec content\n\n${specParts.join('\n\n---\n\n')}`)
  }

  const nonFullSpecs = result.specs.filter((s) => s.mode !== 'full')
  if (nonFullSpecs.length > 0) {
    const includePatternSpecs = nonFullSpecs.filter((s) => s.source !== 'dependsOnTraversal')
    const depTraversalSpecs = nonFullSpecs.filter((s) => s.source === 'dependsOnTraversal')

    const catalogueParts: string[] = [
      'Use `specd changes spec-preview <change-name> <specId>` to load the merged full content of any change spec you need.',
      '',
    ]

    if (includePatternSpecs.length > 0) {
      catalogueParts.push('| Spec ID | Mode | Source | Title | Description |')
      catalogueParts.push('|---------|------|--------|-------|-------------|')
      for (const s of includePatternSpecs) {
        catalogueParts.push(
          `| ${s.specId} | ${s.mode} | ${s.source} | ${s.title ?? '—'} | ${s.description ?? '—'} |`,
        )
      }
    }

    if (depTraversalSpecs.length > 0) {
      catalogueParts.push('', '### Via dependencies', '')
      catalogueParts.push('| Spec ID | Mode | Source | Title | Description |')
      catalogueParts.push('|---------|------|--------|-------|-------------|')
      for (const s of depTraversalSpecs) {
        catalogueParts.push(
          `| ${s.specId} | ${s.mode} | ${s.source} | ${s.title ?? '—'} | ${s.description ?? '—'} |`,
        )
      }
    }
    parts.push(`## Available context specs\n\n${catalogueParts.join('\n')}`)
  }

  if (result.availableSteps.length > 0) {
    const stepLines = result.availableSteps.map((s) =>
      s.available
        ? `- ${s.step}: available`
        : `- ${s.step}: unavailable — requires: [${s.blockingArtifacts.join(', ')}]`,
    )
    parts.push(`## Available steps\n\n${stepLines.join('\n')}`)
  }

  return parts.join('\n\n---\n\n')
}

type TaskSummaryByType = ReadonlyMap<
  string,
  { readonly totalTasks: number; readonly completedTasks: number }
>

export class SessionSupersededError extends Error {
  constructor() {
    super('Desktop session superseded')
    this.name = 'SessionSupersededError'
  }
}

let sessionGeneration = 0
let hostPromiseGeneration = 0
let hostPromise: Promise<DesktopHostContext> | undefined
let logRing: LogRingBuffer | undefined
const openGraphProviders = new Set<ReturnType<typeof createCodeGraphProvider>>()

interface DesktopHostContext {
  readonly kernel: Kernel
  readonly config: SpecdConfig
  readonly createGraphProvider: () => ReturnType<typeof createCodeGraphProvider>
}

/**
 * Formats a date as an ISO string.
 *
 * @param value - Date to serialize.
 * @returns ISO timestamp string.
 */
function iso(value: Date): string {
  return value.toISOString()
}

/**
 * Returns the change revision timestamp used by Studio DTOs.
 *
 * @param input - Change-like object with revision information.
 * @returns Revision date.
 */
function resolveUpdatedAt(input: {
  readonly updatedAt?: Date
  readonly createdAt: Date
  readonly history: readonly ChangeEvent[]
}): Date {
  if (input.updatedAt instanceof Date) {
    return input.updatedAt
  }
  const last = input.history[input.history.length - 1]
  return last?.at ?? input.createdAt
}

/**
 * Resolves the loaded project config, booting the kernel on demand.
 *
 * @returns Loaded config.
 */
async function getConfig(): Promise<SpecdConfig> {
  return (await getHost()).config
}

export let activeProjectRoot: string | undefined = undefined

/**
 * Lazily boots the project SDK host for local IPC.
 *
 * @returns Active desktop host context.
 */
async function getHost(): Promise<DesktopHostContext> {
  const gen = sessionGeneration
  if (hostPromise === undefined || hostPromiseGeneration !== gen) {
    hostPromiseGeneration = gen
    hostPromise = (async () => {
      const loader = await createDefaultConfigLoader({
        startDir: activeProjectRoot ?? process.cwd(),
      })
      const config = await loader.load()
      logRing = new LogRingBuffer(1000)
      const { kernel } = await createSdkContext(config, {
        logRing,
        logFormatter: createLogFormatter({ colorize: false }),
      })
      Logger.info('Desktop kernel booted', { projectRoot: config.projectRoot })
      return {
        kernel,
        config,
        createGraphProvider: () => createCodeGraphProvider(config),
      }
    })()
  }
  const host = await hostPromise
  if (gen !== sessionGeneration) {
    throw new SessionSupersededError()
  }
  return host
}

/**
 * Lazily boots the project kernel for local IPC.
 *
 * @returns Active project kernel.
 */
async function getKernel(): Promise<Kernel> {
  return (await getHost()).kernel
}

/**
 * Opens a graph provider for one operation and closes it afterwards.
 *
 * @param run - Callback to execute with the open provider.
 * @returns Callback result.
 */
async function withGraphProvider<TResult>(
  run: (provider: ReturnType<typeof createCodeGraphProvider>) => Promise<TResult>,
): Promise<TResult> {
  const config = await getConfig()
  Logger.info('Opening graph provider', { projectRoot: config.projectRoot })
  const provider = createCodeGraphProvider(config)
  openGraphProviders.add(provider)
  await provider.open()
  try {
    return await run(provider)
  } finally {
    openGraphProviders.delete(provider)
    await provider.close().catch(() => undefined)
  }
}

/**
 * Maps a change history event to the UI DTO shape.
 *
 * @param event - Domain history event.
 * @returns Serialized event.
 */
function historyEventDto(event: ChangeEvent): ChangeHistoryEventDto {
  const base = {
    at: iso(event.at),
    by: { name: event.by.name, email: event.by.email },
  }
  if (event.type === 'created') {
    return {
      ...base,
      type: 'created' as const,
      specIds: [...event.specIds],
      schemaName: event.schemaName,
      schemaVersion: event.schemaVersion,
    }
  }
  if (event.type === 'transitioned') {
    return {
      ...base,
      type: 'transitioned' as const,
      from: event.from,
      to: event.to,
    }
  }
  if (event.type === 'invalidated') {
    return {
      ...base,
      type: 'invalidated' as const,
      cause: event.cause,
    }
  }
  return { ...base, type: event.type as 'spec-approved' | 'signed-off' }
}

/**
 * Maps a change-like entity to the summary DTO consumed by the UI.
 *
 * @param change - Change or read-only view.
 * @param blockerCount - Blocker count.
 * @returns Summary DTO.
 */
function toChangeSummaryDto(
  change: Change | ReadOnlyChangeView,
  blockerCount = 0,
): ChangeSummaryDto {
  return {
    name: change.name,
    ...(change.description !== undefined ? { description: change.description } : {}),
    state: change.state,
    specIds: [...change.specIds],
    updatedAt: iso(resolveUpdatedAt(change)),
    blockerCount,
  }
}

/**
 * Maps a change-like entity to detail DTO form.
 *
 * @param change - Change or read-only view.
 * @returns Detail DTO.
 */
function toChangeDetailDto(change: Change | ReadOnlyChangeView): ChangeDetailDto {
  const specApproved = change.history.some((event) => event.type === 'spec-approved')
  const signoffApproved = change.history.some((event) => event.type === 'signed-off')
  return {
    name: change.name,
    state: change.state,
    specIds: [...change.specIds],
    specDependsOn:
      'specDependsOn' in change
        ? Object.fromEntries(
            [...change.specDependsOn.entries()].map(([key, deps]) => [key, [...deps]]),
          )
        : {},
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    ...('invalidationPolicy' in change && change.invalidationPolicy !== undefined
      ? { invalidationPolicy: change.invalidationPolicy }
      : {}),
    ...(change.description !== undefined ? { description: change.description } : {}),
    updatedAt: iso(resolveUpdatedAt(change)),
    history: change.history.map(historyEventDto),
    approvals: { specApproved, signoffApproved },
  }
}

/**
 * Maps a `GetStatus` result to the shared status DTO shape.
 *
 * @param result - Core status result.
 * @returns Status DTO.
 */
function toChangeStatusDto(result: GetStatusResult): ChangeStatusDto {
  const base = result.change ?? result.draftView
  if (base === undefined) {
    throw new Error('GetStatusResult missing change payload')
  }
  const updatedAt = iso(resolveUpdatedAt(base))
  if (result.unchanged === true) {
    return {
      name: base.name,
      state: base.state,
      updatedAt,
      unchanged: true,
    }
  }

  const taskArtifacts = result.artifactStatuses.filter((artifact) => artifact.hasTasks)
  const totalTasks = taskArtifacts.reduce(
    (sum, artifact) => sum + (artifact.taskCompletion?.total ?? 0),
    0,
  )
  const completedTasks = taskArtifacts.reduce(
    (sum, artifact) => sum + (artifact.taskCompletion?.complete ?? 0),
    0,
  )

  return {
    name: base.name,
    state: base.state,
    updatedAt,
    specIds: [...base.specIds],
    blockers: result.blockers.map((blocker) => ({
      code: blocker.code,
      message: blocker.message,
    })),
    nextAction: {
      targetStep: result.nextAction.targetStep,
      actionType: result.nextAction.actionType,
      reason: result.nextAction.reason,
      command: result.nextAction.command,
    },
    ...(taskArtifacts.length > 0 ? { totalTasks, completedTasks } : {}),
    artifacts: result.artifactStatuses.map((artifact) => ({
      type: artifact.type,
      hasTasks: artifact.hasTasks,
      ...(artifact.taskCompletion !== undefined
        ? {
            totalTasks: artifact.taskCompletion.total,
            completedTasks: artifact.taskCompletion.complete,
          }
        : {}),
      state: artifact.state,
      effectiveStatus: artifact.effectiveStatus,
      displayStatus: artifact.displayStatus,
      files: artifact.files.map((file) => ({
        key: file.key,
        filename: file.filename,
        state: file.state,
        hasDrift: file.hasDrift,
        displayStatus: file.displayStatus,
      })),
    })),
    review: {
      required: result.review.required,
      route: result.review.route,
      reason: result.review.reason,
    },
    lifecycle: {
      validTransitions: [...result.lifecycle.validTransitions],
      availableTransitions: [...result.lifecycle.availableTransitions],
      changePath: result.lifecycle.changePath,
    },
  }
}

/**
 * Maps a core artifact result to the client DTO shape.
 *
 * @param filename - Target filename.
 * @param result - Core artifact read result.
 * @returns Artifact content DTO.
 */
function toArtifactContentDto(
  filename: string,
  result: GetChangeArtifactResult,
): ArtifactContentDto {
  return {
    filename,
    content: result.content,
    originalHash: result.originalHash ?? '',
  }
}

/**
 * Maps a save-artifact result to the client DTO shape.
 *
 * @param filename - Target filename.
 * @param content - Saved content.
 * @param result - Core save result.
 * @returns Artifact content DTO.
 */
function toSaveArtifactContentDto(
  filename: string,
  content: string,
  result: SaveChangeArtifactResult,
): ArtifactContentDto {
  return {
    filename,
    content,
    originalHash: result.contentHash,
  }
}

/**
 * Maps artifact metadata rows to the UI list DTO.
 *
 * @param view - Read-only change-like view.
 * @param options - Task metadata keyed by artifact type.
 * @returns Artifact list rows.
 */
function toArtifactListDtoFromView(
  view: ReadOnlyChangeView,
  options: {
    hasTasksByType?: ReadonlyMap<string, boolean>
    taskSummaryByType?: TaskSummaryByType
  } = {},
): ChangeArtifactListItemDto[] {
  const entries: ChangeArtifactListItemDto[] = []
  for (const artifact of view.artifacts.values()) {
    for (const file of artifact.files.values()) {
      entries.push({
        filename: file.filename,
        artifactType: artifact.type,
        hasTasks: options.hasTasksByType?.get(artifact.type) ?? false,
        ...(options.taskSummaryByType?.get(artifact.type) ?? {}),
        state: file.status,
      })
    }
  }
  return entries
}

/**
 * Maps config to the project DTO shape used by the client.
 *
 * @param config - Loaded project config.
 * @returns Project DTO.
 */
function toProjectDto(config: SpecdConfig): ProjectDto {
  return {
    name: config.projectRoot.split('/').pop() ?? config.projectRoot,
    schemaRef: config.schemaRef,
    workspaces: config.workspaces.map((workspace) => ({
      name: workspace.name,
      ...(workspace.ownership !== undefined ? { ownership: workspace.ownership } : {}),
    })),
    approvals: config.approvals,
    auth: { type: config.api?.auth.type ?? 'disabled' },
  }
}

/**
 * Maps indexing result to the shared DTO shape.
 *
 * @param result - Core indexing result.
 * @returns Graph index DTO.
 */
function toGraphIndexResultDto(result: IndexResult): GraphIndexResultDto {
  return {
    filesDiscovered: result.filesDiscovered,
    filesIndexed: result.filesIndexed,
    documentsIndexed: result.documentsIndexed,
    filesRemoved: result.filesRemoved,
    filesSkipped: result.filesSkipped,
    specsDiscovered: result.specsDiscovered,
    specsIndexed: result.specsIndexed,
    errors: result.errors.map((e) => ({
      filePath: e.filePath,
      message: e.message,
    })),
    duration: result.duration,
    workspaces: result.workspaces.map((ws) => ({
      name: ws.name,
      filesDiscovered: ws.filesDiscovered,
      filesIndexed: ws.filesIndexed,
      filesSkipped: ws.filesSkipped,
      filesRemoved: ws.filesRemoved,
      specsDiscovered: ws.specsDiscovered,
      specsIndexed: ws.specsIndexed,
    })),
    vcsRef: result.vcsRef,
    graphFingerprint: result.graphFingerprint,
    fullRebuildReason: result.fullRebuildReason,
  }
}

/**
 * Maps hook instructions to the shared DTO shape.
 *
 * @param result - Core hook instructions result.
 * @returns Hook instructions DTO.
 */
function toHookInstructionsDto(result: GetHookInstructionsResult): HookInstructionsDto {
  return {
    phase: result.phase,
    instructions: result.instructions.map((i) => ({
      id: i.id,
      text: i.text,
    })),
  }
}

/**
 * Maps artifact instruction to the shared DTO shape.
 *
 * @param result - Core artifact instruction result.
 * @returns Artifact instruction DTO.
 */
function toArtifactInstructionDto(result: GetArtifactInstructionResult): ArtifactInstructionDto {
  return {
    artifactId: result.artifactId,
    rulesPre: [...result.rulesPre],
    instruction: result.instruction,
    template: result.template,
    delta: result.delta
      ? {
          formatInstructions: result.delta.formatInstructions,
          domainInstructions: result.delta.domainInstructions,
          availableOutlines: [...result.delta.availableOutlines],
        }
      : null,
    rulesPost: [...result.rulesPost],
  }
}

/**
 * Maps project workspaces to the shared workspace-summary DTO shape.
 *
 * @param config - Loaded project config.
 * @param workspaces - Kernel workspace descriptors.
 * @returns Workspace DTO rows.
 */
function toWorkspaceSummaryDtos(
  config: SpecdConfig,
  workspaces: readonly ProjectWorkspace[],
): WorkspaceSummaryDto[] {
  const descriptors = new Map(config.workspaces.map((workspace) => [workspace.name, workspace]))
  return workspaces.map((workspace) => {
    const descriptor = descriptors.get(workspace.name)
    return {
      name: workspace.name,
      ...(workspace.ownership !== undefined ? { ownership: workspace.ownership } : {}),
      ...(descriptor?.specsPath !== undefined ? { specsPath: descriptor.specsPath } : {}),
      codeRoots: [workspace.codeRoot],
    }
  })
}

function toProjectStatusDtoFromSnapshot(
  snapshot: Awaited<ReturnType<typeof buildDesktopProjectStatusSnapshot>>,
  config: SpecdConfig,
): ProjectStatusDto {
  return mapProjectStatusDto({
    activeChanges: snapshot.summary.activeCount,
    drafts: snapshot.summary.draftCount,
    discarded: snapshot.summary.discardedCount,
    archived: snapshot.summary.archivedCount,
    specsByWorkspace: snapshot.summary.specsByWorkspace,
    graph:
      snapshot.graphHealth === null
        ? null
        : {
            lastIndexedAt: snapshot.graphHealth.lastIndexedAt ?? null,
            lastIndexedRef: snapshot.graphHealth.lastIndexedRef ?? null,
            stale: snapshot.graphHealth.stale,
            currentRef: snapshot.graphHealth.currentRef,
            fingerprintMismatch: snapshot.graphHealth.fingerprintMismatch,
            fileCount: snapshot.graphHealth.fileCount,
            documentCount: snapshot.graphHealth.documentCount,
            symbolCount: snapshot.graphHealth.symbolCount,
            specCount: snapshot.graphHealth.specCount,
          },
    approvals: snapshot.approvals,
    authType: config.api?.auth.type ?? 'disabled',
  })
}

/**
 * Builds the desktop-owned project status snapshot using the Electron graph runtime.
 *
 * @param host - Active desktop host context
 * @returns Structured project and optional graph status snapshot
 */
async function buildDesktopProjectStatusSnapshot(host: DesktopHostContext): Promise<{
  readonly summary: Awaited<ReturnType<Kernel['project']['getProjectSummary']['execute']>>
  readonly graphHealth: GetGraphHealthResult | null
  readonly approvals: { readonly specEnabled: boolean; readonly signoffEnabled: boolean }
}> {
  const summary = await host.kernel.project.getProjectSummary.execute()
  const config = host.kernel.project.getConfig.execute()
  const approvals = {
    specEnabled: config.approvals?.spec ?? false,
    signoffEnabled: config.approvals?.signoff ?? false,
  }

  let graphHealth: GetGraphHealthResult | null = null
  try {
    graphHealth = await withGraphProvider(async (provider) => {
      const workspaces = await host.kernel.project.listWorkspaces.execute()
      const getGraphHealth = createGetGraphHealth()
      return getGraphHealth.execute({
        config,
        provider,
        codeGraphVersion,
        workspaces: [...workspaces],
        assertUnlocked: false,
      })
    })
  } catch {
    graphHealth = null
  }

  return {
    summary,
    graphHealth,
    approvals,
  }
}

/**
 * Maps graph health to the graph status DTO.
 *
 * @param health - Enriched graph health.
 * @returns Graph status DTO.
 */
function toGraphStatusDto(health: GetGraphHealthResult): GraphStatusDto {
  const warnings = deriveGraphHealthWarnings({
    stale: health.stale,
    fingerprintMismatch: health.fingerprintMismatch,
    lastIndexedRef: health.lastIndexedRef,
    currentRef: health.currentRef,
  })
  return {
    lastIndexedAt: health.lastIndexedAt ?? null,
    lastIndexedRef: health.lastIndexedRef ?? null,
    fileCount: health.fileCount,
    documentCount: health.documentCount,
    symbolCount: health.symbolCount,
    specCount: health.specCount,
    graphFingerprint: health.graphFingerprint ?? null,
    stale: health.stale,
    currentRef: health.currentRef,
    fingerprintMismatch: health.fingerprintMismatch,
    warnings,
  }
}

/**
 * Returns the workspace prefix from a graph path.
 *
 * @param graphPath - `workspace:path` graph id.
 * @returns Workspace name.
 */
function getWorkspaceFromGraphPath(graphPath: string): string {
  return graphPath.split(':', 1)[0] ?? ''
}

/**
 * Returns the workspace-relative file path from a graph path.
 *
 * @param graphPath - `workspace:path` graph id.
 * @returns Workspace-relative path.
 */
function getRelativePathFromGraphPath(graphPath: string): string {
  const separator = graphPath.indexOf(':')
  return separator >= 0 ? graphPath.slice(separator + 1) : graphPath
}

/**
 * Converts a workspace-relative path to a project-relative path.
 *
 * @param config - Project config.
 * @param workspace - Workspace name.
 * @param workspaceRelativePath - Path under the workspace.
 * @returns Project-relative path.
 */
function toProjectRelativePath(
  config: SpecdConfig,
  workspace: string,
  workspaceRelativePath: string,
): string {
  const ws = config.workspaces.find((entry) => entry.name === workspace)
  if (ws === undefined) {
    return workspaceRelativePath
  }
  return path
    .relative(config.projectRoot, path.join(ws.codeRoot, workspaceRelativePath))
    .replaceAll('\\', '/')
}

/**
 * Parses fallback kind/column information from a graph symbol id.
 *
 * @param symbolId - Serialized graph symbol identifier.
 * @returns Parsed fallback fields.
 */
function parseGraphSymbolId(symbolId: string): { kind: string; column: number } {
  const parts = symbolId.split(':')
  if (parts.length < 3) {
    return { kind: 'symbol', column: 0 }
  }
  const maybeColumn = Number(parts.at(-1) ?? '0')
  return {
    kind: parts.at(-3) ?? 'symbol',
    column: Number.isFinite(maybeColumn) ? maybeColumn : 0,
  }
}

/**
 * Maps one graph file identifier to the shared DTO shape.
 *
 * @param config - Loaded project config.
 * @param graphFileId - `workspace:path` file id.
 * @returns Graph file DTO.
 */
function toGraphFileRefDto(config: SpecdConfig, graphFileId: string): GraphFileRefDto {
  const workspace = getWorkspaceFromGraphPath(graphFileId)
  const workspaceRelativePath = getRelativePathFromGraphPath(graphFileId)
  return {
    id: graphFileId,
    workspace,
    workspaceRelativePath,
    projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
  }
}

/**
 * Maps one graph symbol node/reference to the shared DTO shape.
 *
 * @param config - Loaded project config.
 * @param symbol - Graph symbol fields.
 * @returns Graph symbol DTO.
 */
function toGraphSymbolRefDto(
  config: SpecdConfig,
  symbol: {
    id: string
    name: string
    filePath: string
    line: number
    kind?: string
    column?: number
  },
): GraphSymbolRefDto {
  const workspace = getWorkspaceFromGraphPath(symbol.filePath)
  const workspaceRelativePath = getRelativePathFromGraphPath(symbol.filePath)
  const parsed = parseGraphSymbolId(symbol.id)
  return {
    id: symbol.id,
    workspace,
    workspaceRelativePath,
    projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
    filePath: symbol.filePath,
    name: symbol.name,
    kind: symbol.kind ?? parsed.kind,
    line: symbol.line,
    column: symbol.column ?? parsed.column,
  }
}

/**
 * Maps graph search hits to the DTO shape consumed by the command palette.
 *
 * @param config - Project config.
 * @param symbols - Symbol hits.
 * @param specs - Spec hits.
 * @param documents - Document hits.
 * @returns Search DTO.
 */
function toGraphSearchResultDto(
  config: SpecdConfig,
  symbols: Array<{
    symbol: {
      id: string
      name: string
      filePath: string
      line: number
      kind?: string
      column?: number
    }
    score: number
    snippet: string
    startLine: number
    endLine: number
  }>,
  specs: Array<{
    spec: SpecSearchEntry | SpecListEntry
    score: number
    snippet: string
    startLine: number
    endLine: number
  }>,
  documents: Array<{
    document: { workspace?: string; path: string }
    score: number
    snippet: string
    startLine: number
    endLine: number
  }>,
): GraphSearchResultDto {
  return {
    symbols: symbols.map(({ symbol, score, snippet, startLine, endLine }) => {
      const workspace = getWorkspaceFromGraphPath(symbol.filePath)
      return {
        workspace,
        symbol: toGraphSymbolRefDto(config, symbol),
        score,
        snippet,
        startLine,
        endLine,
      }
    }),
    specs: specs.map(({ spec, score, snippet, startLine, endLine }) => ({
      workspace: spec.workspace,
      specId: 'specId' in spec ? (spec.specId as string) : `${spec.workspace}:${spec.path}`,
      path: spec.path.toString(),
      title: spec.title,
      description: 'summary' in spec ? (spec.summary ?? '') : '',
      score,
      snippet,
      startLine,
      endLine,
    })),
    documents: documents.map(({ document, score, snippet, startLine, endLine }) => {
      const workspace = document.workspace ?? getWorkspaceFromGraphPath(document.path)
      const workspaceRelativePath = getRelativePathFromGraphPath(document.path)
      return {
        workspace,
        path: workspaceRelativePath,
        projectRelativePath: toProjectRelativePath(config, workspace, workspaceRelativePath),
        score,
        snippet,
        startLine,
        endLine,
      }
    }),
  }
}

/**
 * Maps implementation-review output to the client DTO shape.
 *
 * @param result - Core implementation-review result.
 * @returns Implementation-review DTO.
 */
function toImplementationReviewDto(result: GetImplementationReviewResult): ImplementationReviewDto {
  return {
    specIds: [...result.specIds],
    implementationTracking: {
      links: result.implementationTracking.links.map((link) => ({
        specId: link.specId,
        file: link.file,
        fileLinkExplicit: link.fileLinkExplicit,
        ...(link.symbols !== undefined ? { symbols: [...link.symbols] } : {}),
      })),
      trackedFiles: result.implementationTracking.trackedFiles.map((file) => ({
        file: file.file,
        state: file.state,
      })),
    },
  }
}

/**
 * Maps graph impact analysis to the client DTO shape.
 *
 * @param config - Loaded project config.
 * @param target - Input target identifier.
 * @param direction - Requested direction.
 * @param impact - Provider impact result.
 * @param symbols - Affected symbols with depth/risk information.
 * @param specs - Affected spec ids.
 * @returns Graph impact DTO.
 */
function toGraphImpactDto(
  config: SpecdConfig,
  target: string,
  direction: string,
  impact: {
    riskLevel: string
    directDependents: number
    indirectDependents: number
    transitiveDependents: number
    affectedFiles: readonly string[]
    affectedProcesses: readonly string[]
  },
  symbols: Array<{
    id: string
    name: string
    filePath: string
    line: number
    depth: number
    risk?: string
  }>,
  specs: readonly string[] = [],
): GraphImpactDto {
  return {
    target,
    direction,
    riskLevel: impact.riskLevel,
    directDepsCount: impact.directDependents,
    indirectDepsCount: impact.indirectDependents,
    transitiveDepsCount: impact.transitiveDependents,
    affectedFilesCount: impact.affectedFiles.length,
    affectedProcesses: [...impact.affectedProcesses],
    specs: [...specs],
    symbols: symbols.map((symbol) => ({
      ...toGraphSymbolRefDto(config, symbol),
      depth: symbol.depth,
      ...(symbol.risk !== undefined ? { risk: symbol.risk } : {}),
    })),
    files: impact.affectedFiles.map((file) => toGraphFileRefDto(config, file)),
  }
}

/**
 * Maps a change-scoped graph view to the shared DTO shape.
 *
 * @param changeName - Change name.
 * @param specIds - Covered spec ids.
 * @param specs - Per-spec coverage rows.
 * @returns Change graph DTO.
 */
function toChangeGraphViewDto(
  changeName: string,
  specIds: readonly string[],
  specs: ChangeGraphViewDto['specs'],
): ChangeGraphViewDto {
  return { changeName, specIds: [...specIds], specs }
}

/**
 * Groups spec list entries into the workspace tree DTO used by the inspector.
 *
 * @param workspace - Workspace name.
 * @param specs - Filtered spec rows.
 * @returns Tree DTO.
 */
function toWorkspaceSpecTreeDto(
  workspace: string,
  specs: readonly SpecListEntry[],
): WorkspaceSpecTreeDto {
  return {
    workspace,
    specs: specs.map((spec) => ({
      specId: `${spec.workspace}:${spec.path}`,
      path: spec.path.toString(),
      title: spec.title,
    })),
  }
}

/**
 * Maps a spec detail plus linked active changes to the client DTO shape.
 *
 * @param input - Detail payload pieces.
 * @returns Spec detail DTO.
 */
function toSpecDetailDto(input: {
  specId: string
  workspace: string
  path: string
  title?: string
  description?: string
  dependsOn: readonly string[]
  artifacts: readonly { filename: string; hash?: string }[]
  linkedChanges: readonly { name: string; description?: string; state: string }[]
}): SpecDetailDto {
  return {
    specId: input.specId,
    workspace: input.workspace,
    path: input.path,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    dependsOn: [...input.dependsOn],
    artifacts: input.artifacts.map((artifact) => ({
      filename: artifact.filename,
      ...(artifact.hash !== undefined ? { hash: artifact.hash } : {}),
    })),
    linkedChanges: input.linkedChanges.map((change) => ({
      name: change.name,
      ...(change.description !== undefined ? { description: change.description } : {}),
      state: change.state,
    })),
  }
}

/**
 * Maps spec search rows to the shared summary DTO shape.
 *
 * @param results - Search results.
 * @returns Summary DTOs.
 */
function toSpecSummaryDtos(
  results: Awaited<ReturnType<Kernel['specs']['search']['execute']>>,
): SpecSummaryDto[] {
  return results.map((result) => ({
    specId: `${result.workspace}:${result.path}`,
    workspace: result.workspace,
    path: result.path,
    title: result.title,
    ...(result.summary !== undefined ? { description: result.summary } : {}),
  }))
}

function artifactTaskMapsFromStatus(status: GetStatusResult): {
  hasTasksByType: Map<string, boolean>
  taskSummaryByType: Map<string, { totalTasks: number; completedTasks: number }>
} {
  const hasTasksByType = new Map<string, boolean>()
  const taskSummaryByType = new Map<string, { totalTasks: number; completedTasks: number }>()
  for (const artifact of status.artifactStatuses) {
    hasTasksByType.set(artifact.type, artifact.hasTasks)
    if (artifact.hasTasks && artifact.taskCompletion !== undefined) {
      taskSummaryByType.set(artifact.type, {
        totalTasks: artifact.taskCompletion.total,
        completedTasks: artifact.taskCompletion.complete,
      })
    }
  }
  return { hasTasksByType, taskSummaryByType }
}

async function artifactTaskMapsForChange(kernel: Kernel, name: string) {
  const status = await kernel.changes.status.execute({ name })
  return artifactTaskMapsFromStatus(status)
}

/**
 * Maps an archived change to the detail DTO expected by the UI.
 *
 * @param change - Archived change snapshot.
 * @returns Archived detail DTO.
 */
function toArchivedChangeDetail(change: ArchivedChange): ArchivedChangeDetailDto {
  const detail = toChangeDetailDto(change)
  const artifacts = [...change.artifacts.values()].flatMap((artifact) =>
    [...artifact.files.values()].map((file) => ({
      filename: file.filename,
      type: artifact.type,
      hasTasks: false,
      state: file.status === 'missing' ? 'complete' : file.status,
      displayStatus: file.displayStatus(),
    })),
  )
  return {
    ...detail,
    state: 'archived',
    archivedName: change.archivedName,
    archivedAt: iso(change.archivedAt),
    ...(change.archivedBy !== undefined ? { archivedBy: change.archivedBy } : {}),
    workspaces: [...change.workspaces],
    artifacts,
    archivedMeta: {
      archivedName: change.archivedName,
      archivedAt: iso(change.archivedAt),
      artifactTypes: [...new Set(artifacts.map((artifact) => artifact.type))],
    },
  }
}

/**
 * Handles draft-aware port methods via kernel use cases.
 *
 * @param envelope - IPC request envelope from preload.
 * @returns Success or failure envelope.
 */
async function handleDraftAwarePort(envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> {
  if (!isDraftAwareIpcMethod(envelope.method)) {
    return createIpcFailure(envelope.id, {
      message: `Not a draft-aware method: ${envelope.method}`,
    })
  }

  try {
    const kernel = await getKernel()
    const params = envelope.payload

    switch (envelope.method) {
      case 'previewChangeDraft': {
        const [name, input] = params as [string, PreviewChangeDraftInput]
        const result = await kernel.changes.preview.execute({
          name,
          specId: input.specId,
          ...(input.artifactOverrides !== undefined
            ? { artifactOverrides: input.artifactOverrides }
            : {}),
        })
        return createIpcSuccess(envelope.id, {
          specId: input.specId,
          files: result.files.map(
            (file: { filename: string; base?: string | null; merged?: string }) => ({
              filename: file.filename,
              ...(file.base !== undefined && file.base !== null ? { base: file.base } : {}),
              ...(file.merged !== undefined ? { merged: file.merged } : {}),
            }),
          ),
        })
      }
      case 'outlineChangeArtifact': {
        const [name, filename, input = {}] = params as [string, string, OutlineChangeArtifactInput?]
        const outline = await kernel.changes.outlineArtifact.execute({
          name,
          filename,
          ...(input.content !== undefined ? { content: input.content } : {}),
        })
        return createIpcSuccess(envelope.id, outline)
      }
      case 'outlineSpecDraft': {
        const [workspace, specPath, input] = params as [string, string, OutlineSpecDraftInput]
        const outline = await kernel.specs.getOutline.execute({
          workspace,
          specPath: SpecPath.parse(specPath),
          filename: input.filename,
          content: input.content,
        })
        return createIpcSuccess(envelope.id, outline)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return createIpcFailure(envelope.id, { message })
  }
}

/**
 * Dispatches a non-draft-aware `SpecdDataPort` method over local IPC.
 *
 * @param envelope - IPC request envelope.
 * @returns Success or failure envelope.
 */
async function handlePortMethod(envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> {
  const kernel = await getKernel()
  const config = await getConfig()
  const params = Array.isArray(envelope.payload) ? envelope.payload : []

  switch (envelope.method) {
    case 'getProject':
      return createIpcSuccess(envelope.id, toProjectDto(config))
    case 'getProjectStatus': {
      const host = await getHost()
      const snapshot = await buildDesktopProjectStatusSnapshot(host)
      return createIpcSuccess(envelope.id, toProjectStatusDtoFromSnapshot(snapshot, host.config))
    }
    case 'listChanges': {
      const changes = await kernel.changes.list.execute()
      return createIpcSuccess(
        envelope.id,
        changes.map((change) => toChangeSummaryDto(change)),
      )
    }
    case 'listDrafts': {
      const drafts = await kernel.changes.listDrafts.execute()
      return createIpcSuccess(
        envelope.id,
        drafts.map((change) => toChangeSummaryDto(change)),
      )
    }
    case 'listDiscarded': {
      const discarded = await kernel.changes.listDiscarded.execute()
      return createIpcSuccess(
        envelope.id,
        discarded.map((change) => toChangeSummaryDto(change)),
      )
    }
    case 'listArchived': {
      const archived = await kernel.changes.listArchived.execute()
      return createIpcSuccess(
        envelope.id,
        archived.items.map((change) => ({
          name: change.name,
          state: 'archived',
          ...(change.description !== undefined
            ? { description: change.description }
            : { description: change.archivedName }),
          specIds: [...change.specIds],
          updatedAt: iso(change.archivedAt),
          blockerCount: 0,
        })),
      )
    }
    case 'createChange': {
      const [input] = params as [
        {
          name: string
          description?: string
          specIds?: readonly string[]
          schemaName?: string
          schemaVersion?: string
          invalidationPolicy?: 'none' | 'surgical' | 'downstream' | 'global'
        },
      ]
      const result = await kernel.changes.create.execute({
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        specIds: input.specIds ?? [],
        ...(input.invalidationPolicy !== undefined
          ? { invalidationPolicy: input.invalidationPolicy }
          : {}),
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result.change))
    }
    case 'getChange': {
      const [name] = params as [string]
      const change = await kernel.changes.repo.get(name)
      if (change === null) {
        throw new Error(`Change not found: ${name}`)
      }
      return createIpcSuccess(envelope.id, toChangeDetailDto(change))
    }
    case 'getChangeStatus': {
      const [name, options] = params as [
        string,
        { ifModifiedSince?: string; refreshImplementation?: boolean }?,
      ]
      const status = await kernel.changes.status.execute({
        name,
        ...(options?.ifModifiedSince !== undefined
          ? { ifModifiedSince: options.ifModifiedSince }
          : {}),
        ...(options?.refreshImplementation === false
          ? { refreshImplementationTracking: false }
          : {}),
      })
      return createIpcSuccess(envelope.id, toChangeStatusDto(status))
    }
    case 'listChangeArtifacts': {
      const [name] = params as [string]
      const change = await kernel.changes.repo.get(name)
      if (change === null) {
        throw new Error(`Change not found: ${name}`)
      }
      const taskMaps = await artifactTaskMapsForChange(kernel, name)
      return createIpcSuccess(envelope.id, toArtifactListDtoFromView(change, taskMaps))
    }
    case 'getChangeArtifact': {
      const [name, filename] = params as [string, string]
      const result = await kernel.changes.getArtifact.execute({ name, filename })
      return createIpcSuccess(envelope.id, toArtifactContentDto(filename, result))
    }
    case 'getDraft': {
      const [name] = params as [string]
      const draft = await kernel.changes.repo.getDraft(name)
      if (draft === null) {
        throw new Error(`Draft not found: ${name}`)
      }
      return createIpcSuccess(envelope.id, toChangeDetailDto(draft))
    }
    case 'getDraftStatus': {
      const [name, options] = params as [string, { ifModifiedSince?: string }?]
      const status = await kernel.changes.status.execute({
        name,
        ...(options?.ifModifiedSince !== undefined
          ? { ifModifiedSince: options.ifModifiedSince }
          : {}),
      })
      return createIpcSuccess(envelope.id, toChangeStatusDto(status))
    }
    case 'listDraftArtifacts': {
      const [name] = params as [string]
      const draft = await kernel.changes.repo.getDraft(name)
      if (draft === null) {
        throw new Error(`Draft not found: ${name}`)
      }
      const taskMaps = await artifactTaskMapsForChange(kernel, name)
      return createIpcSuccess(envelope.id, toArtifactListDtoFromView(draft, taskMaps))
    }
    case 'getDraftArtifact': {
      const [name, filename] = params as [string, string]
      const result = await kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'draft',
        name,
        filename,
      })
      return createIpcSuccess(envelope.id, toArtifactContentDto(filename, result))
    }
    case 'getDiscarded': {
      const [name] = params as [string]
      const discarded = await kernel.changes.repo.getDiscarded(name)
      if (discarded === null) {
        throw new Error(`Discarded change not found: ${name}`)
      }
      return createIpcSuccess(envelope.id, toChangeDetailDto(discarded))
    }
    case 'getDiscardedStatus': {
      const [name, options] = params as [string, { ifModifiedSince?: string }?]
      const status = await kernel.changes.status.execute({
        name,
        ...(options?.ifModifiedSince !== undefined
          ? { ifModifiedSince: options.ifModifiedSince }
          : {}),
      })
      return createIpcSuccess(envelope.id, toChangeStatusDto(status))
    }
    case 'listDiscardedArtifacts': {
      const [name] = params as [string]
      const discarded = await kernel.changes.repo.getDiscarded(name)
      if (discarded === null) {
        throw new Error(`Discarded change not found: ${name}`)
      }
      const taskMaps = await artifactTaskMapsForChange(kernel, name)
      return createIpcSuccess(envelope.id, toArtifactListDtoFromView(discarded, taskMaps))
    }
    case 'getDiscardedArtifact': {
      const [name, filename] = params as [string, string]
      const result = await kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'discarded',
        name,
        filename,
      })
      return createIpcSuccess(envelope.id, toArtifactContentDto(filename, result))
    }
    case 'getReadOnlyChangeArtifact': {
      const [name, filename, origin] = params as [
        string,
        string,
        'draft' | 'discarded' | 'archived',
      ]
      const result = await kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: origin,
        name,
        filename,
      })
      return createIpcSuccess(envelope.id, toArtifactContentDto(filename, result))
    }
    case 'getImplementationReview': {
      const [name] = params as [string]
      const result = await kernel.changes.getImplementationReview.execute({ name })
      return createIpcSuccess(envelope.id, toImplementationReviewDto(result))
    }
    case 'saveChangeArtifact': {
      const [name, filename, input] = params as [
        string,
        string,
        { content: string; originalHash: string; force?: boolean },
      ]
      const host = await getHost()
      const actor = await createVcsActorResolver(
        await createVcsAdapter(host.config.projectRoot),
      ).identity()
      const result = await kernel.changes.saveArtifact.execute({
        name,
        filename,
        content: input.content,
        originalHash: input.originalHash,
        actor,
        ...(input.force === true ? { force: true } : {}),
      })
      return createIpcSuccess(
        envelope.id,
        toSaveArtifactContentDto(filename, input.content, result),
      )
    }
    case 'validateChange': {
      const [name, input] = params as [string, { specId?: string; artifactId?: string }?]
      const result = await kernel.changes.validate.execute({
        name,
        ...(input?.specId !== undefined ? { specPath: input.specId } : {}),
        ...(input?.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
      })
      return createIpcSuccess(envelope.id, {
        passed: result.passed,
        failures: result.failures.map((failure) => ({
          message: failure.description,
          artifactId: failure.artifactId,
          ...(failure.filename !== undefined ? { path: failure.filename } : {}),
        })),
        warnings: result.warnings.map((warning) => warning.description),
        files: result.files.map((file) => file.filename),
      })
    }
    case 'validateChangeAll': {
      const [name, input] = params as [string, { artifactId?: string }?]
      const result = await kernel.changes.validateBatch.execute({
        name,
        ...(input?.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
      })
      return createIpcSuccess(envelope.id, toValidateBatchResultDto(result))
    }
    case 'patchChange': {
      const [name, input] = params as [
        string,
        {
          description?: string
          addSpecIds?: string[]
          removeSpecIds?: string[]
          invalidationPolicy?: 'none' | 'surgical' | 'downstream' | 'global'
        },
      ]
      const result = await kernel.changes.edit.execute({
        name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.addSpecIds !== undefined ? { addSpecIds: input.addSpecIds } : {}),
        ...(input.removeSpecIds !== undefined ? { removeSpecIds: input.removeSpecIds } : {}),
        ...(input.invalidationPolicy !== undefined
          ? { invalidationPolicy: input.invalidationPolicy }
          : {}),
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result.change))
    }
    case 'getArchivedChange': {
      const [name] = params as [string]
      const archived = await kernel.changes.getArchived.execute({ name })
      return createIpcSuccess(envelope.id, toArchivedChangeDetail(archived))
    }
    case 'listWorkspaces': {
      const workspaces = await kernel.project.listWorkspaces.execute()
      return createIpcSuccess(envelope.id, toWorkspaceSummaryDtos(config, workspaces))
    }
    case 'listSpecs': {
      const [workspace] = params as [string]
      const specs = await kernel.specs.list.execute({
        includeSummary: true,
        workspaces: [workspace],
      })
      return createIpcSuccess(envelope.id, toWorkspaceSpecTreeDto(workspace, specs))
    }
    case 'getSpec': {
      const [workspace, specPath] = params as [string, string]
      const [result, activeChanges] = await Promise.all([
        kernel.specs.get.execute({
          workspace,
          specPath: SpecPath.parse(specPath),
        }),
        kernel.changes.list.execute(),
      ])
      if (result === null) {
        throw new Error(`Spec not found: ${workspace}:${specPath}`)
      }
      const specId = `${workspace}:${specPath}`
      const metadata = await kernel.specs.repos.get(workspace)?.metadata(result.spec)
      return createIpcSuccess(
        envelope.id,
        toSpecDetailDto({
          specId,
          workspace,
          path: specPath,
          title: metadata?.title ?? specPath,
          ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
          dependsOn: metadata?.dependsOn ?? [],
          artifacts: [...result.artifacts.values()].map((artifact) => ({
            filename: artifact.filename,
            ...(artifact.originalHash !== undefined ? { hash: artifact.originalHash } : {}),
          })),
          linkedChanges: activeChanges
            .filter((change) => change.specIds.includes(specId))
            .map((change) => ({
              name: change.name,
              state: change.state,
              ...(change.description !== undefined ? { description: change.description } : {}),
            })),
        }),
      )
    }
    case 'getSpecOutline': {
      const [workspace, specPath, query] = params as [
        string,
        string,
        { filename?: string; artifactId?: string }?,
      ]
      const outline = await kernel.specs.getOutline.execute({
        workspace,
        specPath: SpecPath.parse(specPath),
        ...(query?.filename !== undefined ? { filename: query.filename } : {}),
        ...(query?.artifactId !== undefined ? { artifactId: query.artifactId } : {}),
      })
      return createIpcSuccess(envelope.id, outline)
    }
    case 'getSpecContext': {
      const [workspace, specPath] = params as [string, string]
      const config = await getConfig()
      const context = await kernel.specs.getContext.execute({
        workspace,
        specPath: SpecPath.parse(specPath),
        contextMode: 'full',
        sections: ['rules', 'constraints', 'scenarios'],
        llmOptimizedContext: config.llmOptimizedContext ?? false,
      })
      return createIpcSuccess(envelope.id, {
        entries: context.entries,
        warnings: context.warnings,
      })
    }
    case 'getSpecArtifact': {
      const [workspace, specPath, filename] = params as [string, string, string]
      const repo = kernel.specs.repos.get(workspace)
      if (repo === undefined) {
        throw new Error(`Workspace not found: ${workspace}`)
      }
      const result = await kernel.specs.get.execute({
        workspace,
        specPath: SpecPath.parse(specPath),
      })
      if (result === null) {
        throw new Error(`Spec not found: ${workspace}:${specPath}`)
      }
      const artifact = await repo.artifact(result.spec, filename)
      if (artifact === null) {
        throw new Error(`Spec artifact not found: ${workspace}:${specPath}/${filename}`)
      }
      return createIpcSuccess(
        envelope.id,
        toArtifactContentDto(filename, {
          content: artifact.content,
          originalHash: artifact.originalHash ?? '',
        }),
      )
    }
    case 'validateSpecs': {
      const [workspace, specPath] = params as [string, string | undefined]
      const result = await kernel.specs.validate.execute({
        ...(specPath !== undefined ? { specPath } : { workspace }),
      })
      return createIpcSuccess(envelope.id, {
        passed: result.failed === 0,
        totalSpecs: result.totalSpecs,
        passedCount: result.passed,
        failedCount: result.failed,
        entries: result.entries,
      })
    }
    case 'searchSpecs': {
      const [query] = params as [{ q: string; workspace?: string }]
      const results = await kernel.specs.search.execute(
        query.q,
        query.workspace !== undefined ? { workspaces: [query.workspace] } : undefined,
      )
      return createIpcSuccess(envelope.id, toSpecSummaryDtos(results))
    }
    case 'searchGraph': {
      const [query] = params as [
        {
          q: string
          workspace?: string
          kinds?: readonly string[]
          filePattern?: string
          excludePaths?: readonly string[]
          excludeWorkspaces?: readonly string[]
          symbols?: boolean
          specs?: boolean
          documents?: boolean
          limit?: number
        },
      ]
      const result = await withGraphProvider(async (provider) => {
        const config = await getConfig()
        const limit = query.limit ?? 10
        const searchOpts = {
          query: query.q,
          limit,
          ...(query.workspace !== undefined ? { workspace: query.workspace } : {}),
          ...(query.kinds !== undefined ? { kinds: [...query.kinds] as SymbolKind[] } : {}),
          ...(query.filePattern !== undefined ? { filePattern: query.filePattern } : {}),
          ...(query.excludePaths !== undefined ? { excludePaths: [...query.excludePaths] } : {}),
          ...(query.excludeWorkspaces !== undefined
            ? { excludeWorkspaces: [...query.excludeWorkspaces] }
            : {}),
        }
        const symbolsOnly = query.symbols === true
        const specsOnly = query.specs === true
        const documentsOnly = query.documents === true
        const [symbols, specs, documents] = await Promise.all([
          symbolsOnly || (!specsOnly && !documentsOnly)
            ? provider.searchSymbols(searchOpts)
            : Promise.resolve([]),
          specsOnly || (!symbolsOnly && !documentsOnly)
            ? provider.searchSpecs(searchOpts)
            : Promise.resolve([]),
          documentsOnly || (!symbolsOnly && !specsOnly)
            ? provider.searchDocuments(searchOpts)
            : Promise.resolve([]),
        ])
        return toGraphSearchResultDto(config, symbols, specs, documents)
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'getImpact': {
      const [query] = params as [
        {
          symbol?: string
          file?: string
          spec?: string
          direction?: 'dependents' | 'dependencies' | 'upstream' | 'downstream' | 'both'
          depth?: number
        },
      ]
      const direction =
        query.direction === 'dependencies'
          ? 'downstream'
          : query.direction === 'dependents' || query.direction === undefined
            ? 'upstream'
            : query.direction
      const maxDepth = query.depth ?? 3
      const result = await withGraphProvider(async (provider) => {
        const config = await getConfig()
        if (query.symbol !== undefined) {
          const impact = await provider.analyzeImpact(query.symbol, direction, maxDepth)
          return toGraphImpactDto(
            config,
            query.symbol,
            direction,
            impact,
            impact.affectedSymbols.map((symbol) => ({
              id: symbol.id,
              name: symbol.name,
              filePath: symbol.filePath,
              line: symbol.line,
              depth: symbol.depth,
              risk: impact.riskLevel,
            })),
          )
        }
        if (query.file !== undefined) {
          const impact = await provider.analyzeFileImpact(query.file, direction, maxDepth)
          return toGraphImpactDto(
            config,
            query.file,
            direction,
            impact,
            impact.affectedSymbols.map((symbol) => ({
              id: symbol.id,
              name: symbol.name,
              filePath: symbol.filePath,
              line: symbol.line,
              depth: symbol.depth,
              risk: impact.riskLevel,
            })),
          )
        }
        if (query.spec !== undefined) {
          const impact = await provider.analyzeSpecImpact(query.spec, direction, maxDepth)
          return toGraphImpactDto(
            config,
            query.spec,
            direction,
            impact,
            impact.affectedSymbols.map((symbol) => ({
              id: symbol.id,
              name: symbol.name,
              filePath: symbol.filePath,
              line: symbol.line,
              depth: symbol.depth,
              risk: impact.riskLevel,
            })),
            impact.affectedSpecs,
          )
        }
        throw new Error('Invalid graph impact request')
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'getGraphStatus': {
      const host = await getHost()
      assertGraphIndexUnlocked(host.config)
      const getGraphHealth = createGetGraphHealth()
      const workspaces = await kernel.project.listWorkspaces.execute()
      const result = await withGraphProvider(async (provider) => {
        const health = await getGraphHealth.execute({
          config: host.config,
          provider,
          codeGraphVersion,
          workspaces: [...workspaces],
          assertUnlocked: false,
        })
        return toGraphStatusDto(health)
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'indexGraph': {
      const [input = {}] = params as [GraphIndexInput?]
      const host = await getHost()
      const indexResult = await withGraphProvider(async (provider) => {
        await Promise.resolve(acquireGraphIndexLock(host.config))
        const workspaces = await host.kernel.project.listWorkspaces.execute()
        const graphConfig = buildProjectGraphConfig(host.config)
        const vcs = await createVcsAdapter(host.config.projectRoot).catch(() => null)
        const vcsRef = (await vcs?.ref()) ?? undefined
        const vcsRoot =
          vcs === null
            ? null
            : (() => {
                try {
                  return vcs.rootDir()
                } catch {
                  return null
                }
              })()
        const indexProjectGraph = createIndexProjectGraph()
        return indexProjectGraph.execute({
          provider,
          projectRoot: host.config.projectRoot,
          workspaces,
          graphConfig,
          codeGraphVersion,
          vcsRoot,
          ...(input?.force === true ? { force: true } : {}),
          ...(vcsRef !== undefined ? { vcsRef } : {}),
        })
      })
      return createIpcSuccess(envelope.id, toGraphIndexResultDto(indexResult))
    }
    case 'getHotspots': {
      const [query = {}] = params as [{ readonly minRisk?: string; readonly limit?: number }?]
      const result = await withGraphProvider(async (provider) => {
        const config = await getConfig()
        const hotspots = await provider.getHotspots({
          ...(query.minRisk !== undefined
            ? { minRisk: query.minRisk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
            : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
        })
        return hotspots.entries.map((entry) => ({
          ...entry,
          symbol: toGraphSymbolRefDto(config, entry.symbol),
        }))
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'getSpecGraphView': {
      const [workspace, specPath] = params as [string, string]
      const specId = `${workspace}:${specPath}`
      const spec = await kernel.specs.get.execute({
        workspace,
        specPath: SpecPath.parse(specPath),
      })
      if (spec === null) {
        throw new Error(`Spec not found: ${specId}`)
      }
      const result = await withGraphProvider(async (provider) => {
        const config = await getConfig()
        const coveredFiles = await provider.getCoveredFiles(specId)
        const coveredSymbols = await provider.getCoveredSymbols(specId)
        return {
          specId,
          files: coveredFiles.map((relation) => toGraphFileRefDto(config, relation.target)),
          symbols: (
            await Promise.all(
              coveredSymbols.map(async (relation) => {
                const symbol = await provider.getSymbol(relation.target)
                return symbol === undefined ? null : toGraphSymbolRefDto(config, symbol)
              }),
            )
          ).filter((entry) => entry !== null),
        }
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'getChangeGraphView': {
      const [name] = params as [string]
      const change = await kernel.changes.repo.get(name)
      if (change === null) {
        throw new Error(`Change not found: ${name}`)
      }
      const result = await withGraphProvider(async (provider) => {
        const config = await getConfig()
        const specs = await Promise.all(
          [...change.specIds].map(async (specId) => {
            const coveredFiles = (await provider.getCoveredFiles(specId)).map((relation) =>
              toGraphFileRefDto(config, relation.target),
            )
            const coveredSymbols = (
              await Promise.all(
                (await provider.getCoveredSymbols(specId)).map(async (relation) => {
                  const symbol = await provider.getSymbol(relation.target)
                  return symbol === undefined ? null : toGraphSymbolRefDto(config, symbol)
                }),
              )
            ).filter((entry) => entry !== null)
            return { specId, coveredFiles, coveredSymbols }
          }),
        )
        return toChangeGraphViewDto(name, [...change.specIds], specs)
      })
      return createIpcSuccess(envelope.id, result)
    }
    case 'detectOverlaps': {
      const result = await kernel.changes.detectOverlap.execute()
      return createIpcSuccess(envelope.id, {
        hasOverlap: result.hasOverlap,
        entries: result.entries.map((entry) => ({
          specId: entry.specId,
          changes: entry.changes.map((c) => ({
            name: c.name,
            state: c.state,
          })),
        })),
      })
    }
    case 'getChangeContext': {
      const [name, query = {}] = params as [string, ChangeContextQuery?]
      const status = await kernel.changes.status.execute({ name })
      const currentStep = status.change?.state ?? 'designing'

      const context = await kernel.changes.compile.execute({
        name,
        step: (query.step as ChangeState) ?? currentStep,
        followDeps: query.followDeps ?? true,
        depth: query.depth ?? 1,
        includeChangeSpecs: query.includeChangeSpecs ?? true,
      })
      return createIpcSuccess(envelope.id, {
        content: formatCompiledContextMarkdown(context),
        warnings: context.warnings,
      })
    }
    case 'previewChange': {
      const [name, query] = params as [string, PreviewChangeQuery]
      const result = await kernel.changes.preview.execute({
        name,
        specId: query.specId,
      })
      return createIpcSuccess(envelope.id, {
        specId: query.specId,
        files: result.files.map((file) => ({
          filename: file.filename,
          ...(file.base !== undefined && file.base !== null ? { base: file.base } : {}),
          ...(file.merged !== undefined ? { merged: file.merged } : {}),
        })),
      })
    }
    case 'getHookInstructions': {
      const [name] = params as [string]
      const status = await kernel.changes.status.execute({ name })
      if (!status.change) {
        throw new Error(`Change not found: ${name}`)
      }
      const context = await kernel.changes.getHookInstructions.execute({
        name,
        step: status.change.state,
        phase: 'pre',
      })
      return createIpcSuccess(envelope.id, toHookInstructionsDto(context))
    }
    case 'getArtifactInstruction': {
      const [name, artifactId] = params as [string, string]
      const context = await kernel.changes.getArtifactInstruction.execute({
        name,
        artifactId,
      })
      return createIpcSuccess(envelope.id, toArtifactInstructionDto(context))
    }
    case 'transitionChange': {
      const [name, input] = params as [string, TransitionChangeInput]
      const result = await kernel.changes.transition.execute({
        name,
        to: input.targetState as ChangeState,
        ...(input.skipHooks === 'all' ? { skipHookPhases: new Set(['all']) } : {}),
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result.change))
    }
    case 'draftChange': {
      const [name] = params as [string]
      const result = await kernel.changes.draft.execute({ name })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'restoreChange': {
      const [name] = params as [string]
      const result = await kernel.changes.restore.execute({ name })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'discardChange': {
      const [name, input = {}] = params as [string, { reason?: string }?]
      const result = await kernel.changes.discard.execute({
        name,
        reason: input.reason ?? 'Discarded via Studio Desktop',
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'archiveChange': {
      const [name] = params as [string]
      const result = await kernel.changes.archive.execute({ name })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result.archivedChange))
    }
    case 'approveSpec': {
      const [name, input = {}] = params as [string, { reason?: string }?]
      const result = await kernel.changes.approveSpec.execute({
        name,
        reason: input.reason ?? 'Approved via Studio Desktop',
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'approveSignoff': {
      const [name, input = {}] = params as [string, { reason?: string }?]
      const result = await kernel.changes.approveSignoff.execute({
        name,
        reason: input.reason ?? 'Signed off via Studio Desktop',
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'invalidateChange': {
      const [name, input = {}] = params as [string, { reason?: string }?]
      const result = await kernel.changes.invalidate.execute({
        name,
        reason: input.reason ?? 'Invalidated via Studio Desktop',
      })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result.change))
    }
    case 'skipArtifact': {
      const [name, artifactId] = params as [string, string]
      const result = await kernel.changes.skipArtifact.execute({ name, artifactId })
      return createIpcSuccess(envelope.id, toChangeDetailDto(result))
    }
    case 'updateSpecDependencies': {
      const [name, body] = params as [string, UpdateSpecDependenciesInput]
      const result = await kernel.changes.updateSpecDeps.execute({
        name,
        specId: body.specId,
        ...(body.add !== undefined ? { add: body.add } : {}),
        ...(body.remove !== undefined ? { remove: body.remove } : {}),
        ...(body.set !== undefined ? { set: body.set } : {}),
      })
      return createIpcSuccess(envelope.id, {
        name,
        specId: result.specId,
        dependsOn: [...result.dependsOn],
      })
    }
    case 'updateImplementationTracking': {
      const [name, body] = params as [string, UpdateImplementationTrackingInput]
      const result = await kernel.changes.updateImplementationTracking.execute({
        name,
        action: body.action,
        file: body.file,
        ...(body.specId !== undefined ? { specId: body.specId } : {}),
        ...(body.symbols !== undefined ? { symbols: body.symbols } : {}),
      })
      return createIpcSuccess(envelope.id, {
        name,
        implementationTracking: result.implementationTracking,
      })
    }
    case 'readProjectLogs': {
      const [options] = params as [{ readonly limit?: number; readonly prettier?: boolean }?]
      const read = kernel.logs?.read
      if (read === undefined) {
        throw new Error('Log ring is not configured in desktop kernel')
      }
      const limit = options?.limit ?? 500
      const prettier = options?.prettier ?? false
      const result = read.execute({ limit, prettier })
      return createIpcSuccess(envelope.id, result)
    }
    case 'appendProjectLog': {
      const [input] = params as [AppendProjectLogInput]
      const level = input.level ?? 'debug'
      const message = input.message?.trim()
      const context = input.context ?? {}
      const log = Logger.child({ source: 'studio-desktop' })
      switch (level) {
        case 'debug':
          log.debug(message, context)
          break
        case 'info':
          log.info(message, context)
          break
        case 'warn':
          log.warn(message, context)
          break
        case 'error':
          log.error(message, context)
          break
      }
      return createIpcSuccess(envelope.id, null)
    }
    default:
      if (isDraftAwareIpcMethod(envelope.method)) {
        return handleDraftAwarePort(envelope)
      }
      return createIpcFailure(envelope.id, {
        message: `IPC method not implemented: ${envelope.method}`,
      })
  }
}

let sessionChangeCallback: ((session: { kind: 'local'; path: string } | null) => void) | undefined =
  undefined

export function onSessionChangeMain(
  callback: (session: { kind: 'local'; path: string } | null) => void,
): void {
  sessionChangeCallback = callback
}

function notifySessionChanged(session: { kind: 'local'; path: string } | null): void {
  if (sessionChangeCallback) {
    sessionChangeCallback(session)
  }
}

/**
 * Dispatches a single IPC envelope.
 *
 * @param envelope - Request from the renderer preload.
 * @returns IPC response envelope.
 */
export async function dispatchIpc(envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> {
  if (envelope.method === 'ping') {
    return createIpcSuccess(envelope.id, { pong: true })
  }
  try {
    if (envelope.method === 'storage:get') {
      const { key } = envelope.payload as { key: string }
      const value = await getSetting(key)
      return createIpcSuccess(envelope.id, value)
    }
    if (envelope.method === 'storage:set') {
      const { key, value } = envelope.payload as { key: string; value: unknown }
      await setSetting(key, value)
      return createIpcSuccess(envelope.id, null)
    }
    if (envelope.method === 'storage:remove') {
      const { key } = envelope.payload as { key: string }
      await removeSetting(key)
      return createIpcSuccess(envelope.id, null)
    }
    if (envelope.method === 'getCurrentSession') {
      return createIpcSuccess(
        envelope.id,
        activeProjectRoot ? { kind: 'local', path: activeProjectRoot } : null,
      )
    }
    if (envelope.method === 'getRecents') {
      const recents = await readRecents()
      return createIpcSuccess(envelope.id, recents)
    }
    if (envelope.method === 'addRecent') {
      const entry = envelope.payload as RecentConnection
      const recents = await addRecentConnection(entry)
      notifySessionChanged(activeProjectRoot ? { kind: 'local', path: activeProjectRoot } : null)
      return createIpcSuccess(envelope.id, recents)
    }
    if (envelope.method === 'removeRecent') {
      const entry = envelope.payload as RecentConnection
      const recents = await removeRecentConnection(entry)
      notifySessionChanged(activeProjectRoot ? { kind: 'local', path: activeProjectRoot } : null)
      return createIpcSuccess(envelope.id, recents)
    }
    if (envelope.method === 'clearRecents') {
      await clearRecentConnections()
      notifySessionChanged(activeProjectRoot ? { kind: 'local', path: activeProjectRoot } : null)
      return createIpcSuccess(envelope.id, [])
    }
    if (envelope.method === 'openDirectory') {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return createIpcSuccess(envelope.id, { canceled: true })
      }
      const dir = result.filePaths[0]!

      try {
        const loader = await createDefaultConfigLoader({ startDir: dir })
        const tempConfig = await loader.load()

        resetDesktopKernel()
        activeProjectRoot = dir

        await addRecentConnection({ kind: 'local', path: dir })
        notifySessionChanged({ kind: 'local', path: dir })

        return createIpcSuccess(envelope.id, {
          canceled: false,
          path: dir,
          project: toProjectDto(tempConfig),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return createIpcFailure(envelope.id, {
          message: `Selected folder is not a valid SpecD project: ${msg}`,
        })
      }
    }
    if (envelope.method === 'openLocalProject') {
      const dir = envelope.payload as string
      try {
        const loader = await createDefaultConfigLoader({ startDir: dir })
        const tempConfig = await loader.load()

        resetDesktopKernel()
        activeProjectRoot = dir

        await addRecentConnection({ kind: 'local', path: dir })
        notifySessionChanged({ kind: 'local', path: dir })

        return createIpcSuccess(envelope.id, {
          path: dir,
          project: toProjectDto(tempConfig),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return createIpcFailure(envelope.id, {
          message: `Failed to open project: ${msg}`,
        })
      }
    }
    if (envelope.method === 'closeSession') {
      activeProjectRoot = undefined
      resetDesktopKernel()
      notifySessionChanged(null)
      return createIpcSuccess(envelope.id, { closed: true })
    }

    return await handlePortMethod(envelope)
  } catch (err) {
    if (err instanceof SessionSupersededError) {
      return createIpcFailure(envelope.id, { message: 'Session changed; request cancelled' })
    }
    const message = err instanceof Error ? err.message : String(err)
    return createIpcFailure(envelope.id, { message })
  }
}

/**
 * Resets SDK host and graph state after a project switch or teardown.
 */
export function resetDesktopKernel(): void {
  sessionGeneration += 1
  hostPromise = undefined
  logRing = undefined
  for (const provider of openGraphProviders) {
    void provider.close().catch(() => undefined)
  }
  openGraphProviders.clear()
}
